/**
 * Uploader page - uploads files straight to Google Drive with the upload engine
 */

import { UploadEngine } from './engine.js';
import type {
  JobStatus,
  StoredJob,
  UploadJob,
  UploadSource,
} from './engine.js';
import { DriveApi } from './drive-api.js';
import type { DriveFolder } from './drive-api.js';
import { AuthRequiredError, GoogleAuth } from './auth.js';
import type { DriveAccount } from './auth.js';
import { IndexedDbJobStore } from './job-store.js';
import {
  canPickWithHandles,
  fromDrop,
  fromFileList,
  pickFiles,
  pickFolder,
  reopenHandle,
  requestReadAccess,
} from './file-sources.js';
import {
  isPickerConfigured,
  isUploaderConfigured,
  PICKER_URL,
} from './config.js';
import { DESTINATION_KEY } from './picker-messages.js';
import { formatBytes, formatDuration, formatSpeed } from './format.js';
import { loadPreferences } from '../types/storage.types.js';
import type { ExistingFiles, UserPreferences } from '../types/storage.types.js';
import { MessageType } from '../types/messages.types.js';
import type { ExtensionMessage } from '../types/messages.types.js';

/** Default destination: a folder the app creates in My Drive */
const APP_FOLDER_NAME = 'Upload Tracker';

const auth = new GoogleAuth();
const drive = new DriveApi(auth);
const store = new IndexedDbJobStore();
const engine = new UploadEngine({ drive, store });

let destination: DriveFolder | null = null;
let reportedBusy = false;
let renderQueued = false;
/** Jobs already counted in a "finished" notification */
const notified = new Set<string>();
const rows = new Map<string, HTMLLIElement>();

const byId = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

/** Folder ID of the Drive tab the uploader was opened from */
const openedFolderId = new URLSearchParams(location.search).get('folder');

function showView(view: 'setup' | 'signin' | 'main'): void {
  byId('view-setup').hidden = view !== 'setup';
  byId('view-signin').hidden = view !== 'signin';
  byId('view-main').hidden = view !== 'main';
}

function showAccount(account: DriveAccount | null): void {
  byId('account').hidden = !account;
  byId('sign-out').hidden = !account;
  if (!account) {
    return;
  }
  byId('account-name').textContent = account.name;
  byId('account-email').textContent = account.email;
  const photo = byId<HTMLImageElement>('account-photo');
  const initial = byId('account-initial');
  initial.textContent = (account.name || account.email).charAt(0).toUpperCase();
  photo.hidden = !account.photoLink;
  initial.hidden = Boolean(account.photoLink);
  if (account.photoLink) {
    photo.src = account.photoLink;
  }
}

function showDestination(): void {
  byId('destination-name').textContent = destination?.name ?? APP_FOLDER_NAME;
  const chip = byId<HTMLButtonElement>('destination');
  chip.disabled = !isPickerConfigured();
  chip.title = isPickerConfigured()
    ? 'Choose the Drive folder to upload into'
    : 'Choosing other folders needs the Google Picker (see docs/SETUP.md)';
}

async function ensureDestination(): Promise<DriveFolder> {
  if (!destination) {
    destination = await drive.ensureAppFolder(APP_FOLDER_NAME);
    await chrome.storage.local.set({ [DESTINATION_KEY]: destination });
    showDestination();
  }
  return destination;
}

/**
 * Open the hosted Google Picker; it reports the chosen folder to the background
 * script, which saves it to storage (picked up by the storage listener below)
 */
async function openPicker(start: { folder?: string } = {}): Promise<void> {
  await auth.getToken();
  const params = new URLSearchParams({ ext: chrome.runtime.id });
  if (start.folder) {
    params.set('folder', start.folder);
  }
  await chrome.windows.create({
    url: `${PICKER_URL}?${params.toString()}`,
    type: 'popup',
    width: 1000,
    height: 680,
  });
}

/** When the profile was last read from Google */
let accountLoadedAt = 0;

/** Re-read the profile when the tab comes back after this long */
const ACCOUNT_REFRESH_MS = 5 * 60 * 1000;

/**
 * Show the Google profile as it is now, so a changed name or photo shows up
 */
async function loadAccount(): Promise<void> {
  const account = await drive.getAccount();
  const previous = await auth.getAccount();
  if (previous && previous.email !== account.email) {
    // Folders belong to the other account
    destination = null;
    await chrome.storage.local.remove(DESTINATION_KEY);
    showDestination();
  }
  await auth.setAccount(account);
  showAccount(account);
  accountLoadedAt = Date.now();
}

