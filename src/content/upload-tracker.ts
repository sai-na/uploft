/**
 * Upload Tracker - Centralized state management for upload tracking
 * Handles state persistence, event emission, and advanced status detection
 */

import type {
  UploadInfo,
  UploadStatus,
  UploadEvent,
  UploadEventCallback,
} from '../types/upload.types.js';
import {
  UploadStatus as UploadStatusEnum,
  UploadEventType,
} from '../types/upload.types.js';
import { logger } from '../utils/logger.js';
import { debounce } from '../utils/performance.js';

/**
 * Storage data structure for Chrome Storage API
 */
interface UploadStorageData {
  /** Map of upload ID to serialized upload info */
  uploads: Record<string, SerializedUploadInfo>;
  /** Last update timestamp */
  lastUpdate: number;
}

/**
 * Serialized upload info (without DOM element reference)
 */
interface SerializedUploadInfo {
  id: string;
  fileName: string;
  progress: number;
  uploadedSize: string;
  totalSize: string;
  uploadedBytes: number;
  totalBytes: number;
  timeRemaining: string | null;
  uploadSpeed: string | null;
  status: UploadStatus;
  startTime: number;
  endTime?: number;
  errorMessage?: string;
}

/**
 * Event listener entry
 */
interface EventListener {
  type: UploadEventType;
  callback: UploadEventCallback;
}

/**
 * Button visibility selectors for status detection
 */
const BUTTON_SELECTORS = {
  /** Cancel button (visible during upload) */
  CANCEL: '[aria-label*="Cancel upload"]',
  /** Retry button (visible after failure) */
  RETRY: '[aria-label*="Retry"]',
  /** Complete indicator */
  COMPLETE: '[aria-label*="Complete"]',
  /** Error indicator */
  ERROR: '[aria-label*="Error"]',
} as const;

/**
 * Upload Tracker class for centralized state management
 */
export class UploadTracker {
  /** WeakMap to track upload elements and their data (Subtask 15.1) */
  private uploadElements: WeakMap<HTMLElement, UploadInfo> = new WeakMap();

  /** Map of upload IDs to their data for persistence */
  private uploads: Map<string, UploadInfo> = new Map();

  /** Map of upload IDs to their DOM elements */
  private uploadIdToElement: Map<string, HTMLElement> = new Map();

  /** Event listeners (Subtask 15.2) */
  private eventListeners: EventListener[] = [];

  /** Storage key for Chrome Storage API */
  private readonly STORAGE_KEY = 'upload_tracker_data';

  /** Maximum storage entries (to prevent quota issues) */
  private readonly MAX_STORAGE_ENTRIES = 100;

  /** Debounced storage save to prevent excessive writes */
  private debouncedSaveToStorage: () => void;

  /**
   * Initialize the upload tracker
   */
  constructor() {
    // Create debounced storage saver (500ms delay to batch rapid changes)
    this.debouncedSaveToStorage = debounce(() => {
      void this.saveToStorage();
    }, 500);

    // Load persisted state on initialization
    void this.loadFromStorage();
  }

  /**
   * Add event listener (Subtask 15.2)
   */
  public addEventListener(
    type: UploadEventType,
    callback: UploadEventCallback
  ): void {
    this.eventListeners.push({ type, callback });
  }

  /**
   * Remove event listener (Subtask 15.2)
   */
  public removeEventListener(
    type: UploadEventType,
    callback: UploadEventCallback
  ): void {
    this.eventListeners = this.eventListeners.filter(
      (listener) => listener.type !== type || listener.callback !== callback
    );
  }

  /**
   * Emit event to all registered listeners (Subtask 15.2)
   */
  private emitEvent(type: UploadEventType, upload: UploadInfo): void {
    const event: UploadEvent = {
      type,
      upload,
      timestamp: Date.now(),
    };

    // Call all matching listeners
    this.eventListeners
      .filter((listener) => listener.type === type)
      .forEach((listener) => {
        try {
          listener.callback(event);
        } catch (error) {
          logger.error(
            'UploadTracker',
            `Error in event listener for ${type}`,
            error as Error
          );
        }
      });
  }

  /**
   * Add upload to tracking (Subtask 15.3)
   */
  public addUpload(upload: UploadInfo): void {
    // Validate upload data
    if (!upload.id || !upload.fileName) {
      logger.error('UploadTracker', 'Invalid upload data', undefined, upload);
      return;
    }

    // Check if already tracking
    if (this.uploads.has(upload.id)) {
      logger.warn('UploadTracker', 'Upload already tracked', { id: upload.id });
      return;
    }

    // Store in both WeakMap and Map
    this.uploadElements.set(upload.element, upload);
    this.uploads.set(upload.id, upload);
    this.uploadIdToElement.set(upload.id, upload.element);

    // Emit event
    this.emitEvent(UploadEventType.UPLOAD_STARTED, upload);

    // Persist to storage (debounced)
    this.debouncedSaveToStorage();

    logger.debug('UploadTracker', 'Added upload', {
      fileName: upload.fileName,
    });
  }

