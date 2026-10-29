/**
 * Upload Engine - uploads files to Google Drive with resumable, chunked requests
 * Runs several files at once, picks up from the last byte Drive confirmed after
 * a network drop, and backs off on rate limits and server errors
 */

import type {
  DriveClient,
  DriveFile,
  NewFileMeta,
  RemoteFile,
  SessionState,
} from './drive-types.js';
import { DriveError } from './drive-types.js';
import type { ExistingFiles } from '../types/storage.types.js';

export type JobStatus =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'retrying'
  | 'offline'
  | 'done'
  | 'skipped'
  | 'failed'
  | 'cancelled'
  /** Restored after a restart; waiting for the file to be picked again */
  | 'needs-file';

/** Upload state that survives a restart */
export interface UploadJob {
  id: string;
  name: string;
  /** Path inside the dropped folder, e.g. "Photos/2024/a.jpg" */
  relativePath: string;
  size: number;
  lastModified: number;
  mimeType: string;
  destinationId: string;
  status: JobStatus;
  uploadedBytes: number;
  sessionUri?: string;
  /** Drive file this upload becomes a new version of */
  replaceId?: string;
  driveFile?: DriveFile;
  error?: string;
  /** When the next automatic retry happens (ms since epoch) */
  retryAt?: number;
  addedAt: number;
}

export interface StoredJob extends UploadJob {
  handle?: FileSystemFileHandle;
  /** Folder the file was picked from; one permission prompt covers all its files */
  rootHandle?: FileSystemDirectoryHandle;
}

