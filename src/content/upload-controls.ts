/**
 * Upload Controls - Integration with Google Drive's native upload buttons
 * Handles cancel, retry, and show location functionality
 */

import type { UploadInfo } from '../types/upload.types.js';

/**
 * Button selectors for Google Drive upload controls
 */
const CONTROL_SELECTORS = {
  /** Cancel upload button */
  CANCEL: '[aria-label*="Cancel upload"], [data-tooltip*="Cancel upload"]',
  /** Retry upload button */
  RETRY: '[aria-label*="Retry"], [data-tooltip*="Retry"]',
  /** Show file location button */
  LOCATION:
    '[aria-label*="Show file location"], [data-tooltip*="Show file location"]',
  /** Upload dialog container */
  DIALOG: '[role="dialog"][aria-label*="Uploading"]',
} as const;

/**
 * Control operation result
 */
export interface ControlResult {
  success: boolean;
  message: string;
  error?: Error;
}

/**
 * Retry attempt tracking
 */
interface RetryAttempt {
  uploadId: string;
  attempts: number;
  lastAttempt: number;
}

/**
 * Upload Controls Manager
 */
export class UploadControls {
  /** Retry attempts tracker */
  private retryAttempts: Map<string, RetryAttempt> = new Map();

  /** Maximum retry attempts per upload */
  private readonly MAX_RETRY_ATTEMPTS = 3;

  /** Minimum time between retry attempts (ms) */
  private readonly RETRY_COOLDOWN = 2000;

  /** Click simulation timeout (ms) */
  private readonly CLICK_TIMEOUT = 5000;

  /**
   * Initialize upload controls
   */
  constructor() {
    // Initialization complete
  }

  /**
   * Cancel upload (Subtask 17.1)
   */
  public async cancelUpload(upload: UploadInfo): Promise<ControlResult> {
    try {
      // Find cancel button within upload element
      const cancelButton = this.findButton(
        upload.element,
        CONTROL_SELECTORS.CANCEL
      );

      if (!cancelButton) {
        return {
          success: false,
          message: 'Cancel button not found',
        };
      }

      // Check if button is clickable
      if (!this.isButtonClickable(cancelButton)) {
        return {
          success: false,
          message: 'Cancel button is not clickable',
        };
      }

      // Simulate button click
      const clicked = await this.simulateClick(cancelButton);

      if (clicked) {
        return {
          success: true,
          message: 'Upload cancelled',
        };
      } else {
        return {
          success: false,
          message: 'Failed to click cancel button',
        };
      }
    } catch (error) {
      console.error('[UploadControls] Error cancelling upload:', error);
      return {
        success: false,
        message: 'Error during cancel operation',
        error: error as Error,
      };
    }
  }

  /**
   * Retry failed upload (Subtask 17.2)
   */
  public async retryUpload(upload: UploadInfo): Promise<ControlResult> {
    try {
      // Check retry attempts
      const retryInfo = this.retryAttempts.get(upload.id);

      if (retryInfo) {
        // Check max attempts
        if (retryInfo.attempts >= this.MAX_RETRY_ATTEMPTS) {
          return {
            success: false,
            message: `Maximum retry attempts (${this.MAX_RETRY_ATTEMPTS}) exceeded`,
          };
        }

        // Check cooldown
        const timeSinceLastAttempt = Date.now() - retryInfo.lastAttempt;
        if (timeSinceLastAttempt < this.RETRY_COOLDOWN) {
          return {
            success: false,
            message: 'Retry cooldown active, please wait',
          };
        }
      }

      // Find retry button within upload element
      const retryButton = this.findButton(
        upload.element,
        CONTROL_SELECTORS.RETRY
      );

      if (!retryButton) {
        return {
          success: false,
          message: 'Retry button not found',
        };
      }

      // Check if button is clickable
      if (!this.isButtonClickable(retryButton)) {
        return {
          success: false,
          message: 'Retry button is not clickable',
        };
      }

      // Simulate button click
      const clicked = await this.simulateClick(retryButton);

      if (clicked) {
        // Update retry tracking
        this.updateRetryAttempt(upload.id);

        return {
          success: true,
          message: `Upload retried (attempt ${this.retryAttempts.get(upload.id)?.attempts ?? 1}/${this.MAX_RETRY_ATTEMPTS})`,
        };
      } else {
        return {
          success: false,
          message: 'Failed to click retry button',
        };
      }
    } catch (error) {
      console.error('[UploadControls] Error retrying upload:', error);
      return {
        success: false,
        message: 'Error during retry operation',
        error: error as Error,
      };
    }
  }

