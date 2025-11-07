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

/**
 * Debounce utility for performance optimization
 */
function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>): void {
    if (timeout !== null) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

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

  /** Debounced update handler */
  private debouncedUpdate: (() => void) | null = null;

  /** Polling interval ID for fallback monitoring */
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  /** Flag to track if observer is active */
  private isObserving = false;

  /** Callback for upload updates */
  private onUploadUpdate: ((uploads: UploadInfo[]) => void) | null = null;

  /**
   * Initialize the upload monitor
   */
  constructor(onUpdate?: (uploads: UploadInfo[]) => void) {
    this.onUploadUpdate = onUpdate ?? null;
    this.debouncedUpdate = debounce(() => this.handleUpdate(), 150);
  }

  /**
   * Start monitoring for uploads
   */
  public start(): void {
    if (this.isObserving) {
      console.warn('[UploadMonitor] Already monitoring');
      return;
    }

    console.log('[UploadMonitor] Starting upload monitoring...');

    // Create MutationObserver
    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-progress', 'aria-label', 'aria-hidden'],
    });

    this.isObserving = true;

    // Start fallback polling (500ms interval)
    this.startPolling();

    console.log('[UploadMonitor] Monitoring started');
  }

  /**
   * Stop monitoring for uploads
   */
  public stop(): void {
    if (!this.isObserving) {
      return;
    }

    console.log('[UploadMonitor] Stopping upload monitoring...');

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.stopPolling();
    this.isObserving = false;

    console.log('[UploadMonitor] Monitoring stopped');
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
   * Handle mutation events
   */
  private handleMutations(mutations: MutationRecord[]): void {
    let hasChanges = false;

    for (const mutation of mutations) {
      // Check for upload dialog additions
      if (mutation.type === 'childList') {
        const uploadDialog = this.findUploadDialog();
        if (uploadDialog) {
          hasChanges = this.processUploadDialog(uploadDialog) || hasChanges;
        }
      }

      // Check for attribute changes (progress updates)
      if (mutation.type === 'attributes') {
        const target = mutation.target as HTMLElement;
        if (this.uploadElements.has(target)) {
          hasChanges = this.updateUploadElement(target) || hasChanges;
        }
      }
    }

    if (hasChanges && this.debouncedUpdate) {
      this.debouncedUpdate();
    }
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
    let hasNewUploads = false;

    for (const container of fileContainers) {
      if (!isFileContainer(container)) {
        continue;
      }

      // Skip if already tracking this element
      if (this.uploadElements.has(container)) {
        this.updateUploadElement(container);
        continue;
      }

      // Create new upload tracking entry
      const uploadInfo = this.createUploadInfo(container);
      if (uploadInfo) {
        this.uploadElements.set(container, uploadInfo);
        this.uploadIdToElement.set(uploadInfo.id, container);
        hasNewUploads = true;

        console.log(
          `[UploadMonitor] New upload detected: ${uploadInfo.fileName}`
        );
      }
    }

    return hasNewUploads;
  }

  /**
   * Create UploadInfo from file container element
   */
  private createUploadInfo(container: FileContainerElement): UploadInfo | null {
    try {
      const domData = this.extractDOMData(container);

      if (!domData.fileName) {
        console.warn(
          '[UploadMonitor] Could not extract filename from container'
        );
        return null;
      }

      const uploadId = `upload-${++this.uploadIdCounter}`;

      const uploadInfo: UploadInfo = {
        id: uploadId,
        element: container,
        fileName: domData.fileName,
        progress: domData.progress ?? 0,
        uploadedSize: '0 B',
        totalSize: '0 B',
        uploadedBytes: 0,
        totalBytes: 0,
        timeRemaining: null,
        uploadSpeed: domData.speed,
        status: this.determineStatus(domData.progress ?? 0),
        startTime: Date.now(),
      };

      return uploadInfo;
    } catch (error) {
      console.error('[UploadMonitor] Error creating upload info:', error);
      return null;
    }
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

      // Update progress
      if (
        domData.progress !== null &&
        domData.progress !== uploadInfo.progress
      ) {
        uploadInfo.progress = domData.progress;
        uploadInfo.status = this.determineStatus(domData.progress);

        if (uploadInfo.status === UploadStatus.COMPLETE) {
          uploadInfo.endTime = Date.now();
        }
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
      console.error('[UploadMonitor] Error updating upload element:', error);
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
        const match = ariaLabel.match(/File Upload:\s*(.+)/);
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
      console.error('[UploadMonitor] Error extracting filename:', error);
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
      console.error('[UploadMonitor] Error extracting progress:', error);
      return null;
    }
  }

  /**
   * Extract file sizes from container (Subtask 14.4)
   * Reserved for future use
   */
  // @ts-expect-error - Reserved for future use
  private _extractSizes(container: FileContainerElement): {
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
      console.error('[UploadMonitor] Error extracting sizes:', error);
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
      console.error('[UploadMonitor] Error extracting speed:', error);
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
      console.error('[UploadMonitor] Error extracting time remaining:', error);
      return null;
    }
  }

  /**
   * Determine upload status from progress
   */
  private determineStatus(progress: number): UploadStatus {
    if (progress === 0) {
      return UploadStatus.PENDING;
    } else if (progress === 100) {
      return UploadStatus.COMPLETE;
    } else {
      return UploadStatus.UPLOADING;
    }
  }

  /**
   * Start polling fallback (Subtask 14.5)
   */
  private startPolling(): void {
    if (this.pollingInterval !== null) {
      return;
    }

    this.pollingInterval = setInterval(() => {
      this.pollForUploads();
    }, 500);
  }

  /**
   * Stop polling fallback
   */
  private stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Poll for uploads (fallback when MutationObserver fails)
   */
  private pollForUploads(): void {
    try {
      const uploadDialog = this.findUploadDialog();
      if (uploadDialog) {
        const hasChanges = this.processUploadDialog(uploadDialog);
        if (hasChanges && this.debouncedUpdate) {
          this.debouncedUpdate();
        }
      }
    } catch (error) {
      console.error('[UploadMonitor] Polling error:', error);
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
    this.onUploadUpdate = null;
  }
}
