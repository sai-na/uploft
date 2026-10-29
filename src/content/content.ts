/**
 * Content script for Upload Tracker for Drive
 * Injected into Google Drive pages to track upload progress
 */

import { UploadMonitor } from './upload-monitor.js';
import { UploadTracker } from './upload-tracker.js';
import { UploadOverlay } from './upload-overlay.js';
import { UploadControls } from './upload-controls.js';
import { AutoRetry } from './auto-retry.js';
import type { UploadInfo, UploadEvent } from '../types/upload.types.js';
import { UploadEventType, UploadStatus } from '../types/upload.types.js';
import { loadPreferences } from '../types/storage.types.js';
import { MessageType } from '../types/messages.types.js';
import type {
  ExtensionMessage,
  MessageResponse,
} from '../types/messages.types.js';
import { logger } from '../utils/logger.js';

/**
 * Global upload monitor instance
 */
let uploadMonitor: UploadMonitor | null = null;

/**
 * Global upload tracker instance for state management
 */
let uploadTracker: UploadTracker | null = null;

/**
 * Global upload overlay UI instance
 */
let uploadOverlay: UploadOverlay | null = null;

/**
 * Global upload controls instance
 */
let uploadControls: UploadControls | null = null;

/**
 * Global auto-retry instance for failed uploads
 */
let autoRetry: AutoRetry | null = null;

/**
 * Last upload activity reported to the background script
 */
let reportedActive = false;
let inactiveReportTimeout: ReturnType<typeof setTimeout> | null = null;

/** Wait this long before reporting "no uploads", so retries don't flap it (ms) */
const INACTIVE_REPORT_DELAY = 10000;

/**
 * Track recently cancelled uploads for batch notification
 */
const cancelledUploads: Set<string> = new Set();
let cancelledNotificationTimeout: ReturnType<typeof setTimeout> | null = null;

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
  logger.debug('Content', 'Upload updates', { count: uploads.length });

  if (!uploadTracker) {
    logger.warn('Content', 'Upload tracker not initialized');
    return;
  }

  // Sync uploads with state tracker and UI
  const tracker = uploadTracker; // Local reference for TypeScript
  uploads.forEach((upload) => {
    const existingUpload = tracker.getUpload(upload.id);

    if (!existingUpload) {
      // New upload - add to tracker
      tracker.addUpload(upload);
      logger.debug('Content', 'New upload tracked', {
        fileName: upload.fileName,
        progress: upload.progress,
      });
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

    // Update UI overlay
    if (uploadOverlay) {
      uploadOverlay.updateUpload(upload);
    }
  });

  // Update global time remaining in overlay
  if (uploadOverlay && uploadMonitor) {
    const globalTimeRemaining = uploadMonitor.getGlobalTimeRemaining();
    if (globalTimeRemaining) {
      uploadOverlay.setGlobalTimeRemaining(globalTimeRemaining);
    }
  }

  reportActivity();
}

/**
 * Tell the background script whether this tab has uploads in flight,
 * so it can keep the computer awake and the tab from being discarded
 */
function reportActivity(): void {
  const inFlight =
    (uploadTracker?.getAllUploads() ?? []).some(
      (upload) =>
        upload.element.isConnected &&
        (upload.status === UploadStatus.UPLOADING ||
          upload.status === UploadStatus.PENDING ||
          upload.status === UploadStatus.PAUSED)
    ) ||
    (autoRetry?.hasPending() ?? false);

  if (inFlight) {
    if (inactiveReportTimeout) {
      clearTimeout(inactiveReportTimeout);
      inactiveReportTimeout = null;
    }
    if (!reportedActive) {
      reportedActive = true;
      void sendBackgroundMessage({
        type: MessageType.UPLOAD_ACTIVITY,
        data: { active: true },
      });
    }
  } else if (reportedActive && !inactiveReportTimeout) {
    inactiveReportTimeout = setTimeout(() => {
      inactiveReportTimeout = null;
      reportedActive = false;
      void sendBackgroundMessage({
        type: MessageType.UPLOAD_ACTIVITY,
        data: { active: false },
      });
    }, INACTIVE_REPORT_DELAY);
  }
}

/**
 * Notify about a failed upload that will not be retried again
 */
function handleUploadGaveUp(upload: UploadInfo): void {
  void sendBackgroundMessage({
    type: MessageType.UPLOAD_FAILED,
    data: {
      fileName: upload.fileName,
      uploadId: upload.id,
    },
  });

  setTimeout(() => {
    if (uploadOverlay && upload.status === UploadStatus.FAILED) {
      uploadOverlay.removeUpload(upload.id);
    }
  }, 10000); // Remove after 10 seconds

  reportActivity();
}

/**
 * Send message to background script
 */
async function sendBackgroundMessage(
  message: ExtensionMessage
): Promise<MessageResponse | null> {
  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    return response as MessageResponse;
  } catch (error) {
    logger.error(
      'Content',
      'Error sending message to background',
      error as Error
    );
    return null;
  }
}

/**
 * Update global time remaining based on active uploads
 */
function updateGlobalTimeRemaining(): void {
  if (uploadOverlay && uploadMonitor) {
    const globalTimeRemaining = uploadMonitor.getGlobalTimeRemaining();
    uploadOverlay.setGlobalTimeRemaining(globalTimeRemaining);
  }
}

/**
 * Handle upload events from tracker
 */
