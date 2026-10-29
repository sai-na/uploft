/**
 * Upload Guard
 * Keeps uploads alive while they run: holds a system keep-awake so the
 * computer doesn't sleep mid-upload, and stops Chrome's Memory Saver from
 * discarding the uploading tab (a discarded tab drops its upload).
 */

import { loadPreferences } from '../types/storage.types.js';

/** Session storage key for tabs with uploads in flight */
const ACTIVE_TABS_KEY = 'activeUploadTabs';

export class UploadGuard {
  /** Serializes read-modify-write of the active tab list */
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    chrome.tabs.onRemoved.addListener((tabId) => {
      void this.setTabActive(tabId, false);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes['preferences']) {
        void this.enqueue(async () => {
          await this.applyKeepAwake((await this.getActiveTabs()).length > 0);
        });
      }
    });
  }

  /**
   * Record that a tab started or stopped uploading
   */
  public setTabActive(tabId: number, active: boolean): Promise<void> {
    return this.enqueue(async () => {
      const tabs = new Set(await this.getActiveTabs());
      if (active === tabs.has(tabId)) {
        return;
      }

      if (active) {
        tabs.add(tabId);
      } else {
        tabs.delete(tabId);
      }

      await chrome.storage.session.set({ [ACTIVE_TABS_KEY]: [...tabs] });

      try {
        await chrome.tabs.update(tabId, { autoDiscardable: !active });
      } catch {
        // Tab already closed
      }

      await this.applyKeepAwake(tabs.size > 0);
    });
  }

  private async getActiveTabs(): Promise<number[]> {
    const result = await chrome.storage.session.get(ACTIVE_TABS_KEY);
    return (result[ACTIVE_TABS_KEY] as number[] | undefined) ?? [];
  }

  private async applyKeepAwake(uploading: boolean): Promise<void> {
    const { keepAwake } = await loadPreferences();
    if (uploading && keepAwake) {
      chrome.power.requestKeepAwake('system');
    } else {
      chrome.power.releaseKeepAwake();
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(task).catch((error: unknown) => {
      console.error('[UploadGuard] Error updating upload state:', error);
    });
    return this.queue;
  }
}
