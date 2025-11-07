/**
 * Content script for Upload Tracker for Drive
 * Injected into Google Drive pages to track upload progress
 */

/* eslint-disable no-console */

import { UploadMonitor } from './upload-monitor.js';
import { UploadTracker } from './upload-tracker.js';
import type { UploadInfo, UploadEvent } from '../types/upload.types.js';
import { UploadEventType } from '../types/upload.types.js';

/**
 * Global upload monitor instance
 */
let uploadMonitor: UploadMonitor | null = null;

/**
 * Global upload tracker instance for state management
 */
let uploadTracker: UploadTracker | null = null;

/**
 * Check if we're on a Google Drive page
 */
function isGoogleDrivePage(): boolean {
  return window.location.hostname === 'drive.google.com';
}

/**
 * Handle upload updates from monitor
 */
function handleUploadUpdates(uploads: UploadInfo[]): void {
  console.log(`[Content] Upload updates: ${uploads.length} active uploads`);

  if (!uploadTracker) {
    console.warn('[Content] Upload tracker not initialized');
    return;
  }

  // Sync uploads with state tracker
  const tracker = uploadTracker; // Local reference for TypeScript
  uploads.forEach((upload) => {
    const existingUpload = tracker.getUpload(upload.id);

    if (!existingUpload) {
      // New upload - add to tracker
      tracker.addUpload(upload);
      console.log(
        `[Content] New upload tracked: ${upload.fileName} (${upload.progress}%)`
      );
    } else {
      // Existing upload - update state
      tracker.updateUpload(upload.id, {
        progress: upload.progress,
        uploadedSize: upload.uploadedSize,
        totalSize: upload.totalSize,
        uploadedBytes: upload.uploadedBytes,
        totalBytes: upload.totalBytes,
        timeRemaining: upload.timeRemaining,
        uploadSpeed: upload.uploadSpeed,
        status: upload.status,
      });
    }
  });

  // TODO: Send updates to background script
  // TODO: Update UI overlay with upload progress
}

/**
 * Handle upload events from tracker
 */
function handleUploadEvent(event: UploadEvent): void {
  console.log(
    `[Content] Upload event: ${event.type} - ${event.upload.fileName}`
  );

  // TODO: Send event to background script for notifications
  // TODO: Update UI based on event type
}

/**
 * Initialize the upload tracker
 */
function initialize(): void {
  if (!isGoogleDrivePage()) {
    console.log(
      '[Content] Not on Google Drive, upload tracker not initialized'
    );
    return;
  }

  console.log(
    '[Content] Upload Tracker for Drive initialized on Google Drive page'
  );

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupUploadTracking);
  } else {
    setupUploadTracking();
  }
}

/**
 * Set up upload tracking
 */
function setupUploadTracking(): void {
  console.log('[Content] Setting up upload tracking...');

  // Create upload tracker for state management
  uploadTracker = new UploadTracker();

  // Register event listeners for all upload events
  uploadTracker.addEventListener(
    UploadEventType.UPLOAD_STARTED,
    handleUploadEvent
  );
  uploadTracker.addEventListener(
    UploadEventType.UPLOAD_PROGRESS,
    handleUploadEvent
  );
  uploadTracker.addEventListener(
    UploadEventType.UPLOAD_COMPLETED,
    handleUploadEvent
  );
  uploadTracker.addEventListener(
    UploadEventType.UPLOAD_FAILED,
    handleUploadEvent
  );
  uploadTracker.addEventListener(
    UploadEventType.UPLOAD_CANCELLED,
    handleUploadEvent
  );
  uploadTracker.addEventListener(
    UploadEventType.UPLOAD_PAUSED,
    handleUploadEvent
  );
  uploadTracker.addEventListener(
    UploadEventType.UPLOAD_RESUMED,
    handleUploadEvent
  );

  // Create upload monitor with update callback
  uploadMonitor = new UploadMonitor(handleUploadUpdates);

  // Start monitoring
  uploadMonitor.start();

  console.log('[Content] Upload tracking setup complete');
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  if (uploadMonitor) {
    uploadMonitor.dispose();
    uploadMonitor = null;
  }

  if (uploadTracker) {
    uploadTracker.dispose();
    uploadTracker = null;
  }
});

// Initialize when script loads
initialize();
