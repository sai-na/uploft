/**
 * Upload tracking data structures and interfaces
 */

/**
 * Upload status enumeration representing all possible states of an upload
 *
 * State transitions:
 * - PENDING -> UPLOADING (upload starts)
 * - UPLOADING -> COMPLETE (upload succeeds)
 * - UPLOADING -> FAILED (upload fails)
 * - UPLOADING -> CANCELLED (user cancels)
 * - UPLOADING -> PAUSED (upload paused)
 * - PAUSED -> UPLOADING (upload resumes)
 * - PAUSED -> CANCELLED (user cancels while paused)
 * - FAILED -> UPLOADING (retry attempt)
 */
export enum UploadStatus {
  /** Upload is queued but not yet started */
  PENDING = 'pending',
  /** Upload is currently in progress */
  UPLOADING = 'uploading',
  /** Upload completed successfully */
  COMPLETE = 'complete',
  /** Upload failed due to an error */
  FAILED = 'failed',
  /** Upload was cancelled by the user */
  CANCELLED = 'cancelled',
  /** Upload is paused */
  PAUSED = 'paused',
}

/**
 * Comprehensive upload information for tracking individual file uploads
 */
export interface UploadInfo {
  /** Unique identifier for this upload */
  id: string;

  /** Reference to the DOM element containing the upload */
  element: HTMLElement;

  /** Name of the file being uploaded */
  fileName: string;

  /** Upload progress as a percentage (0-100) */
  progress: number;

  /** Human-readable uploaded size (e.g., "1.5 MB") */
  uploadedSize: string;

  /** Human-readable total file size (e.g., "10 MB") */
  totalSize: string;

  /** Uploaded bytes as a number */
  uploadedBytes: number;

  /** Total file size in bytes */
  totalBytes: number;

  /** Estimated time remaining (e.g., "2 minutes") */
  timeRemaining: string | null;

  /** Upload speed (e.g., "5 MB/s") */
  uploadSpeed: string | null;

  /** Current status of the upload */
  status: UploadStatus;

  /** Timestamp when the upload started (milliseconds since epoch) */
  startTime: number;

  /** Timestamp when the upload ended (milliseconds since epoch) */
  endTime?: number;

  /** Error message if the upload failed */
  errorMessage?: string;
}

/**
 * Configuration interface for the upload tracker extension
 * Extends the base UserPreferences with upload-specific settings
 */
export interface UploadTrackerConfig {
  /** Enable desktop notifications for upload completion */
  enableNotifications: boolean;

  /** Enable sound notifications */
  notificationSound: boolean;

  /** Automatically hide completed uploads after a delay */
  autoHideCompleted: boolean;

  /** Position of the upload tracker UI overlay */
  uiPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

  /** Theme for the upload tracker UI */
  theme: 'light' | 'dark' | 'auto';

  /** Show upload speed in the UI */
  showSpeed: boolean;

  /** Show estimated time remaining in the UI */
  showTimeRemaining: boolean;

  /** Auto-hide delay in milliseconds (0 to disable) */
  autoHideDelay: number;

  /** Maximum number of uploads to display at once */
  maxVisibleUploads: number;
}

/**
 * Upload event types for state change notifications
 */
export enum UploadEventType {
  UPLOAD_STARTED = 'upload_started',
  UPLOAD_PROGRESS = 'upload_progress',
  UPLOAD_COMPLETED = 'upload_completed',
  UPLOAD_FAILED = 'upload_failed',
  UPLOAD_CANCELLED = 'upload_cancelled',
  UPLOAD_PAUSED = 'upload_paused',
  UPLOAD_RESUMED = 'upload_resumed',
}

/**
 * Event data structure for upload state changes
 */
export interface UploadEvent {
  /** Type of the event */
  type: UploadEventType;

  /** Upload information */
  upload: UploadInfo;

  /** Timestamp when the event occurred */
  timestamp: number;
}

/**
 * Callback function type for upload event listeners
 */
export type UploadEventCallback = (event: UploadEvent) => void;