async function signIn(): Promise<void> {
  const error = byId('sign-in-error');
  error.hidden = true;
  try {
    await auth.signIn();
    await loadAccount();
    byId('reauth-banner').hidden = true;
    showView('main');
    await ensureDestination();
    offerOpenedFolder();
  } catch (failure) {
    error.textContent = (failure as Error).message;
    error.hidden = false;
  }
}

async function signOut(): Promise<void> {
  if (engine.isBusy()) {
    engine.pauseAll();
  }
  await auth.signOut();
  destination = null;
  await chrome.storage.local.remove(DESTINATION_KEY);
  showAccount(null);
  showView('signin');
}

async function addSources(sources: UploadSource[]): Promise<void> {
  if (!sources.length) {
    return;
  }
  try {
    const folder = await ensureDestination();
    engine.add(sources, folder.id);
  } catch (error) {
    handleAuthError(error);
  }
}

function handleAuthError(error: unknown): void {
  if (
    error instanceof AuthRequiredError ||
    (error as { reason?: string }).reason === 'authRequired'
  ) {
    byId('reauth-banner').hidden = false;
  } else {
    console.error('[Uploader]', error);
  }
}

/**
 * Offer the folder the user had open in Drive; drive.file access to it has to
 * come through the Picker, so this opens the Picker inside that folder
 */
function offerOpenedFolder(): void {
  if (
    !openedFolderId ||
    !isPickerConfigured() ||
    openedFolderId === destination?.id
  ) {
    byId('opened-folder-banner').hidden = true;
    return;
  }
  byId('opened-folder-banner').hidden = false;
}

/**
 * Resume uploads saved before Chrome closed: ask once per picked folder,
 * then read each file again
 */
async function resumeInterrupted(): Promise<void> {
  const waiting = engine.waitingForFiles();
  const roots: FileSystemDirectoryHandle[] = [];
  for (const job of waiting) {
    if (job.rootHandle && !(await containsEntry(roots, job.rootHandle))) {
      roots.push(job.rootHandle);
    }
  }
  for (const root of roots) {
    await requestReadAccess(root);
  }

  let missing = 0;
  for (const job of waiting) {
    const file = job.handle ? await reopenHandle(job.handle) : null;
    if (!file || !engine.reattach(job.id, file, job.handle)) {
      missing += 1;
    }
  }
  if (missing) {
    byId('interrupted-text').textContent =
      `${missing} file${missing === 1 ? '' : 's'} couldn't be reopened. Drop or choose ${missing === 1 ? 'it' : 'them'} again to continue where ${missing === 1 ? 'it' : 'they'} stopped.`;
  }
  render();
}

async function containsEntry(
  list: FileSystemHandle[],
  handle: FileSystemHandle
): Promise<boolean> {
  for (const item of list) {
    if (await item.isSameEntry(handle)) {
      return true;
    }
  }
  return false;
}

/* Rendering */

const STATUS_ICON: Record<JobStatus, string> = {
  queued: 'icon-file',
  preparing: 'icon-file',
  uploading: 'icon-file',
  paused: 'icon-file',
  retrying: 'icon-file',
  offline: 'icon-file',
  done: 'icon-check',
  skipped: 'icon-check',
  failed: 'icon-alert',
  cancelled: 'icon-file',
  'needs-file': 'icon-file',
};

function statusText(job: UploadJob): string {
  const progress = `${formatBytes(job.uploadedBytes)} of ${formatBytes(job.size)}`;
  switch (job.status) {
    case 'queued':
      return job.uploadedBytes ? `Waiting · ${progress}` : 'Waiting';
    case 'preparing':
      return job.uploadedBytes ? `Reconnecting · ${progress}` : 'Starting';
    case 'uploading':
      return progress;
    case 'paused':
      return `Paused · ${progress}`;
    case 'retrying': {
      const seconds = Math.max(
        0,
        Math.ceil(((job.retryAt ?? 0) - Date.now()) / 1000)
      );
      return `${job.error ?? 'Connection problem'}. Retrying in ${seconds} s · ${progress}`;
    }
    case 'offline':
      return `Waiting for the network · ${progress}`;
    case 'done':
      return `${job.replaceId ? 'Replaced' : 'Uploaded'} · ${formatBytes(job.size)}`;
    case 'skipped':
      return 'Already in Drive, skipped';
    case 'failed':
      return job.error ?? 'Upload failed';
    case 'cancelled':
      return 'Cancelled';
    case 'needs-file':
      return `Interrupted at ${progress}. Choose the file again to continue`;
  }
}

