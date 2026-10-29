/**
 * Types shared by the upload engine and the Drive API client
 */

/** File metadata Drive returns once an upload finishes */
export interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
}

/** Metadata for a file about to be uploaded */
export interface NewFileMeta {
  name: string;
  parentId: string;
  mimeType: string;
  size: number;
  modifiedTime: number;
  /** Upload as a new version of this Drive file instead of a new file */
  replaceId?: string;
}

/** A file already in a folder, as the app can see it */
export interface RemoteFile {
  id: string;
  name: string;
  size: number;
  modifiedTime: number;
}

/** Where a resumable upload stands after a chunk or a status check */
export type SessionState =
  | { kind: 'incomplete'; offset: number }
  | { kind: 'complete'; file: DriveFile }
  | { kind: 'expired' };

/**
 * Everything the engine needs from Drive; the client handles auth itself
 */
export interface DriveClient {
  /** Open a resumable upload session (or a new-version one) and return its URI */
  startSession(meta: NewFileMeta, signal?: AbortSignal): Promise<string>;
  /** Send bytes [start, end) of the file */
  putChunk(
    sessionUri: string,
    chunk: Blob,
    start: number,
    total: number,
    onProgress: (loaded: number) => void,
    signal?: AbortSignal
  ): Promise<SessionState>;
  /** Ask how many bytes Drive has stored for a session */
  querySession(
    sessionUri: string,
    total: number,
    signal?: AbortSignal
  ): Promise<SessionState>;
  cancelSession(sessionUri: string): Promise<void>;
  /** Create an empty file (resumable uploads need at least one byte) */
  createEmptyFile(meta: NewFileMeta, signal?: AbortSignal): Promise<DriveFile>;
  findFolder(parentId: string, name: string): Promise<string | null>;
  createFolder(parentId: string, name: string): Promise<string>;
  /** Every file in a folder the app can see */
  listFiles(parentId: string): Promise<RemoteFile[]>;
}

/**
 * Error from a Drive request; status 0 means the network failed
 */
export class DriveError extends Error {
  public readonly status: number;
  public readonly reason: string;
  public readonly retryable: boolean;

  constructor(status: number, reason: string, message: string) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
    this.reason = reason;
    this.retryable =
      status === 0 ||
      status === 408 ||
      status === 429 ||
      status >= 500 ||
      RETRYABLE_REASONS.has(reason);
  }
}

const RETRYABLE_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'backendError',
  'internalError',
  'stalled',
]);
