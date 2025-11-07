/**
 * Message types for communication between content scripts and background
 */

export enum MessageType {
  UPLOAD_COMPLETE = 'UPLOAD_COMPLETE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
}

export interface UploadCompleteMessage {
  type: MessageType.UPLOAD_COMPLETE;
  data: {
    fileName: string;
  };
}

export interface UploadFailedMessage {
  type: MessageType.UPLOAD_FAILED;
  data: {
    fileName: string;
    error?: string;
  };
}

export type ExtensionMessage = UploadCompleteMessage | UploadFailedMessage;

export interface MessageResponse {
  success: boolean;
}