export interface JobStore {
  save(job: StoredJob): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface UploadSource {
  file: File;
  relativePath: string;
  handle?: FileSystemFileHandle | undefined;
  rootHandle?: FileSystemDirectoryHandle | undefined;
}

export interface EngineStats {
  totalBytes: number;
  uploadedBytes: number;
  /** Bytes per second over the last few seconds */
  speed: number;
  /** Seconds left at the current speed, null when unknown */
  secondsLeft: number | null;
  active: number;
  waiting: number;
  done: number;
  skipped: number;
  failed: number;
}

export interface EngineDeps {
  drive: DriveClient;
  store?: JobStore;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  isOnline?: () => boolean;
  waitForOnline?: (signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

/** Drive requires chunks in multiples of 256 KiB */
const CHUNK_UNIT = 256 * 1024;
const MIN_CHUNK = 4 * CHUNK_UNIT;
const START_CHUNK = 32 * CHUNK_UNIT;
const MAX_CHUNK = 256 * CHUNK_UNIT;

/** Grow chunks that finish faster than this, shrink ones slower than SLOW (ms) */
const FAST_CHUNK_MS = 4000;
const SLOW_CHUNK_MS = 20000;

/** Consecutive failures without progress before a file is marked failed (~15 min) */
const MAX_ATTEMPTS = 20;
const MAX_BACKOFF_MS = 60000;

const SPEED_WINDOW_MS = 5000;
const MIN_SPEED_WINDOW_MS = 500;

const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set([
  'preparing',
  'uploading',
  'retrying',
  'offline',
]);

interface Job extends StoredJob {
  file?: File;
  controller?: AbortController;
  chunkSize: number;
  attempts: number;
}

export class UploadEngine {
  private readonly drive: DriveClient;
  private readonly store: JobStore | undefined;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly isOnline: () => boolean;
  private readonly waitForOnline: (signal: AbortSignal) => Promise<void>;
  private readonly now: () => number;

  private jobs: Map<string, Job> = new Map();
  private running: Set<string> = new Set();
  private concurrency = 3;
  /** Strictly increasing, so files added together keep their order after a restart */
  private lastAddedAt = 0;
  private existingFiles: ExistingFiles = 'skip';

  /** Folder IDs by parent ID + name, shared so parallel files don't create duplicates */
  private folderCache: Map<string, Promise<string>> = new Map();
  /** Files already in each folder, by name */
  private existingCache: Map<string, Promise<Map<string, RemoteFile[]>>> =
    new Map();

  /** Bytes sent, with when, over the last few seconds */
  private speedSamples: Array<{ time: number; bytes: number }> = [];
  /** When the current run of uploads started, so the first seconds aren't averaged over idle time */
  private activeSince = 0;
  private wasBusy = false;

  private changeListeners: Set<() => void> = new Set();
  private idleListeners: Set<(jobs: UploadJob[]) => void> = new Set();

  constructor(deps: EngineDeps) {
    this.drive = deps.drive;
    this.store = deps.store;
    this.sleep = deps.sleep ?? abortableSleep;
    this.isOnline = deps.isOnline ?? (() => navigator.onLine);
    this.waitForOnline = deps.waitForOnline ?? waitForOnlineEvent;
    this.now = deps.now ?? Date.now;
  }

  /** Called on every state or progress change */
  public onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Called when the last running upload settles */
  public onIdle(listener: (jobs: UploadJob[]) => void): () => void {
    this.idleListeners.add(listener);
    return () => this.idleListeners.delete(listener);
  }

  public setConcurrency(count: number): void {
    this.concurrency = Math.min(6, Math.max(1, Math.round(count)));
    // Fewer at a time: the extra uploads go back to waiting, keeping their
    // sessions, so they continue from what Drive has when their turn comes
    const running = [...this.jobs.values()].filter(
      (job) => this.running.has(job.id) && job.status !== 'queued'
    );
    for (const job of running.slice(this.concurrency)) {
      job.controller?.abort();
      this.update(job, { status: 'queued', retryAt: undefined });
    }
    this.pump();
  }

  /** What to do when the folder already has a file with the same name */
  public setExistingFiles(policy: ExistingFiles): void {
    this.existingFiles = policy;
  }

  /**
   * Queue files for upload into a destination folder. A file matching an
   * interrupted upload (same path, size and modified time) continues it instead.
   */
  public add(sources: UploadSource[], destinationId: string): void {
    for (const source of sources) {
      const resumable = [...this.jobs.values()].find(
        (job) =>
          job.status === 'needs-file' &&
          job.destinationId === destinationId &&
          job.relativePath === source.relativePath &&
          job.size === source.file.size &&
          job.lastModified === source.file.lastModified
      );
      if (resumable) {
        this.attach(resumable, source);
        continue;
      }

      const job: Job = {
        id: makeId(),
        name: source.file.name,
        relativePath: source.relativePath,
        size: source.file.size,
        lastModified: source.file.lastModified,
        mimeType: source.file.type || 'application/octet-stream',
        destinationId,
        status: 'queued',
        uploadedBytes: 0,
        addedAt: this.nextAddedAt(),
        file: source.file,
        chunkSize: START_CHUNK,
        attempts: 0,
      };
      if (source.handle) {
        job.handle = source.handle;
      }
      if (source.rootHandle) {
        job.rootHandle = source.rootHandle;
      }
      this.jobs.set(job.id, job);
      this.persist(job);
    }
    this.pump();
  }

  /**
   * Bring back uploads saved before a restart; they wait for their files
   */
  public restore(records: StoredJob[]): void {
    const inOrder = [...records].sort((a, b) => a.addedAt - b.addedAt);
    for (const record of inOrder) {
      if (this.jobs.has(record.id)) {
        continue;
      }
      const job: Job = {
        ...record,
        status: 'needs-file',
        chunkSize: START_CHUNK,
        attempts: 0,
      };
      delete job.retryAt;
      this.jobs.set(job.id, job);
    }
    this.emitChange();
  }

  /**
   * Give a restored upload its file back. Returns false if the file changed.
   */
  public reattach(
    id: string,
    file: File,
    handle?: FileSystemFileHandle
  ): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'needs-file') {
      return false;
    }
    if (file.size !== job.size || file.lastModified !== job.lastModified) {
      return false;
    }
    this.attach(job, { file, relativePath: job.relativePath, handle });
    this.pump();
    return true;
  }