  /**
   * Update upload state (Subtask 15.3)
   */
  public updateUpload(
    id: string,
    updates: Partial<Omit<UploadInfo, 'id' | 'element'>>
  ): void {
    const upload = this.uploads.get(id);
    if (!upload) {
      logger.warn('UploadTracker', 'Upload not found for update', { id });
      return;
    }

    // Store previous status to detect status changes
    const previousStatus = upload.status;
    const previousProgress = upload.progress;

    // Apply updates (immutable style)
    Object.assign(upload, updates);

    // Detect status from button visibility if element is available (Subtask 15.4)
    if (upload.element && upload.element.isConnected) {
      const detectedStatus = this.detectUploadStatus(upload.element);
      if (detectedStatus) {
        upload.status = detectedStatus;
      }
    }

    // Update WeakMap
    this.uploadElements.set(upload.element, upload);

    // Emit appropriate events based on status changes
    if (upload.status !== previousStatus) {
      this.emitStatusChangeEvent(upload, previousStatus);
    } else if (upload.progress !== previousProgress) {
      this.emitEvent(UploadEventType.UPLOAD_PROGRESS, upload);
    }

    // Persist to storage (debounced)
    this.debouncedSaveToStorage();
  }

  /**
   * Emit appropriate event based on status change
   */
  private emitStatusChangeEvent(
    upload: UploadInfo,
    previousStatus: UploadStatus
  ): void {
    switch (upload.status) {
      case UploadStatusEnum.COMPLETE:
        this.emitEvent(UploadEventType.UPLOAD_COMPLETED, upload);
        break;
      case UploadStatusEnum.FAILED:
        this.emitEvent(UploadEventType.UPLOAD_FAILED, upload);
        break;
      case UploadStatusEnum.CANCELLED:
        this.emitEvent(UploadEventType.UPLOAD_CANCELLED, upload);
        break;
      case UploadStatusEnum.PAUSED:
        this.emitEvent(UploadEventType.UPLOAD_PAUSED, upload);
        break;
      case UploadStatusEnum.UPLOADING:
        if (previousStatus === UploadStatusEnum.PAUSED) {
          this.emitEvent(UploadEventType.UPLOAD_RESUMED, upload);
        }
        break;
    }
  }

  /**
   * Remove upload from tracking (Subtask 15.3)
   */
  public removeUpload(id: string): void {
    const upload = this.uploads.get(id);
    if (!upload) {
      logger.warn('UploadTracker', 'Upload not found for removal', { id });
      return;
    }

    // Remove from all tracking structures
    this.uploads.delete(id);
    this.uploadIdToElement.delete(id);
    // WeakMap entry will be garbage collected automatically

    // Persist to storage (debounced)
    this.debouncedSaveToStorage();

    logger.debug('UploadTracker', 'Removed upload', {
      fileName: upload.fileName,
    });
  }

  /**
   * Get upload by ID (Subtask 15.3)
   */
  public getUpload(id: string): UploadInfo | null {
    return this.uploads.get(id) ?? null;
  }

  /**
   * Get all uploads (Subtask 15.3)
   */
  public getAllUploads(): UploadInfo[] {
    return Array.from(this.uploads.values());
  }

  /**
   * Get uploads by status
   */
  public getUploadsByStatus(status: UploadStatus): UploadInfo[] {
    return this.getAllUploads().filter((upload) => upload.status === status);
  }

  /**
   * Clear completed uploads
   */
  public clearCompleted(): void {
    const completedIds = this.getUploadsByStatus(UploadStatusEnum.COMPLETE).map(
      (u) => u.id
    );

    completedIds.forEach((id) => this.removeUpload(id));

    logger.info('UploadTracker', 'Cleared completed uploads', {
      count: completedIds.length,
    });
  }

  /**
   * Detect upload status based on button visibility (Subtask 15.4)
   */
  private detectUploadStatus(element: HTMLElement): UploadStatus | null {
    try {
      // Find the file container (might be the element itself or a parent)
      const container = element.closest('[role="group"]') ?? element;

      // Check for cancel button (upload in progress)
      const cancelButton = container.querySelector(BUTTON_SELECTORS.CANCEL);
      if (cancelButton && this.isElementVisible(cancelButton as HTMLElement)) {
        return UploadStatusEnum.UPLOADING;
      }

      // Check for retry button (upload failed)
      const retryButton = container.querySelector(BUTTON_SELECTORS.RETRY);
      if (retryButton && this.isElementVisible(retryButton as HTMLElement)) {
        return UploadStatusEnum.FAILED;
      }

      // Check for error indicator
      const errorIndicator = container.querySelector(BUTTON_SELECTORS.ERROR);
      if (
        errorIndicator &&
        this.isElementVisible(errorIndicator as HTMLElement)
      ) {
        return UploadStatusEnum.FAILED;
      }

      // Check for complete indicator
      const completeIndicator = container.querySelector(
        BUTTON_SELECTORS.COMPLETE
      );
      if (
        completeIndicator &&
        this.isElementVisible(completeIndicator as HTMLElement)
      ) {
        return UploadStatusEnum.COMPLETE;
      }

      // Fallback: check if element is still in DOM
      if (!element.isConnected) {
        // Element removed - likely completed or cancelled
        return null;
      }

      return null;
    } catch (error) {
      logger.error(
        'UploadTracker',
        'Error detecting upload status',
        error as Error
      );
      return null;
    }
  }