function actionButton(
  action: string,
  icon: string,
  label: string
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.dataset['action'] = action;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<span class="icon ${icon}" aria-hidden="true"></span>`;
  return button;
}

function actionsFor(job: UploadJob): HTMLButtonElement[] {
  switch (job.status) {
    case 'queued':
    case 'preparing':
    case 'uploading':
    case 'retrying':
    case 'offline':
      return [
        actionButton('pause', 'icon-pause', 'Pause'),
        actionButton('cancel', 'icon-close', 'Cancel'),
      ];
    case 'paused':
      return [
        actionButton('resume', 'icon-play', 'Resume'),
        actionButton('cancel', 'icon-close', 'Cancel'),
      ];
    case 'failed':
      return [
        actionButton('retry', 'icon-retry', 'Retry'),
        actionButton('cancel', 'icon-close', 'Remove'),
      ];
    case 'needs-file':
      return [actionButton('cancel', 'icon-close', 'Forget this upload')];
    case 'done':
      return job.driveFile?.webViewLink
        ? [actionButton('open', 'icon-open', 'Open in Drive')]
        : [];
    default:
      return [];
  }
}

function createRow(job: UploadJob): HTMLLIElement {
  const row = document.createElement('li');
  row.className = 'row';
  row.dataset['id'] = job.id;
  row.innerHTML = `
    <span class="icon row-icon" aria-hidden="true"></span>
    <div class="row-name"></div>
    <div class="row-actions"></div>
    <div class="row-meta">
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill"></div></div>
      <span class="row-status"></span>
    </div>`;
  const name = row.querySelector('.row-name') as HTMLElement;
  const folder = job.relativePath.includes('/')
    ? job.relativePath.slice(0, job.relativePath.lastIndexOf('/'))
    : '';
  name.textContent = job.name;
  name.title = job.relativePath;
  if (folder) {
    const path = document.createElement('span');
    path.className = 'row-path';
    path.textContent = ` · ${folder}`;
    name.append(path);
  }
  return row;
}

function updateRow(row: HTMLLIElement, job: UploadJob): void {
  const percent = job.size
    ? Math.floor((job.uploadedBytes / job.size) * 100)
    : 100;
  if (row.dataset['status'] !== job.status) {
    row.dataset['status'] = job.status;
    (row.querySelector('.row-icon') as HTMLElement).className =
      `icon row-icon ${STATUS_ICON[job.status]}`;
    (row.querySelector('.row-actions') as HTMLElement).replaceChildren(
      ...actionsFor(job)
    );
  }
  const bar = row.querySelector('.progress') as HTMLElement;
  bar.setAttribute('aria-valuenow', String(percent));
  (row.querySelector('.progress-fill') as HTMLElement).style.width =
    `${percent}%`;
  const status = row.querySelector('.row-status') as HTMLElement;
  const text = statusText(job);
  if (status.textContent !== text) {
    status.textContent = text;
    status.title = text;
  }
}

function render(): void {
  renderQueued = false;
  const jobs = engine.list();
  const list = byId('rows');

  const seen = new Set<string>();
  for (const job of jobs) {
    seen.add(job.id);
    let row = rows.get(job.id);
    if (!row) {
      row = createRow(job);
      rows.set(job.id, row);
      list.append(row);
    }
    updateRow(row, job);
  }
  for (const [id, row] of rows) {
    if (!seen.has(id)) {
      row.remove();
      rows.delete(id);
    }
  }
  byId('queue').hidden = jobs.length === 0;

  const waiting = engine.waitingForFiles();
  byId('interrupted-banner').hidden = waiting.length === 0;
  if (waiting.length && !byId('interrupted-text').textContent) {
    const bytes = waiting.reduce((sum, job) => sum + job.uploadedBytes, 0);
    const one = waiting.length === 1;
    // Files from drag-and-drop or the pickers can be reopened; others must be chosen again
    const next = waiting.some((job) => job.handle)
      ? `Resume where ${one ? 'it' : 'they'} stopped.`
      : `Choose the same file${one ? '' : 's'} again to continue where ${one ? 'it' : 'they'} stopped.`;
    byId('interrupted-text').textContent =
      `${waiting.length} upload${one ? ' was' : 's were'} interrupted with ${formatBytes(bytes)} already in Drive. ${next}`;
  }
  byId<HTMLButtonElement>('resume-interrupted').hidden = !waiting.some(
    (job) => job.handle
  );

  renderSummary();
  reportBusy();
}

function renderSummary(): void {
  const stats = engine.stats();
  const busy = engine.isBusy();
  byId('summary').hidden =
    !busy && stats.done + stats.failed + stats.skipped === 0;

  const files =
    stats.active + stats.waiting + stats.done + stats.skipped + stats.failed;
  const finished = stats.done + stats.skipped;
  const percent = stats.totalBytes
    ? (stats.uploadedBytes / stats.totalBytes) * 100
    : 0;
  byId('summary-fill').style.width = `${percent}%`;

  if (busy) {
    byId('summary-title').textContent =
      `${finished} of ${files} file${files === 1 ? '' : 's'} uploaded`;
    const parts = [
      `${formatBytes(stats.uploadedBytes)} of ${formatBytes(stats.totalBytes)}`,
    ];
    if (stats.speed > 0) parts.push(formatSpeed(stats.speed));
    if (stats.secondsLeft !== null)
      parts.push(`about ${formatDuration(stats.secondsLeft)} left`);
    byId('summary-detail').textContent = parts.join(' · ');
  } else {
    byId('summary-title').textContent = stats.failed
      ? `${stats.failed} upload${stats.failed === 1 ? '' : 's'} failed`
      : 'All uploads finished';
    const parts = [`${stats.done} uploaded`];
    if (stats.skipped) parts.push(`${stats.skipped} already in Drive`);
    if (stats.waiting) parts.push(`${stats.waiting} paused`);
    byId('summary-detail').textContent = parts.join(' · ');
  }
}

function scheduleRender(): void {
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(render);
  }
}

/** Keep the computer awake and this tab from being discarded while busy */
function reportBusy(): void {
  const busy = engine.isBusy();
  if (busy !== reportedBusy) {
    reportedBusy = busy;
    void sendMessage({
      type: MessageType.UPLOAD_ACTIVITY,
      data: { active: busy },
    });
  }
}

function sendMessage(message: ExtensionMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

/** Notify once per batch: a summary for successes, one each for failures */
function notifyFinished(jobs: UploadJob[]): void {
  if (
    jobs.some((job) => job.status === 'paused' || job.status === 'needs-file')
  ) {
    return;
  }
  const fresh = jobs.filter((job) => !notified.has(job.id));
  fresh.forEach((job) => notified.add(job.id));

  const done = fresh.filter((job) => job.status === 'done').length;
  if (done) {
    void sendMessage({
      type: MessageType.BATCH_COMPLETE,
      data: { fileCount: done },
    });
  }
  fresh
    .filter((job) => job.status === 'failed')
    .slice(0, 3)
    .forEach((job) => {
      void sendMessage({
        type: MessageType.UPLOAD_FAILED,
        data: {
          fileName: job.name,
          uploadId: job.id,
          ...(job.error ? { error: job.error } : {}),
        },
      });
    });
  if (
    fresh.some(
      (job) =>
        job.status === 'failed' && job.error === 'Sign in again to continue'
    )
  ) {
    byId('reauth-banner').hidden = false;
  }
}

function applyPreferences(preferences: UserPreferences): void {
  if (preferences.theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', preferences.theme);
  }
  engine.setConcurrency(preferences.parallelUploads);
  engine.setExistingFiles(preferences.existingFiles);
  byId<HTMLSelectElement>('parallel').value = String(
    preferences.parallelUploads
  );
  byId<HTMLSelectElement>('existing-files').value = preferences.existingFiles;
}

async function savePreference(
  changes: Partial<UserPreferences>
): Promise<void> {
  const preferences = { ...(await loadPreferences()), ...changes };
  await chrome.storage.sync.set({ preferences });
}

/* Wiring */

function bindEvents(): void {
  byId('sign-in').addEventListener('click', () => void signIn());
  byId('reauth').addEventListener('click', () => void signIn());
  byId('sign-out').addEventListener('click', () => void signOut());
  byId('destination').addEventListener(
    'click',
    () => void openPicker().catch(handleAuthError)
  );
  byId('use-opened-folder').addEventListener('click', () => {
    if (openedFolderId) {
      void openPicker({ folder: openedFolderId }).catch(handleAuthError);
    }
  });
  byId('resume-interrupted').addEventListener(
    'click',
    () => void resumeInterrupted()
  );

  byId('parallel').addEventListener('change', (event) => {
    void savePreference({
      parallelUploads: Number((event.target as HTMLSelectElement).value),
    });
  });
  byId('existing-files').addEventListener('change', (event) => {
    void savePreference({
      existingFiles: (event.target as HTMLSelectElement).value as ExistingFiles,
    });
  });

  const fileInput = byId<HTMLInputElement>('file-input');
  const folderInput = byId<HTMLInputElement>('folder-input');
  byId('choose-files').addEventListener('click', () => {
    if (canPickWithHandles()) {
      void pickFiles().then(addSources).catch(ignoreCancel);
    } else {
      fileInput.click();
    }
  });
  byId('choose-folder').addEventListener('click', () => {
    if (canPickWithHandles()) {
      void pickFolder().then(addSources).catch(ignoreCancel);
    } else {
      folderInput.click();
    }
  });
  for (const input of [fileInput, folderInput]) {
    input.addEventListener('change', () => {
      if (input.files) {
        void addSources(fromFileList(input.files));
      }
      input.value = '';
    });
  }

  const dropzone = byId('dropzone');
  let dragDepth = 0;
  document.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    dropzone.classList.add('dragging');
  });
  document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropzone.classList.remove('dragging');
  });
  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove('dragging');
    if (event.dataTransfer && !byId('view-main').hidden) {
      void fromDrop(event.dataTransfer).then(addSources);
    }
  });

  byId('rows').addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-action]'
    );
    const id = button?.closest<HTMLLIElement>('.row')?.dataset['id'];
    if (!button || !id) {
      return;
    }
    switch (button.dataset['action']) {
      case 'pause':
        engine.pause(id);
        break;
      case 'resume':
        engine.resume(id);
        break;
      case 'retry':
        engine.retry(id);
        break;
      case 'cancel':
        engine.cancel(id);
        break;
      case 'open': {
        const link = engine.list().find((job) => job.id === id)
          ?.driveFile?.webViewLink;
        if (link) void chrome.tabs.create({ url: link });
        break;
      }
    }
  });
  byId('pause-all').addEventListener('click', () => engine.pauseAll());
  byId('resume-all').addEventListener('click', () => engine.resumeAll());
  byId('clear-finished').addEventListener('click', () => {
    engine.clearFinished();
    byId('interrupted-text').textContent = '';
  });

  engine.onChange(scheduleRender);
  engine.onIdle(notifyFinished);
  setInterval(scheduleRender, 1000); // countdowns and speed

  window.addEventListener('beforeunload', (event) => {
    if (engine.isBusy()) {
      event.preventDefault();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes['preferences']) {
      void loadPreferences().then(applyPreferences);
    }
    if (area === 'local' && changes[DESTINATION_KEY]?.newValue) {
      destination = changes[DESTINATION_KEY].newValue as DriveFolder;
      showDestination();
      offerOpenedFolder();
    }
  });
}

function ignoreCancel(error: unknown): void {
  if ((error as Error).name !== 'AbortError') {
    console.error('[Uploader]', error);
  }
}

async function init(): Promise<void> {
  bindEvents();
  applyPreferences(await loadPreferences());

  if (!isUploaderConfigured()) {
    showView('setup');
    return;
  }

  engine.restore(
    (await store.loadAll()).filter(
      (job: StoredJob) => job.status !== 'cancelled'
    )
  );

  const account = await auth.getAccount();
  if (!account) {
    showView('signin');
    return;
  }

  showAccount(account);
  destination =
    ((await chrome.storage.local.get(DESTINATION_KEY))[DESTINATION_KEY] as
      | DriveFolder
      | undefined) ?? null;
  showDestination();
  showView('main');
  offerOpenedFolder();
  render();

  // Check the sign-in still works before anything is dropped, and pick up
  // any change to the Google profile since last time
  loadAccount().catch(handleAuthError);
  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'visible' &&
      !byId('account').hidden &&
      Date.now() - accountLoadedAt > ACCOUNT_REFRESH_MS
    ) {
      loadAccount().catch(handleAuthError);
    }
  });
}

void init();