  /** Restored uploads that still need their file */
  public waitingForFiles(): StoredJob[] {
    return [...this.jobs.values()]
      .filter((job) => job.status === 'needs-file')
      .map((job) => ({ ...toPublic(job), ...handlesOf(job) }));
  }

  public pause(id: string): void {
    const job = this.jobs.get(id);
    if (!job || !(job.status === 'queued' || ACTIVE_STATUSES.has(job.status))) {
      return;
    }
    job.controller?.abort();
    this.update(job, { status: 'paused' });
  }

  public resume(id: string): void {
    const job = this.jobs.get(id);
    if (job?.status === 'paused') {
      this.update(job, { status: 'queued' });
      this.pump();
    }
  }

  public retry(id: string): void {
    const job = this.jobs.get(id);
    if (job?.status === 'failed') {
      job.attempts = 0;
      this.update(job, { status: 'queued', error: undefined });
      this.pump();
    }
  }

  public cancel(id: string): void {
    const job = this.jobs.get(id);
    if (!job || isFinished(job.status)) {
      return;
    }
    job.controller?.abort();
    if (job.sessionUri) {
      void this.drive.cancelSession(job.sessionUri).catch(() => undefined);
    }
    this.update(job, { status: 'cancelled' });
  }

  public pauseAll(): void {
    this.jobs.forEach((job) => this.pause(job.id));
  }

  public resumeAll(): void {
    this.jobs.forEach((job) => {
      if (job.status === 'paused') {
        job.status = 'queued';
      }
    });
    this.emitChange();
    this.pump();
  }

  /** Drop finished uploads from the list, and failed ones from storage too */
  public clearFinished(): void {
    for (const [id, job] of this.jobs) {
      if (isFinished(job.status)) {
        this.jobs.delete(id);
        if (job.status === 'failed') {
          void this.store?.remove(id).catch(() => undefined);
        }
      }
    }
    this.emitChange();
  }

  public list(): UploadJob[] {
    return [...this.jobs.values()].map(toPublic);
  }

  /** True while anything is uploading or waiting to upload */
  public isBusy(): boolean {
    return [...this.jobs.values()].some(
      (job) => job.status === 'queued' || ACTIVE_STATUSES.has(job.status)
    );
  }

  public stats(): EngineStats {
    const stats: EngineStats = {
      totalBytes: 0,
      uploadedBytes: 0,
      speed: this.speed(),
      secondsLeft: null,
      active: 0,
      waiting: 0,
      done: 0,
      skipped: 0,
      failed: 0,
    };
    for (const job of this.jobs.values()) {
      if (job.status === 'cancelled' || job.status === 'needs-file') {
        continue;
      }
      stats.totalBytes += job.size;
      stats.uploadedBytes +=
        isFinished(job.status) && job.status !== 'failed'
          ? job.size
          : job.uploadedBytes;
      if (ACTIVE_STATUSES.has(job.status)) stats.active += 1;
      else if (job.status === 'queued' || job.status === 'paused')
        stats.waiting += 1;
      else if (job.status === 'done') stats.done += 1;
      else if (job.status === 'skipped') stats.skipped += 1;
      else if (job.status === 'failed') stats.failed += 1;
    }
    if (stats.speed > 0) {
      stats.secondsLeft = Math.ceil(
        (stats.totalBytes - stats.uploadedBytes) / stats.speed
      );
    }
    return stats;
  }

  private nextAddedAt(): number {
    this.lastAddedAt = Math.max(this.now(), this.lastAddedAt + 1);
    return this.lastAddedAt;
  }

  private attach(job: Job, source: UploadSource): void {
    job.file = source.file;
    if (source.handle) {
      job.handle = source.handle;
    }
    this.update(job, { status: 'queued', error: undefined });
  }