  /**
   * Check if element is visible (not hidden by CSS)
   */
  private isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }

  /**
   * Serialize upload info for storage (remove DOM element reference)
   */
  private serializeUpload(upload: UploadInfo): SerializedUploadInfo {
    const { element: _element, ...serialized } = upload;
    return serialized;
  }

  /**
   * Save state to Chrome Storage API (Subtask 15.5)
   */
  private async saveToStorage(): Promise<void> {
    try {
      // Get all uploads (excluding those with DOM elements no longer in document)
      const uploads = this.getAllUploads().filter(
        (upload) => upload.element.isConnected
      );

      // Limit storage to prevent quota issues
      const uploadsToStore = uploads.slice(0, this.MAX_STORAGE_ENTRIES);

      // Serialize uploads
      const serializedUploads: Record<string, SerializedUploadInfo> = {};
      for (const upload of uploadsToStore) {
        serializedUploads[upload.id] = this.serializeUpload(upload);
      }

      const storageData: UploadStorageData = {
        uploads: serializedUploads,
        lastUpdate: Date.now(),
      };

      // Save to Chrome Storage
      await chrome.storage.local.set({ [this.STORAGE_KEY]: storageData });

      logger.debug('UploadTracker', 'Saved uploads to storage', {
        count: uploadsToStore.length,
      });
    } catch (error) {
      logger.error('UploadTracker', 'Error saving to storage', error as Error);
    }
  }

  /**
   * Load state from Chrome Storage API (Subtask 15.5)
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const storageData = result[this.STORAGE_KEY] as
        | UploadStorageData
        | undefined;

      if (!storageData || !storageData.uploads) {
        logger.debug('UploadTracker', 'No saved state found');
        return;
      }

      // Check if data is stale (older than 24 hours)
      const ONE_DAY = 24 * 60 * 60 * 1000;
      if (Date.now() - storageData.lastUpdate > ONE_DAY) {
        logger.debug('UploadTracker', 'Saved state is stale, clearing');
        await this.clearStorage();
        return;
      }

      // Note: We cannot restore DOM element references, so we only load
      // the data for informational purposes. New uploads will replace these.
      logger.debug('UploadTracker', 'Loaded uploads from storage', {
        count: Object.keys(storageData.uploads).length,
      });
    } catch (error) {
      logger.error(
        'UploadTracker',
        'Error loading from storage',
        error as Error
      );
    }
  }

  /**
   * Clear storage (Subtask 15.5)
   */
  public async clearStorage(): Promise<void> {
    try {
      await chrome.storage.local.remove(this.STORAGE_KEY);
      logger.info('UploadTracker', 'Cleared storage');
    } catch (error) {
      logger.error('UploadTracker', 'Error clearing storage', error as Error);
    }
  }

  /**
   * Get storage usage statistics
   */
  public async getStorageStats(): Promise<{
    bytesInUse: number;
    uploadCount: number;
  }> {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse(
        this.STORAGE_KEY
      );
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const storageData = result[this.STORAGE_KEY] as
        | UploadStorageData
        | undefined;

      return {
        bytesInUse,
        uploadCount: storageData ? Object.keys(storageData.uploads).length : 0,
      };
    } catch (error) {
      logger.error(
        'UploadTracker',
        'Error getting storage stats',
        error as Error
      );
      return { bytesInUse: 0, uploadCount: 0 };
    }
  }

  /**
   * Cleanup old completed uploads from storage
   */
  public async cleanupOldUploads(
    maxAge: number = 24 * 60 * 60 * 1000
  ): Promise<void> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const storageData = result[this.STORAGE_KEY] as
        | UploadStorageData
        | undefined;

      if (!storageData || !storageData.uploads) {
        return;
      }

      const now = Date.now();
      const uploads = storageData.uploads;
      let cleanedCount = 0;

      // Remove completed uploads older than maxAge
      for (const [id, upload] of Object.entries(uploads)) {
        if (
          upload.status === UploadStatusEnum.COMPLETE &&
          upload.endTime &&
          now - upload.endTime > maxAge
        ) {
          delete uploads[id];
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        storageData.uploads = uploads;
        storageData.lastUpdate = Date.now();
        await chrome.storage.local.set({ [this.STORAGE_KEY]: storageData });
        logger.info('UploadTracker', 'Cleaned up old uploads', {
          count: cleanedCount,
        });
      }
    } catch (error) {
      logger.error(
        'UploadTracker',
        'Error cleaning up old uploads',
        error as Error
      );
    }
  }

  /**
   * Dispose of the tracker and cleanup resources
   */
  public dispose(): void {
    // Clear event listeners
    this.eventListeners = [];

    // Clear tracking structures
    this.uploads.clear();
    this.uploadIdToElement.clear();
    this.uploadElements = new WeakMap();

    logger.info('UploadTracker', 'Disposed');
  }
}
