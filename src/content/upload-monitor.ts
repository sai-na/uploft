/**
 * Upload Monitor - DOM monitoring system for Google Drive uploads
 * Uses stable selectors (ARIA attributes, role, data attributes) for reliable tracking
 */

/* eslint-disable no-console */

import type { UploadInfo } from '../types/upload.types.js';
import { UploadStatus } from '../types/upload.types.js';
import type {
  FileContainerElement,
  UploadDialogElement,
  FileUploadDOMData,
} from '../types/dom.types.js';
import {
  DOM_SELECTORS,
  isUploadDialog,
  isFileContainer,
  hasProgressData,
  hasFileNameTooltip,
  extractProgress as extractProgressFromElement,
  extractFileName as extractFileNameFromElement,
} from '../types/dom.types.js';
import { logger } from '../utils/logger.js';
import { rafDebounce } from '../utils/performance.js';

// Removed local debounce - now using rafDebounce from utils/performance.ts

/**
 * Parse file size string to bytes
 * @example "1.77 GB" -> 1770000000
 */
function parseFileSize(sizeStr: string | undefined): number {
  if (!sizeStr) {
    return 0;
  }

  const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);

  if (!match || !match[1] || !match[2]) {
    return 0;
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * (units[unit] ?? 1));
}

/**
 * Format bytes to human-readable size (reserved for future use)
 */
// @ts-expect-error - Reserved for future use
function _formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Upload monitor class for tracking Google Drive uploads
 */
export class UploadMonitor {
  /** MutationObserver instance for DOM monitoring */
  private observer: MutationObserver | null = null;

  /** WeakMap to track upload elements and their associated data */
  private uploadElements: WeakMap<HTMLElement, UploadInfo> = new WeakMap();

  /** Counter for generating unique upload IDs */
  private uploadIdCounter = 0;

  /** Map of upload IDs to their elements for reverse lookup */
  private uploadIdToElement: Map<string, HTMLElement> = new Map();

  /** Map of filenames to upload info for matching across element replacements */
  private fileNameToUpload: Map<string, UploadInfo> = new Map();

  /** Debounced update handler */
  private debouncedUpdate: (() => void) | null = null;

  /** Flag to track if observer is active */
  private isObserving = false;

  /** Callback for upload updates */
  private onUploadUpdate: ((uploads: UploadInfo[]) => void) | null = null;

  /** Polling interval for periodic updates */
  private pollingInterval: number | null = null;

  /**
   * Initialize the upload monitor
   */
  constructor(onUpdate?: (uploads: UploadInfo[]) => void) {
    this.onUploadUpdate = onUpdate ?? null;
    // Use RAF-based debouncing for better performance
    this.debouncedUpdate = rafDebounce(() => this.handleUpdate());
  }