function handleUploadEvent(event: UploadEvent): void {
  logger.debug('Content', 'Upload event', {
    type: event.type,
    fileName: event.upload.fileName,
  });

  // Update UI overlay based on event type
  if (uploadOverlay) {
    uploadOverlay.updateUpload(event.upload);

    // Remove completed uploads after a delay
    if (event.type === UploadEventType.UPLOAD_COMPLETED) {
      autoRetry?.cancel(event.upload.id);
      uploadControls?.clearRetryAttempts(event.upload.id);

      // Send notification to background
      void sendBackgroundMessage({
        type: MessageType.UPLOAD_COMPLETE,
        data: {
          fileName: event.upload.fileName,
          uploadId: event.upload.id,
        },
      });

      // Update global time remaining
      updateGlobalTimeRemaining();

      setTimeout(() => {
        if (uploadOverlay) {
          uploadOverlay.removeUpload(event.upload.id);
        }
      }, 5000); // Remove after 5 seconds
    }

    // Remove failed/cancelled uploads after a longer delay
    if (event.type === UploadEventType.UPLOAD_FAILED) {
      // Update global time remaining
      updateGlobalTimeRemaining();

      // Retry automatically; notifies through handleUploadGaveUp when it stops
      if (autoRetry) {
        autoRetry.handleFailure(event.upload);
      } else {
        handleUploadGaveUp(event.upload);
      }
    }

    if (event.type === UploadEventType.UPLOAD_CANCELLED) {
      autoRetry?.cancel(event.upload.id);

      // Send notification to background
      void sendBackgroundMessage({
        type: MessageType.UPLOAD_CANCELLED,
        data: {
          fileName: event.upload.fileName,
          uploadId: event.upload.id,
        },
      });

      // Track cancelled upload for batch notification
      cancelledUploads.add(event.upload.id);

      // Clear existing timeout if any
      if (cancelledNotificationTimeout) {
        clearTimeout(cancelledNotificationTimeout);
      }

      // Show cancelled message after short delay to batch multiple cancellations
      cancelledNotificationTimeout = setTimeout(() => {
        if (uploadOverlay && cancelledUploads.size > 0) {
          uploadOverlay.showCancelledMessage(cancelledUploads.size);
          cancelledUploads.clear();
        }
        cancelledNotificationTimeout = null;
      }, 500); // Wait 500ms to batch multiple cancellations

      // Update global time remaining
      updateGlobalTimeRemaining();

      setTimeout(() => {
        if (uploadOverlay) {
          uploadOverlay.removeUpload(event.upload.id);
        }
      }, 10000); // Remove after 10 seconds
    }
  }
}

/**
 * Initialize the upload tracker
 */
function initialize(): void {
  if (!isGoogleDrivePage()) {
    logger.info(
      'Content',
      'Not on Google Drive, upload tracker not initialized'
    );
    return;
  }

  logger.info(
    'Content',
    'Upload Tracker for Drive initialized on Google Drive page'
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
  logger.info('Content', 'Setting up upload tracking');

  // Create upload controls
  uploadControls = new UploadControls();

  // Create upload overlay UI with control callbacks
  uploadOverlay = new UploadOverlay({
    onCancel: async (upload) => {
      if (uploadControls) {
        return await uploadControls.cancelUpload(upload);
      }
      return { success: false, message: 'Upload controls not available' };
    },
    onRetry: async (upload) => {
      if (uploadControls) {
        return await uploadControls.retryUpload(upload);
      }
      return { success: false, message: 'Upload controls not available' };
    },
    onShowLocation: async (upload) => {
      if (uploadControls) {
        return await uploadControls.showFileLocation(upload);
      }
      return { success: false, message: 'Upload controls not available' };
    },
  });

  // Create upload tracker for state management
  uploadTracker = new UploadTracker();

  // Retry failed uploads automatically (can be turned off in settings)
  autoRetry = new AutoRetry({
    controls: uploadControls,
    getUpload: (id) => uploadTracker?.getUpload(id) ?? null,
    onGiveUp: handleUploadGaveUp,
    onPendingChange: reportActivity,
  });
  void loadPreferences().then((preferences) => {
    autoRetry?.setEnabled(preferences.autoRetry);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes['preferences']) {
      void loadPreferences().then((preferences) => {
        autoRetry?.setEnabled(preferences.autoRetry);
      });
    }
  });

  // A reloaded tab starts with nothing in flight
  void sendBackgroundMessage({
    type: MessageType.UPLOAD_ACTIVITY,
    data: { active: false },
  });

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

  logger.info('Content', 'Upload tracking setup complete');
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  // Clear cancelled notification timeout
  if (cancelledNotificationTimeout) {
    clearTimeout(cancelledNotificationTimeout);
    cancelledNotificationTimeout = null;
  }
  cancelledUploads.clear();

  if (inactiveReportTimeout) {
    clearTimeout(inactiveReportTimeout);
    inactiveReportTimeout = null;
  }

  if (autoRetry) {
    autoRetry.dispose();
    autoRetry = null;
  }

  if (uploadMonitor) {
    uploadMonitor.dispose();
    uploadMonitor = null;
  }

  if (uploadTracker) {
    uploadTracker.dispose();
    uploadTracker = null;
  }

  if (uploadOverlay) {
    uploadOverlay.dispose();
    uploadOverlay = null;
  }

  if (uploadControls) {
    uploadControls.dispose();
    uploadControls = null;
  }
});

// Initialize when script loads
initialize();