  /** Start queued uploads until the parallel limit is reached */
  private pump(): void {
    for (const job of this.jobs.values()) {
      if (this.running.size >= this.concurrency) {
        break;
      }
      if (job.status === 'queued' && job.file && !this.running.has(job.id)) {
        if (!this.running.size) {
          this.activeSince = this.now();
        }
        this.running.add(job.id);
        void this.run(job);
      }
    }
    this.checkIdle();
  }

  private async run(job: Job): Promise<void> {
    const controller = new AbortController();
    job.controller = controller;
    const { signal } = controller;

    try {
      for (;;) {
        try {
          this.update(job, { status: 'preparing', retryAt: undefined });
          const parentId = await this.ensureFolder(
            job.destinationId,
            parentPath(job.relativePath)
          );
          if (signal.aborted) return;

          if (!job.sessionUri && this.existingFiles !== 'keep') {
            const existing = await this.findExisting(parentId, job);
            if (signal.aborted) return;
            if (existing === 'same') {
              this.update(job, { status: 'skipped', uploadedBytes: job.size });
              return;
            }
            this.update(job, { replaceId: existing?.id });
          }

          const file = await this.transfer(job, parentId, signal);
          this.rememberUploaded(parentId, job, file);
          this.update(job, {
            status: 'done',
            uploadedBytes: job.size,
            driveFile: file,
          });
          return;
        } catch (error) {
          if (signal.aborted) return;

          const retryable =
            error instanceof DriveError
              ? error.retryable
              : isNetworkError(error);
          if (retryable && !this.isOnline()) {
            // Waiting for the network doesn't use up attempts
            this.update(job, { status: 'offline', error: undefined });
            await this.waitForOnline(signal);
          } else if (!retryable || ++job.attempts >= MAX_ATTEMPTS) {
            this.update(job, { status: 'failed', error: describeError(error) });
            return;
          } else {
            const delay = backoff(job.attempts);
            this.update(job, {
              status: 'retrying',
              retryAt: this.now() + delay,
              error: describeError(error),
            });
            await this.sleep(delay, signal);
          }
          if (signal.aborted) return;
        }
      }
    } catch (error) {
      // sleep/waitForOnline reject when aborted (pause/cancel)
      if (!signal.aborted) {
        this.update(job, { status: 'failed', error: describeError(error) });
      }
    } finally {
      if (job.controller === controller) {
        delete job.controller;
      }
      this.running.delete(job.id);
      this.pump();
    }
  }

  /**
   * Send the file in chunks, resuming an existing session when there is one
   */
  private async transfer(
    job: Job,
    parentId: string,
    signal: AbortSignal
  ): Promise<DriveFile> {
    const file = job.file;
    if (!file) {
      throw new Error('File is not available');
    }
    const meta = (): NewFileMeta => ({
      name: job.name,
      parentId,
      mimeType: job.mimeType,
      size: job.size,
      modifiedTime: job.lastModified,
      ...(job.replaceId ? { replaceId: job.replaceId } : {}),
    });

    if (job.size === 0) {
      return this.withoutGoneFile(job, () =>
        this.drive.createEmptyFile(meta(), signal)
      );
    }

    for (;;) {
      let state: SessionState;
      if (job.sessionUri) {
        state = await this.drive.querySession(job.sessionUri, job.size, signal);
      } else {
        const sessionUri = await this.withoutGoneFile(job, () =>
          this.drive.startSession(meta(), signal)
        );
        this.update(job, { sessionUri, uploadedBytes: 0 });
        state = { kind: 'incomplete', offset: 0 };
      }

      while (state.kind === 'incomplete') {
        const offset = state.offset;
        this.update(job, {
          status: 'uploading',
          uploadedBytes: offset,
          error: undefined,
        });

        const end = Math.min(offset + job.chunkSize, job.size);
        const startedAt = this.now();
        let reported = 0;
        state = await this.drive.putChunk(
          job.sessionUri as string,
          file.slice(offset, end),
          offset,
          job.size,
          (loaded) => {
            this.countSent(loaded - reported);
            reported = loaded;
            job.uploadedBytes = Math.min(offset + loaded, job.size);
            this.emitChange();
          },
          signal
        );
        // Count bytes Chrome didn't report progress for, so speed stays accurate
        this.countSent(end - offset - reported);

        if (state.kind === 'incomplete' && state.offset > offset) {
          job.attempts = 0;
          this.adaptChunk(job, end - offset, this.now() - startedAt);
          job.uploadedBytes = state.offset;
          this.persist(job);
        }
      }

      if (state.kind === 'complete') {
        return state.file;
      }

      // Session expired (Drive keeps them about a week): start over
      this.update(job, { sessionUri: undefined, uploadedBytes: 0 });
    }
  }

