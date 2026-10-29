/**
 * In-memory Drive that follows the resumable upload protocol, with failure injection
 */

import type {
  DriveClient,
  DriveFile,
  NewFileMeta,
  RemoteFile,
  SessionState,
} from '../src/uploader/drive-types.js';
import { DriveError } from '../src/uploader/drive-types.js';

const UNIT = 256 * 1024;

interface Session {
  meta: NewFileMeta;
  bytes: Uint8Array;
  stored: number;
  file?: DriveFile;
  expired: boolean;
}

/** Returning an action makes the matching call misbehave */
export type Fault =
  | { type: 'network' }
  | { type: 'status'; status: number; reason?: string }
  /** Store part of the chunk (rounded down to 256 KiB), then drop the connection */
  | { type: 'partial'; fraction: number }
  | { type: 'expire' };

export class FakeDrive implements DriveClient {
  public sessions: Map<string, Session> = new Map();
  public folders: Map<string, { id: string; name: string; parentId: string }> =
    new Map();
  public files: Array<{
    id: string;
    name: string;
    parentId: string;
    bytes: Uint8Array;
  }> = [];
  /** What listFiles returns per folder */
  public existing: Map<string, RemoteFile[]> = new Map();
  /** File IDs deleted from Drive; replacing them fails with 404 */
  public gone: Set<string> = new Set();
  /** File IDs that received a new version */
  public replaced: string[] = [];
  public inFlight = 0;
  public maxInFlight = 0;
  public sessionsStarted = 0;
  public cancelled: string[] = [];
  public calls: string[] = [];
  /** Decide a fault for each chunk PUT: (fileName, chunkNumber) */
  public chunkFault: (name: string, chunk: number) => Fault | null = () => null;
  public startFault: (name: string) => Fault | null = () => null;
  /** Hold each chunk this long, so parallel uploads overlap (ms) */
  public chunkDelay = 2;
  private chunkCounts: Map<string, number> = new Map();
  private nextId = 1;

  async startSession(meta: NewFileMeta, signal?: AbortSignal): Promise<string> {
    await tick(signal);
    const fault = this.startFault(meta.name);
    if (fault?.type === 'network') throw new TypeError('Failed to fetch');
    if (fault?.type === 'status')
      throw new DriveError(fault.status, fault.reason ?? '', 'start failed');
    if (meta.replaceId && this.gone.has(meta.replaceId))
      throw new DriveError(404, 'notFound', 'File not found');
    const uri = `https://upload.example/session/${this.nextId++}`;
    this.sessions.set(uri, {
      meta,
      bytes: new Uint8Array(meta.size),
      stored: 0,
      expired: false,
    });
    this.sessionsStarted += 1;
    this.calls.push(
      meta.replaceId ? `replace:${meta.replaceId}` : `start:${meta.name}`
    );
    return uri;
  }

  async putChunk(
    sessionUri: string,
    chunk: Blob,
    start: number,
    total: number,
    onProgress: (loaded: number) => void,
    signal?: AbortSignal
  ): Promise<SessionState> {
    const session = this.sessions.get(sessionUri);
    if (!session) throw new DriveError(404, 'notFound', 'no session');
    const count = (this.chunkCounts.get(session.meta.name) ?? 0) + 1;
    this.chunkCounts.set(session.meta.name, count);

    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await sleep(this.chunkDelay, signal);
      if (session.expired) return { kind: 'expired' };
      if (start !== session.stored) {
        throw new Error(
          `chunk for ${session.meta.name} starts at ${start}, Drive has ${session.stored}`
        );
      }
      const data = new Uint8Array(await chunk.arrayBuffer());
      const fault = this.chunkFault(session.meta.name, count);

      if (fault?.type === 'expire') {
        session.expired = true;
        return { kind: 'expired' };
      }
      if (fault?.type === 'network') throw new TypeError('Failed to fetch');
      if (fault?.type === 'status')
        throw new DriveError(
          fault.status,
          fault.reason ?? '',
          `HTTP ${fault.status}`
        );
      if (fault?.type === 'partial') {
        const keep = Math.floor((data.length * fault.fraction) / UNIT) * UNIT;
        session.bytes.set(data.subarray(0, keep), start);
        session.stored = start + keep;
        onProgress(Math.floor(data.length * fault.fraction));
        throw new TypeError('Failed to fetch');
      }

      if (start + data.length < total && data.length % UNIT !== 0) {
        throw new Error('non-final chunk is not a multiple of 256 KiB');
      }
      session.bytes.set(data, start);
      session.stored = start + data.length;
      onProgress(data.length);
      if (session.stored === total) {
        return { kind: 'complete', file: this.finish(session) };
      }
      return { kind: 'incomplete', offset: session.stored };
    } finally {
      this.inFlight -= 1;
    }
  }

  async querySession(
    sessionUri: string,
    _total: number,
    signal?: AbortSignal
  ): Promise<SessionState> {
    await tick(signal);
    const session = this.sessions.get(sessionUri);
    if (!session || session.expired) return { kind: 'expired' };
    if (session.file) return { kind: 'complete', file: session.file };
    return { kind: 'incomplete', offset: session.stored };
  }

  async cancelSession(sessionUri: string): Promise<void> {
    this.cancelled.push(sessionUri);
    this.sessions.delete(sessionUri);
  }

  async createEmptyFile(meta: NewFileMeta): Promise<DriveFile> {
    if (meta.replaceId && this.gone.has(meta.replaceId))
      throw new DriveError(404, 'notFound', 'File not found');
    return this.store(meta, new Uint8Array(0));
  }

  async findFolder(parentId: string, name: string): Promise<string | null> {
    await tick();
    this.calls.push(`find:${parentId}/${name}`);
    for (const folder of this.folders.values()) {
      if (folder.parentId === parentId && folder.name === name)
        return folder.id;
    }
    return null;
  }

  async createFolder(parentId: string, name: string): Promise<string> {
    await tick();
    const id = `d${this.nextId++}`;
    this.folders.set(id, { id, name, parentId });
    this.calls.push(`mkdir:${parentId}/${name}`);
    return id;
  }

  async listFiles(parentId: string): Promise<RemoteFile[]> {
    await tick();
    return this.existing.get(parentId) ?? [];
  }

  /** Path of a stored file, e.g. "root/A/B/x.bin" */
  public pathOf(fileId: string): string {
    const file = this.files.find((f) => f.id === fileId);
    if (!file) return '';
    const parts = [file.name];
    let parent = file.parentId;
    while (this.folders.has(parent)) {
      const folder = this.folders.get(parent)!;
      parts.unshift(folder.name);
      parent = folder.parentId;
    }
    parts.unshift(parent);
    return parts.join('/');
  }

  private finish(session: Session): DriveFile {
    session.file = this.store(session.meta, session.bytes);
    return session.file;
  }

  /** A new file, or a new version of meta.replaceId */
  private store(meta: NewFileMeta, bytes: Uint8Array): DriveFile {
    if (meta.replaceId) {
      this.replaced.push(meta.replaceId);
      const current = this.files.find((f) => f.id === meta.replaceId);
      if (current) current.bytes = bytes;
      else
        this.files.push({
          id: meta.replaceId,
          name: meta.name,
          parentId: meta.parentId,
          bytes,
        });
      return { id: meta.replaceId, name: meta.name };
    }
    const file = {
      id: `f${this.nextId++}`,
      name: meta.name,
      parentId: meta.parentId,
      bytes,
    };
    this.files.push(file);
    return { id: file.id, name: file.name };
  }
}

function tick(signal?: AbortSignal): Promise<void> {
  return sleep(0, signal);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}
