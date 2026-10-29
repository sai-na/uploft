/**
 * Google Drive REST client for the uploader
 * Resumable uploads go through XMLHttpRequest for byte-level progress;
 * metadata calls use fetch.
 */

import type {
  DriveClient,
  DriveFile,
  NewFileMeta,
  RemoteFile,
  SessionState,
} from './drive-types.js';
import { DriveError } from './drive-types.js';
import type { DriveAccount, GoogleAuth } from './auth.js';
import { AuthRequiredError } from './auth.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILE_FIELDS = 'id,name,webViewLink';

/** Restart a chunk if no bytes move for this long (ms) */
const STALL_TIMEOUT = 60000;
/** Time Drive gets to answer once a chunk is fully sent (ms) */
const RESPONSE_TIMEOUT = 300000;

interface XhrResult {
  status: number;
  range: string | null;
  body: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

interface ListedFile {
  id?: string;
  name?: string;
  size?: string;
  modifiedTime?: string;
}

export class DriveApi implements DriveClient {
  private readonly auth: GoogleAuth;

  constructor(auth: GoogleAuth) {
    this.auth = auth;
  }

  public async startSession(
    meta: NewFileMeta,
    signal?: AbortSignal
  ): Promise<string> {
    const response = await this.request(
      `${fileUrl(UPLOAD_API, meta)}?uploadType=resumable&supportsAllDrives=true&fields=${FILE_FIELDS}`,
      {
        method: meta.replaceId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': String(meta.size),
          ...(isKnownType(meta.mimeType)
            ? { 'X-Upload-Content-Type': meta.mimeType }
            : {}),
        },
        body: JSON.stringify(fileMetadata(meta)),
        ...(signal ? { signal } : {}),
      }
    );
    const location = response.headers.get('Location');
    if (!location) {
      throw new DriveError(
        500,
        'backendError',
        'Drive did not return an upload session'
      );
    }
    return location;
  }

  public putChunk(
    sessionUri: string,
    chunk: Blob,
    start: number,
    total: number,
    onProgress: (loaded: number) => void,
    signal?: AbortSignal
  ): Promise<SessionState> {
    const range = `bytes ${start}-${start + chunk.size - 1}/${total}`;
    return this.session(sessionUri, chunk, range, onProgress, signal);
  }

  public querySession(
    sessionUri: string,
    total: number,
    signal?: AbortSignal
  ): Promise<SessionState> {
    return this.session(
      sessionUri,
      null,
      `bytes */${total}`,
      () => undefined,
      signal
    );
  }

  public async cancelSession(sessionUri: string): Promise<void> {
    await fetch(sessionUri, { method: 'DELETE' }).catch(() => undefined);
  }