  /**
   * Run a request that may target a file to replace; if that file is gone
   * from Drive since the folder was listed, upload a new file instead
   */
  private async withoutGoneFile<T>(
    job: Job,
    request: () => Promise<T>
  ): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (
        !job.replaceId ||
        !(error instanceof DriveError) ||
        error.status !== 404
      ) {
        throw error;
      }
      this.update(job, { replaceId: undefined });
      return request();
    }
  }

  /** Bigger chunks on fast links mean fewer round trips; smaller ones lose less on a drop */
  private adaptChunk(job: Job, sent: number, elapsed: number): void {
    if (sent < job.chunkSize) {
      return;
    }
    if (elapsed < FAST_CHUNK_MS && job.chunkSize < MAX_CHUNK) {
      job.chunkSize *= 2;
    } else if (elapsed > SLOW_CHUNK_MS && job.chunkSize > MIN_CHUNK) {
      job.chunkSize /= 2;
    }
  }

  private ensureFolder(rootId: string, path: string): Promise<string> {
    let parent: Promise<string> = Promise.resolve(rootId);
    for (const name of path.split('/').filter(Boolean)) {
      parent = parent.then((parentId) => {
        const key = `${parentId}\u0000${name}`;
        let folder = this.folderCache.get(key);
        if (!folder) {
          folder = this.drive
            .findFolder(parentId, name)
            .then((found) => found ?? this.drive.createFolder(parentId, name));
          this.folderCache.set(key, folder);
          folder.catch(() => this.folderCache.delete(key));
        }
        return folder;
      });
    }
    return parent;
  }

  /**
   * 'same' when the folder already has this file, the file to replace when
   * replacing a same-name file, or null to upload a new file
   */
  private async findExisting(
    parentId: string,
    job: Job
  ): Promise<'same' | RemoteFile | null> {
    let existing = this.existingCache.get(parentId);
    if (!existing) {
      existing = this.drive.listFiles(parentId).then((files) => {
        const byName = new Map<string, RemoteFile[]>();
        files.forEach((file) =>
          byName.set(file.name, [...(byName.get(file.name) ?? []), file])
        );
        return byName;
      });
      this.existingCache.set(parentId, existing);
      existing.catch(() => this.existingCache.delete(parentId));
    }
    const sameName = (await existing).get(job.name) ?? [];

    if (this.existingFiles === 'skip') {
      return sameName.some((file) => file.size === job.size) ? 'same' : null;
    }
    // Replace: leave unchanged files alone (same size and modified time)
    if (
      sameName.some(
        (file) =>
          file.size === job.size && file.modifiedTime === job.lastModified
      )
    ) {
      return 'same';
    }
    return (
      sameName.reduce<RemoteFile | null>(
        (newest, file) =>
          !newest || file.modifiedTime > newest.modifiedTime ? file : newest,
        null
      ) ?? null
    );
  }

  private rememberUploaded(parentId: string, job: Job, file: DriveFile): void {
    void this.existingCache.get(parentId)?.then((byName) => {
      const uploaded: RemoteFile = {
        id: file.id,
        name: job.name,
        size: job.size,
        modifiedTime: job.lastModified,
      };
      const others = (byName.get(job.name) ?? []).filter(
        (existing) => existing.id !== file.id
      );
      byName.set(job.name, [...others, uploaded]);
    });
  }

  private update(job: Job, changes: Partial<UploadJob>): void {
    const statusChanged =
      changes.status !== undefined && changes.status !== job.status;
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) {
        delete (job as unknown as Record<string, unknown>)[key];
      } else {
        (job as unknown as Record<string, unknown>)[key] = value;
      }
    }
    if (statusChanged || 'sessionUri' in changes) {
      this.persist(job);
    }
    this.emitChange();
    if (statusChanged) {
      this.checkIdle();
    }
  }

  private persist(job: Job): void {
    if (!this.store) {
      return;
    }
    const task =
      isFinished(job.status) && job.status !== 'failed'
        ? this.store.remove(job.id)
        : this.store.save({ ...toPublic(job), ...handlesOf(job) });
    void task.catch(() => undefined);
  }

  private countSent(bytes: number): void {
    if (bytes <= 0) {
      return;
    }
    const time = this.now();
    this.speedSamples.push({ time, bytes });
    while ((this.speedSamples[0]?.time ?? time) < time - SPEED_WINDOW_MS) {
      this.speedSamples.shift();
    }
  }

  private speed(): number {
    if (!this.running.size) {
      return 0;
    }
    // Measured up to now, so a stalled upload shows its speed dropping
    const now = this.now();
    const since = Math.max(now - SPEED_WINDOW_MS, this.activeSince);
    const bytes = this.speedSamples
      .filter((sample) => sample.time >= since)
      .reduce((sum, sample) => sum + sample.bytes, 0);
    const elapsed = now - since;
    return elapsed >= MIN_SPEED_WINDOW_MS ? (bytes * 1000) / elapsed : 0;
  }

  private checkIdle(): void {
    const busy = this.isBusy();
    if (this.wasBusy && !busy) {
      const jobs = this.list();
      this.idleListeners.forEach((listener) => listener(jobs));
    }
    this.wasBusy = busy;
  }

  private emitChange(): void {
    this.changeListeners.forEach((listener) => listener());
  }
}