  /**
   * Show file location (Subtask 17.3)
   */
  public async showFileLocation(upload: UploadInfo): Promise<ControlResult> {
    try {
      // Find location button within upload element
      const locationButton = this.findButton(
        upload.element,
        CONTROL_SELECTORS.LOCATION
      );

      if (!locationButton) {
        return {
          success: false,
          message: 'Show file location button not found',
        };
      }

      // Check if button is clickable
      if (!this.isButtonClickable(locationButton)) {
        return {
          success: false,
          message: 'Location button is not clickable',
        };
      }

      // Simulate button click
      const clicked = await this.simulateClick(locationButton);

      if (clicked) {
        return {
          success: true,
          message: 'Navigated to file location',
        };
      } else {
        return {
          success: false,
          message: 'Failed to click location button',
        };
      }
    } catch (error) {
      console.error('[UploadControls] Error showing location:', error);
      return {
        success: false,
        message: 'Error during show location operation',
        error: error as Error,
      };
    }
  }

  /**
   * Find button within element using selector (Subtask 17.4)
   */
  private findButton(
    element: HTMLElement,
    selector: string
  ): HTMLElement | null {
    try {
      // Find the upload container (might be the element itself or a parent)
      const container = element.closest('[role="group"]') ?? element;

      // Search for button within container
      const button = container.querySelector(selector);

      if (button && button instanceof HTMLElement) {
        return button;
      }

      // Fallback: search in parent dialog
      const dialog = document.querySelector(CONTROL_SELECTORS.DIALOG);
      if (dialog) {
        const buttonInDialog = dialog.querySelector(selector);
        if (buttonInDialog && buttonInDialog instanceof HTMLElement) {
          // Verify button is related to this upload
          const closestContainer = buttonInDialog.closest('[role="group"]');
          if (closestContainer === container) {
            return buttonInDialog;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[UploadControls] Error finding button:', error);
      return null;
    }
  }

  /**
   * Check if button is clickable (Subtask 17.4, 17.5)
   */
  private isButtonClickable(button: HTMLElement): boolean {
    try {
      // Check if element is connected to DOM
      if (!button.isConnected) {
        return false;
      }

      // Check if button is disabled
      if (button.hasAttribute('disabled')) {
        return false;
      }

      // Check if button is hidden
      const style = window.getComputedStyle(button);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      ) {
        return false;
      }

      // Check aria-hidden
      if (button.getAttribute('aria-hidden') === 'true') {
        return false;
      }

      return true;
    } catch (error) {
      console.error(
        '[UploadControls] Error checking button clickability:',
        error
      );
      return false;
    }
  }

  /**
   * Simulate button click with proper event dispatching (Subtask 17.4)
   */
  private async simulateClick(button: HTMLElement): Promise<boolean> {
    try {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[UploadControls] Click simulation timed out');
          resolve(false);
        }, this.CLICK_TIMEOUT);

        try {
          // Focus the button
          button.focus();

          // Create and dispatch mouse events
          const mouseDownEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
          });

          const mouseUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
          });

          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
          });

          // Dispatch events in proper order
          button.dispatchEvent(mouseDownEvent);
          button.dispatchEvent(mouseUpEvent);
          button.dispatchEvent(clickEvent);

          // Also try native click as fallback
          button.click();

          clearTimeout(timeout);
          resolve(true);
        } catch (error) {
          clearTimeout(timeout);
          console.error(
            '[UploadControls] Error dispatching click events:',
            error
          );
          resolve(false);
        }
      });
    } catch (error) {
      console.error('[UploadControls] Error in simulateClick:', error);
      return false;
    }
  }

  /**
   * Update retry attempt tracking (Subtask 17.2)
   */
  private updateRetryAttempt(uploadId: string): void {
    const existing = this.retryAttempts.get(uploadId);

    if (existing) {
      existing.attempts += 1;
      existing.lastAttempt = Date.now();
    } else {
      this.retryAttempts.set(uploadId, {
        uploadId,
        attempts: 1,
        lastAttempt: Date.now(),
      });
    }
  }

  /**
   * Clear retry attempts for upload
   */
  public clearRetryAttempts(uploadId: string): void {
    this.retryAttempts.delete(uploadId);
  }

  /**
   * Get retry attempt info
   */
  public getRetryAttempts(uploadId: string): RetryAttempt | null {
    return this.retryAttempts.get(uploadId) ?? null;
  }

  /**
   * Check if upload can be retried
   */
  public canRetry(uploadId: string): boolean {
    const retryInfo = this.retryAttempts.get(uploadId);

    if (!retryInfo) {
      return true; // No attempts yet
    }

    // Check max attempts
    if (retryInfo.attempts >= this.MAX_RETRY_ATTEMPTS) {
      return false;
    }

    // Check cooldown
    const timeSinceLastAttempt = Date.now() - retryInfo.lastAttempt;
    return timeSinceLastAttempt >= this.RETRY_COOLDOWN;
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    this.retryAttempts.clear();
  }
}