  public async createEmptyFile(
    meta: NewFileMeta,
    signal?: AbortSignal
  ): Promise<DriveFile> {
    if (meta.replaceId) {
      return this.emptyVersion(meta, signal);
    }
    const response = await this.request(
      `${API}/files?supportsAllDrives=true&fields=${FILE_FIELDS}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(fileMetadata(meta)),
        ...(signal ? { signal } : {}),
      }
    );
    return (await response.json()) as DriveFile;
  }

  public async findFolder(
    parentId: string,
    name: string
  ): Promise<string | null> {
    const q = `name = '${escapeQuery(name)}' and '${escapeQuery(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const files = await this.list(q, 'files(id)', 1);
    return files[0]?.id ?? null;
  }

  public async createFolder(parentId: string, name: string): Promise<string> {
    const response = await this.request(
      `${API}/files?supportsAllDrives=true&fields=id`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          name,
          mimeType: FOLDER_MIME,
          parents: [parentId],
        }),
      }
    );
    return ((await response.json()) as { id: string }).id;
  }

  public async listFiles(parentId: string): Promise<RemoteFile[]> {
    const q = `'${escapeQuery(parentId)}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`;
    const files = await this.list(
      q,
      'nextPageToken,files(id,name,size,modifiedTime)'
    );
    return files.map((file) => ({
      id: file.id ?? '',
      name: file.name ?? '',
      size: Number(file.size ?? 0),
      modifiedTime: Date.parse(file.modifiedTime ?? '') || 0,
    }));
  }

  public async getAccount(): Promise<DriveAccount> {
    const response = await this.request(
      `${API}/about?fields=user(displayName,emailAddress,photoLink)`
    );
    const { user } = (await response.json()) as {
      user: { displayName: string; emailAddress: string; photoLink?: string };
    };
    return {
      email: user.emailAddress,
      name: user.displayName,
      ...(user.photoLink ? { photoLink: user.photoLink } : {}),
    };
  }

  public async getFolder(id: string): Promise<DriveFolder> {
    const response = await this.request(
      `${API}/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name`
    );
    return (await response.json()) as DriveFolder;
  }

  /**
   * The app's own "Upload Tracker" folder in My Drive, created on first use
   */
  public async ensureAppFolder(name: string): Promise<DriveFolder> {
    const id =
      (await this.findFolder('root', name)) ??
      (await this.createFolder('root', name));
    return { id, name };
  }

  /**
   * Empty a file as a new version; resumable uploads need at least one byte
   */
  private async emptyVersion(
    meta: NewFileMeta,
    signal?: AbortSignal
  ): Promise<DriveFile> {
    const boundary = `upload-tracker-${Date.now()}`;
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(fileMetadata(meta)),
      `--${boundary}`,
      'Content-Type: application/octet-stream',
      '',
      '',
      `--${boundary}--`,
    ].join('\r\n');
    const response = await this.request(
      `${fileUrl(UPLOAD_API, meta)}?uploadType=multipart&supportsAllDrives=true&fields=${FILE_FIELDS}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
        ...(signal ? { signal } : {}),
      }
    );
    return (await response.json()) as DriveFile;
  }

  private async list(
    q: string,
    fields: string,
    pageSize = 1000
  ): Promise<ListedFile[]> {
    const files: ListedFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q,
        fields: fields.includes('nextPageToken')
          ? fields
          : `nextPageToken,${fields}`,
        pageSize: String(pageSize),
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });
      if (pageToken) {
        params.set('pageToken', pageToken);
      }
      const response = await this.request(`${API}/files?${params.toString()}`);
      const page = (await response.json()) as {
        files: ListedFile[];
        nextPageToken?: string;
      };
      files.push(...page.files);
      pageToken = pageSize === 1 ? '' : (page.nextPageToken ?? '');
    } while (pageToken);
    return files;
  }

  /**
   * fetch with the access token; a rejected token is refreshed once
   */
  private async request(
    url: string,
    init: RequestInit = {},
    retried = false
  ): Promise<Response> {
    const token = await this.token();
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      throw new DriveError(0, 'network', 'Network connection lost');
    }

    if (response.status === 401 && !retried) {
      await this.auth.invalidate(token);
      return this.request(url, init, true);
    }
    if (!response.ok) {
      throw toDriveError(response.status, await response.text());
    }
    return response;
  }

  /**
   * One request against a resumable session: a chunk, or a status check when body is null
   */
  private async session(
    sessionUri: string,
    body: Blob | null,
    contentRange: string,
    onProgress: (loaded: number) => void,
    signal: AbortSignal | undefined,
    retried = false
  ): Promise<SessionState> {
    const token = await this.token();
    const result = await sendXhr(
      sessionUri,
      body,
      contentRange,
      token,
      onProgress,
      signal
    );

    if (result.status === 308) {
      // "bytes=0-1048575" means Drive has the first 1048576 bytes; no header means none
      const end = /bytes=\d+-(\d+)/.exec(result.range ?? '')?.[1];
      return {
        kind: 'incomplete',
        offset: end === undefined ? 0 : Number(end) + 1,
      };
    }
    if (result.status === 200 || result.status === 201) {
      return { kind: 'complete', file: JSON.parse(result.body) as DriveFile };
    }
    if (result.status === 404 || result.status === 410) {
      return { kind: 'expired' };
    }
    if (result.status === 401 && !retried) {
      await this.auth.invalidate(token);
      return this.session(
        sessionUri,
        body,
        contentRange,
        onProgress,
        signal,
        true
      );
    }
    throw toDriveError(result.status, result.body);
  }

  private async token(): Promise<string> {
    try {
      return await this.auth.getToken();
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        throw new DriveError(401, 'authRequired', 'Sign in again to continue');
      }
      throw error;
    }
  }
}

function sendXhr(
  url: string,
  body: Blob | null,
  contentRange: string,
  token: string,
  onProgress: (loaded: number) => void,
  signal: AbortSignal | undefined
): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let stalled = false;

    const arm = (ms: number): void => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, ms);
    };
    const cleanup = (): void => {
      clearTimeout(watchdog);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => xhr.abort();

    xhr.open('PUT', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Range', contentRange);

    xhr.upload.onprogress = (event): void => {
      arm(STALL_TIMEOUT);
      onProgress(event.loaded);
    };
    xhr.upload.onload = (): void => arm(RESPONSE_TIMEOUT);
    xhr.onload = (): void => {
      cleanup();
      resolve({
        status: xhr.status,
        range: xhr.getResponseHeader('Range'),
        body: xhr.responseText,
      });
    };
    xhr.onerror = (): void => {
      cleanup();
      reject(new DriveError(0, 'network', 'Network connection lost'));
    };
    xhr.onabort = (): void => {
      cleanup();
      reject(
        stalled
          ? new DriveError(0, 'stalled', 'Connection stalled')
          : new DOMException('Aborted', 'AbortError')
      );
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    arm(body ? STALL_TIMEOUT : RESPONSE_TIMEOUT);
    xhr.send(body);
  });
}

/** The files collection, or one file when uploading a new version of it */
function fileUrl(base: string, meta: NewFileMeta): string {
  return meta.replaceId
    ? `${base}/files/${encodeURIComponent(meta.replaceId)}`
    : `${base}/files`;
}

function fileMetadata(meta: NewFileMeta): Record<string, unknown> {
  return {
    // A new version keeps its name and folder; parents can't be set on update
    ...(meta.replaceId ? {} : { name: meta.name, parents: [meta.parentId] }),
    // Leave unknown types out so Drive detects them from the name
    ...(isKnownType(meta.mimeType) ? { mimeType: meta.mimeType } : {}),
    modifiedTime: new Date(meta.modifiedTime).toISOString(),
  };
}

function isKnownType(mimeType: string): boolean {
  return mimeType !== '' && mimeType !== 'application/octet-stream';
}

function toDriveError(status: number, text: string): DriveError {
  try {
    const { error } = JSON.parse(text) as {
      error: { message: string; errors?: Array<{ reason: string }> };
    };
    return new DriveError(
      status,
      error.errors?.[0]?.reason ?? '',
      error.message
    );
  } catch {
    return new DriveError(status, '', `Drive returned HTTP ${status}`);
  }
}

/** Escape a value for a Drive search query */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
