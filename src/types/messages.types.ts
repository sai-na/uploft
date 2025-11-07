/**
 * Message types for communication between content scripts and background
 */

export enum MessageType {
  UPLOAD_COMPLETE = 'UPLOAD_COMPLETE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  UPLOAD_CANCELLED = 'UPLOAD_CANCELLED',
  BATCH_COMPLETE = 'BATCH_COMPLETE',
}

export interface UploadCompleteMessage {
  type: MessageType.UPLOAD_COMPLETE;
  data: {
    fileName: string;
    uploadId?: string;
    tabId?: number;
  };
}

export interface UploadFailedMessage {
  type: MessageType.UPLOAD_FAILED;
  data: {
    fileName: string;
    error?: string;
    uploadId?: string;
    tabId?: number;
  };
}

export interface UploadCancelledMessage {
  type: MessageType.UPLOAD_CANCELLED;
  data: {
    fileName: string;
    uploadId?: string;
    tabId?: number;
  };
}

export interface BatchCompleteMessage {
  type: MessageType.BATCH_COMPLETE;
  data: {
    fileCount: number;
    tabId?: number;
  };
}

export type ExtensionMessage =
  | UploadCompleteMessage
  | UploadFailedMessage
  | UploadCancelledMessage
  | BatchCompleteMessage;

export interface MessageResponse {
  success: boolean;
}