  /**
   * Start monitoring for uploads
   */
  public start(): void {
    if (this.isObserving) {
      logger.warn('UploadMonitor', 'Already monitoring');
      return;
    }

    logger.info('UploadMonitor', 'Starting upload monitoring');

    // Create MutationObserver with debounced handler for performance
    const debouncedMutationHandler = rafDebounce(() => {
      // Note: We don't need mutations parameter as we query DOM directly
      console.log('[UploadMonitor] MutationObserver fired');
      const uploadDialog = this.findUploadDialog();
      console.log('[UploadMonitor] Upload dialog found:', !!uploadDialog);
      if (uploadDialog) {
        const hasChanges = this.processUploadDialog(uploadDialog);
        console.log('[UploadMonitor] Has changes:', hasChanges);
        if (hasChanges && this.debouncedUpdate) {
          this.debouncedUpdate();
        }
      }
    });

    this.observer = new MutationObserver(() => {
      debouncedMutationHandler();
    });

    // Optimize: Only observe dialog container area, not entire document.body
    // First, check if upload dialog exists
    const uploadDialog = this.findUploadDialog();
    const targetNode = uploadDialog ?? document.body;

    // Start observing with optimized settings
    this.observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-progress', 'aria-label', 'aria-hidden'],
    });

    this.isObserving = true;

    // Start 1-second polling for periodic updates
    this.pollingInterval = window.setInterval(() => {
      const uploadDialog = this.findUploadDialog();
      if (uploadDialog) {
        this.processUploadDialog(uploadDialog);
        if (this.debouncedUpdate) {
          this.debouncedUpdate();
        }
      }
    }, 1000);

    logger.info('UploadMonitor', 'Monitoring started');
  }

  /**
   * Stop monitoring for uploads
   */
  public stop(): void {
    if (!this.isObserving) {
      return;
    }

    logger.info('UploadMonitor', 'Stopping upload monitoring');

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.isObserving = false;

    logger.info('UploadMonitor', 'Monitoring stopped');
  }

  /**
   * Get all tracked uploads
   */
  public getUploads(): UploadInfo[] {
    const uploads: UploadInfo[] = [];

    for (const element of this.uploadIdToElement.values()) {
      const uploadInfo = this.uploadElements.get(element);
      if (uploadInfo) {
        uploads.push(uploadInfo);
      }
    }

    return uploads;
  }

  /**
   * Get upload by ID
   */
  public getUpload(id: string): UploadInfo | null {
    const element = this.uploadIdToElement.get(id);
    if (!element) {
      return null;
    }

    return this.uploadElements.get(element) ?? null;
  }

  /**
   * Find upload dialog in DOM
   */
  private findUploadDialog(): UploadDialogElement | null {
    const dialog = document.querySelector(DOM_SELECTORS.UPLOAD_DIALOG);

    if (isUploadDialog(dialog)) {
      return dialog;
    }

    return null;
  }

  /**
   * Process upload dialog and extract file containers
   */
  private processUploadDialog(dialog: UploadDialogElement): boolean {
    const fileContainers = dialog.querySelectorAll(
      DOM_SELECTORS.FILE_CONTAINER
    );
    console.log(
      '[UploadMonitor] File containers found:',
      fileContainers.length
    );
    let hasChanges = false;

    for (const container of fileContainers) {
      console.log('[UploadMonitor] Checking container:', {
        role: container.getAttribute('role'),
        ariaLabel: container.getAttribute('aria-label'),
        isValid: isFileContainer(container),
      });
      if (!isFileContainer(container)) {
        continue;
      }

      // Extract filename to check if this is an existing upload with replaced element
      const fileName = this.extractFileName(container);
      if (!fileName) {
        continue;
      }

      // Check if we're already tracking this upload by filename
      const existingUpload = this.fileNameToUpload.get(fileName);
      if (existingUpload) {
        // Update existing upload with new element reference
        const updated = this.updateUploadWithNewElement(
          existingUpload,
          container
        );
        if (updated) {
          hasChanges = true;
        }
        continue;
      }

      // Create new upload tracking entry
      const uploadInfo = this.createUploadInfo(container);
      if (uploadInfo) {
        this.uploadElements.set(container, uploadInfo);
        this.uploadIdToElement.set(uploadInfo.id, container);
        this.fileNameToUpload.set(uploadInfo.fileName, uploadInfo);
        hasChanges = true;

        logger.debug('UploadMonitor', 'New upload detected', {
          fileName: uploadInfo.fileName,
        });
      }
    }

    return hasChanges;
  }

  /**
   * Create UploadInfo from file container element
   */
  private createUploadInfo(container: FileContainerElement): UploadInfo | null {
    try {
      const domData = this.extractDOMData(container);

      if (!domData.fileName) {
        logger.warn(
          'UploadMonitor',
          'Could not extract filename from container'
        );
        return null;
      }

      const uploadId = `upload-${++this.uploadIdCounter}`;

      // Extract file sizes
      const sizeData = this.extractSizes(container);

      const uploadInfo: UploadInfo = {
        id: uploadId,
        element: container,
        fileName: domData.fileName,
        progress: domData.progress ?? 0,
        uploadedSize: sizeData?.uploadedSize ?? '0 B',
        totalSize: sizeData?.totalSize ?? '0 B',
        uploadedBytes: sizeData?.uploadedBytes ?? 0,
        totalBytes: sizeData?.totalBytes ?? 0,
        timeRemaining: null,
        uploadSpeed: domData.speed,
        status: this.determineStatus(domData.progress ?? 0, container),
        startTime: Date.now(),
      };

      return uploadInfo;
    } catch (error) {
      logger.error(
        'UploadMonitor',
        'Error creating upload info',
        error as Error
      );
      return null;
    }
  }

  /**
   * Update existing upload with new element reference (for replaced DOM elements)
   */
  private updateUploadWithNewElement(
    uploadInfo: UploadInfo,
    newContainer: FileContainerElement
  ): boolean {
    // Update element references
    const oldElement = uploadInfo.element;
    uploadInfo.element = newContainer;

    // Update WeakMap and ID map with new element
    this.uploadElements.set(newContainer, uploadInfo);
    this.uploadIdToElement.set(uploadInfo.id, newContainer);

    // Remove old element from WeakMap (it will be garbage collected)
    if (oldElement) {
      this.uploadElements.delete(oldElement);
    }

    console.log('[UploadMonitor] Updated element reference for:', {
      fileName: uploadInfo.fileName,
      oldElement: !!oldElement,
      newElement: !!newContainer,
    });

    // Now update the upload data with the new container
    return this.updateUploadElement(newContainer);
  }

  /**
   * Update existing upload element with new data
   */
  private updateUploadElement(element: HTMLElement): boolean {
    const uploadInfo = this.uploadElements.get(element);
    if (!uploadInfo) {
      return false;
    }

    try {
      const domData = this.extractDOMData(element as FileContainerElement);
      const container = element as FileContainerElement;

      // Update status (check for cancelled, complete, etc.)
      const newStatus = this.determineStatus(
        domData.progress ?? uploadInfo.progress,
        container
      );
      if (newStatus !== uploadInfo.status) {
        console.log('[UploadMonitor] Status changed:', {
          fileName: uploadInfo.fileName,
          oldStatus: uploadInfo.status,
          newStatus: newStatus,
        });
        uploadInfo.status = newStatus;

        if (uploadInfo.status === UploadStatus.COMPLETE) {
          uploadInfo.endTime = Date.now();
        } else if (uploadInfo.status === UploadStatus.CANCELLED) {
          uploadInfo.endTime = Date.now();
        }
      }

      // Update progress
      if (
        domData.progress !== null &&
        domData.progress !== uploadInfo.progress
      ) {
        uploadInfo.progress = domData.progress;
      }

      // Update file sizes
      const sizeData = this.extractSizes(element as FileContainerElement);
      if (sizeData) {
        uploadInfo.uploadedSize = sizeData.uploadedSize;
        uploadInfo.totalSize = sizeData.totalSize;
        uploadInfo.uploadedBytes = sizeData.uploadedBytes;
        uploadInfo.totalBytes = sizeData.totalBytes;
      }

      // Update speed
      if (domData.speed !== null) {
        uploadInfo.uploadSpeed = domData.speed;
      }

      // Update time remaining
      if (domData.timeRemaining !== null) {
        uploadInfo.timeRemaining = domData.timeRemaining;
      }

      return true;
    } catch (error) {
      logger.error(
        'UploadMonitor',
        'Error updating upload element',
        error as Error
      );
      return false;
    }
  }

  /**
   * Extract data from file container DOM element
   */
  private extractDOMData(container: FileContainerElement): FileUploadDOMData {
    const data: FileUploadDOMData = {
      container,
      fileName: this.extractFileName(container),
      progress: this.extractProgress(container),
      speed: this.extractSpeed(container),
      timeRemaining: this.extractTimeRemaining(container),
    };

    return data;
  }

  /**
   * Extract filename from container (Subtask 14.3)
   */
  private extractFileName(container: FileContainerElement): string | null {
    try {
      // Primary method: Find element with data-tooltip containing file extension
      const tooltipElement = container.querySelector('[data-tooltip*="."]');
      if (hasFileNameTooltip(tooltipElement)) {
        const fileName = extractFileNameFromElement(tooltipElement);
        if (fileName) {
          return fileName;
        }
      }

      // Fallback 1: Parse from container's aria-label
      const ariaLabel = container.getAttribute('aria-label');
      if (ariaLabel) {
        const match = ariaLabel.match(/File upload:\s*(.+)/);
        if (match?.[1]) {
          return match[1];
        }
      }

      // Fallback 2: Search for common file extensions in any text content
      const textContent = container.textContent ?? '';
      const extensionMatch = textContent.match(
        /[\w-]+\.(mkv|mp4|avi|mov|pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|png|jpe?g|gif|svg|txt|csv)/i
      );
      if (extensionMatch?.[0]) {
        return extensionMatch[0];
      }

      return 'Unknown file';
    } catch (error) {
      logger.error(
        'UploadMonitor',
        'Error extracting filename',
        error as Error
      );
      return 'Unknown file';
    }
  }

  /**
   * Extract progress from container (Subtask 14.4)
   */
  private extractProgress(container: FileContainerElement): number | null {
    try {
      // Primary method: data-progress attribute
      const progressElement = container.querySelector('[data-progress]');
      if (hasProgressData(progressElement)) {
        const progress = extractProgressFromElement(progressElement);
        if (progress !== null) {
          return progress;
        }
      }

      // Fallback 1: Parse from cancel button aria-label
      const cancelButton = container.querySelector(
        '[aria-label*="Cancel upload"]'
      );
      if (cancelButton) {
        const ariaLabel = cancelButton.getAttribute('aria-label');
        if (ariaLabel) {
          const match = ariaLabel.match(/\((\d+)%\)/);
          if (match?.[1]) {
            const progress = parseInt(match[1], 10);
            if (!isNaN(progress) && progress >= 0 && progress <= 100) {
              return progress;
            }
          }
        }
      }

      // Fallback 2: Search for progress bar element
      const progressBar = container.querySelector('[role="progressbar"]');
      if (progressBar) {
        const valueNow = progressBar.getAttribute('aria-valuenow');
        if (valueNow) {
          const progress = parseInt(valueNow, 10);
          if (!isNaN(progress)) {
            return Math.min(100, Math.max(0, progress));
          }
        }
      }

      return null;
    } catch (error) {
      logger.error(
        'UploadMonitor',
        'Error extracting progress',
        error as Error
      );
      return null;
    }
  }

  /**
   * Extract file sizes from container (Subtask 14.4)
   */
  private extractSizes(container: FileContainerElement): {
    uploadedSize: string;
    totalSize: string;
    uploadedBytes: number;
    totalBytes: number;
  } | null {
    try {
      // Parse from cancel button aria-label: "Cancel upload - 1.77 GB/2.37 GB (75%)"
      const cancelButton = container.querySelector(
        '[aria-label*="Cancel upload"]'
      );
      if (cancelButton) {
        const ariaLabel = cancelButton.getAttribute('aria-label');
        if (ariaLabel) {
          const match = ariaLabel.match(
            /(\d+\.?\d*\s*[KMGT]?B)\s*\/\s*(\d+\.?\d*\s*[KMGT]?B)/i
          );
          if (match && match[1] && match[2]) {
            const uploadedSize = match[1];
            const totalSize = match[2];
            const uploadedBytes = parseFileSize(uploadedSize);
            const totalBytes = parseFileSize(totalSize);

            return {
              uploadedSize,
              totalSize,
              uploadedBytes,
              totalBytes,
            };
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('UploadMonitor', 'Error extracting sizes', error as Error);
      return null;
    }
  }

  /**
   * Extract upload speed from container
   */
  private extractSpeed(container: FileContainerElement): string | null {
    try {
      const speedElement = container.querySelector('[data-speed]');
      if (
        speedElement instanceof HTMLElement &&
        speedElement.dataset['speed']
      ) {
        return speedElement.dataset['speed'];
      }

      return null;
    } catch (error) {
      logger.error('UploadMonitor', 'Error extracting speed', error as Error);
      return null;
    }
  }

  /**
   * Extract time remaining from container
   */
  private extractTimeRemaining(container: FileContainerElement): string | null {
    try {
      const timeElement = container.querySelector('[data-time-remaining]');
      if (
        timeElement instanceof HTMLElement &&
        timeElement.dataset['timeRemaining']
      ) {
        return timeElement.dataset['timeRemaining'];
      }

      return null;
    } catch (error) {
      logger.error(
        'UploadMonitor',
        'Error extracting time remaining',
        error as Error
      );
      return null;
    }
  }

  /**
   * Check if upload is cancelled
   */
  private isCancelled(container: FileContainerElement): boolean {
    // Check for "Upload cancelled" text in tooltips or aria-labels
    const cancelledIndicators = container.querySelectorAll(
      '[data-tooltip*="cancelled" i], [aria-label*="cancelled" i]'
    );
    const isCancelled = cancelledIndicators.length > 0;

    if (isCancelled) {
      console.log('[UploadMonitor] Detected cancelled upload:', {
        fileName: container.getAttribute('aria-label'),
        indicators: cancelledIndicators.length,
      });
    }

    return isCancelled;
  }

  /**
   * Determine upload status from progress and container state
   */
  private determineStatus(
    progress: number,
    container: FileContainerElement
  ): UploadStatus {
    // Check for cancelled state first
    if (this.isCancelled(container)) {
      return UploadStatus.CANCELLED;
    }

    if (progress === 0) {
      return UploadStatus.PENDING;
    } else if (progress === 100) {
      return UploadStatus.COMPLETE;
    } else {
      return UploadStatus.UPLOADING;
    }
  }

  /**
   * Handle upload updates
   */
  private handleUpdate(): void {
    if (this.onUploadUpdate) {
      const uploads = this.getUploads();
      this.onUploadUpdate(uploads);
    }
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    this.stop();
    this.uploadElements = new WeakMap();
    this.uploadIdToElement.clear();
    this.fileNameToUpload.clear();
    this.onUploadUpdate = null;
  }
}