function isFinished(status: JobStatus): boolean {
  return (
    status === 'done' ||
    status === 'skipped' ||
    status === 'cancelled' ||
    status === 'failed'
  );
}

function toPublic(job: Job): UploadJob {
  const {
    file: _file,
    handle: _handle,
    rootHandle: _rootHandle,
    controller: _controller,
    chunkSize: _chunk,
    attempts: _attempts,
    ...rest
  } = job;
  return { ...rest };
}

function handlesOf(job: Job): Pick<StoredJob, 'handle' | 'rootHandle'> {
  return {
    ...(job.handle ? { handle: job.handle } : {}),
    ...(job.rootHandle ? { rootHandle: job.rootHandle } : {}),
  };
}

function parentPath(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/');
  return slash === -1 ? '' : relativePath.slice(0, slash);
}

/** 1s, 2s, 4s ... capped at a minute, with jitter so parallel files don't retry in lockstep */
function backoff(attempt: number): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempt - 1));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function describeError(error: unknown): string {
  if (error instanceof DriveError) {
    return FRIENDLY_REASONS[error.reason] ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

const FRIENDLY_REASONS: Record<string, string> = {
  storageQuotaExceeded: 'Your Google storage is full',
  quotaExceeded: 'Your Google storage is full',
  uploadLimitExceeded:
    'Drive daily upload limit reached (750 GB). Try again tomorrow',
  notFound: 'No access to the destination folder. Choose it again',
  insufficientFilePermissions: 'No permission to add files to this folder',
  stalled: 'Connection stalled',
  network: 'Network connection lost',
};

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function waitForOnlineEvent(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOnline = (): void => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = (): void => {
      window.removeEventListener('online', onOnline);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    window.addEventListener('online', onOnline, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
