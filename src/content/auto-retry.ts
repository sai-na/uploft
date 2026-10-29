/**
 * Auto Retry - retries failed Drive uploads without the user clicking Retry
 * Backs off between attempts and waits for the network to come back when offline
 */

import type { UploadInfo } from '../types/upload.types.js';
import { UploadStatus } from '../types/upload.types.js';
import type { UploadControls } from './upload-controls.js';
import { logger } from '../utils/logger.js';

/** Delay before each automatic attempt (ms); its length caps the attempts */
const RETRY_DELAYS = [5000, 20000, 60000];

/** Pause after the network returns, so Drive can reconnect first (ms) */
const ONLINE_SETTLE_DELAY = 3000;

interface AutoRetryOptions {
  controls: UploadControls;
  /** Look up the latest state of an upload */
  getUpload: (id: string) => UploadInfo | null;
  /** Called when an upload will not be retried again */
  onGiveUp: (upload: UploadInfo) => void;
  /** Called when the set of pending retries changes */
  onPendingChange: () => void;
}

export class AutoRetry {
  private enabled = true;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private waitingForNetwork: Set<string> = new Set();
  private attempts: Map<string, number> = new Map();
  private readonly options: AutoRetryOptions;

  constructor(options: AutoRetryOptions) {
    this.options = options;
    window.addEventListener('online', this.handleOnline);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      [...this.timers.keys(), ...this.waitingForNetwork].forEach((id) => {
        const upload = this.options.getUpload(id);
        this.cancel(id);
        if (upload) {
          this.options.onGiveUp(upload);
        }
      });
    }
  }

  /**
   * Handle an upload that just failed
   */
  public handleFailure(upload: UploadInfo): void {
    const attempt = this.attempts.get(upload.id) ?? 0;
    if (!this.enabled || attempt >= RETRY_DELAYS.length) {
      this.cancel(upload.id);
      this.options.onGiveUp(upload);
      return;
    }

    if (this.timers.has(upload.id) || this.waitingForNetwork.has(upload.id)) {
      return;
    }

    if (!navigator.onLine) {
      this.waitingForNetwork.add(upload.id);
    } else {
      this.schedule(upload.id, RETRY_DELAYS[attempt] ?? 0);
    }
    this.options.onPendingChange();
  }

  /**
   * Forget an upload (completed, cancelled or removed)
   */
  public cancel(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
    }
    const hadPending =
      this.timers.delete(id) || this.waitingForNetwork.delete(id);
    this.attempts.delete(id);
    if (hadPending) {
      this.options.onPendingChange();
    }
  }

  public hasPending(): boolean {
    return this.timers.size > 0 || this.waitingForNetwork.size > 0;
  }

  public dispose(): void {
    window.removeEventListener('online', this.handleOnline);
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.waitingForNetwork.clear();
    this.attempts.clear();
  }

  private schedule(id: string, delay: number): void {
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        void this.attempt(id);
      }, delay)
    );
  }

  private async attempt(id: string): Promise<void> {
    const upload = this.options.getUpload(id);
    if (!upload || upload.status !== UploadStatus.FAILED) {
      this.cancel(id);
      return;
    }

    if (!navigator.onLine) {
      this.waitingForNetwork.add(id);
      return;
    }

    const attempt = (this.attempts.get(id) ?? 0) + 1;
    this.attempts.set(id, attempt);

    const result = await this.options.controls.retryUpload(upload);
    logger.info('AutoRetry', 'Retried upload', {
      fileName: upload.fileName,
      attempt,
      success: result.success,
    });

    if (!result.success) {
      // Drive no longer offers a retry for this file
      this.attempts.set(id, RETRY_DELAYS.length);
      this.handleFailure(upload);
      return;
    }

    this.options.onPendingChange();
  }

  private handleOnline = (): void => {
    const waiting = [...this.waitingForNetwork];
    this.waitingForNetwork.clear();
    waiting.forEach((id) => this.schedule(id, ONLINE_SETTLE_DELAY));
  };
}
