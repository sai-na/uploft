/**
 * Chrome Notifications Manager
 * Handles desktop notifications for upload events
 */

/* eslint-disable no-console */

import type { UserPreferences } from '../types/storage.types.js';

/**
 * Notification type enum
 */
export enum NotificationType {
  UPLOAD_COMPLETE = 'upload_complete',
  UPLOAD_FAILED = 'upload_failed',
  UPLOAD_CANCELLED = 'upload_cancelled',
  BATCH_COMPLETE = 'batch_complete',
}

/**
 * Notification data interface
 */
export interface NotificationData {
  fileName?: string;
  fileCount?: number;
  error?: string;
  uploadId?: string;
  tabId?: number;
}

/**
 * Notification template interface
 */
interface NotificationTemplate {
  iconUrl: string;
  title: string;
  message: string;
  priority?: number;
  requireInteraction?: boolean;
}

/**
 * Chrome Notifications Manager
 */
export class NotificationManager {
  /** Notification ID prefix */
  private readonly NOTIFICATION_PREFIX = 'upload-tracker';

  /** Active notification IDs mapped to tab IDs */
  private activeNotifications: Map<string, number> = new Map();

  /**
   * Initialize notification manager
   */
  constructor() {
    this.setupClickHandlers();
    console.log('[NotificationManager] Initialized');
  }

  /**
   * Check if notifications are enabled
   */
  public async isEnabled(): Promise<boolean> {
    try {
      const result = await chrome.storage.sync.get('preferences');
      const preferences = result['preferences'] as UserPreferences | undefined;
      return preferences?.enableNotifications ?? true;
    } catch (error) {
      console.error('[NotificationManager] Error checking preferences:', error);
      return false;
    }
  }

  /**
   * Check if specific notification type is enabled
   */
  private async isNotificationTypeEnabled(
    type: NotificationType
  ): Promise<boolean> {
    try {
      const result = await chrome.storage.sync.get('preferences');
      const preferences = result['preferences'] as UserPreferences | undefined;

      if (!preferences?.enableNotifications) {
        return false;
      }

      switch (type) {
        case NotificationType.UPLOAD_COMPLETE:
          return preferences.notifyOnComplete ?? true;
        case NotificationType.UPLOAD_FAILED:
          return preferences.notifyOnFailed ?? true;
        case NotificationType.UPLOAD_CANCELLED:
          return preferences.notifyOnCancelled ?? false;
        case NotificationType.BATCH_COMPLETE:
          return preferences.notifyOnBatchComplete ?? true;
        default:
          return true;
      }
    } catch (error) {
      console.error(
        '[NotificationManager] Error checking notification type:',
        error
      );
      return false;
    }
  }

  /**
   * Show notification for upload completion
   */
  public async notifyUploadComplete(data: NotificationData): Promise<void> {
    if (
      !(await this.isNotificationTypeEnabled(NotificationType.UPLOAD_COMPLETE))
    ) {
      return;
    }

    const template = this.getTemplate(NotificationType.UPLOAD_COMPLETE, data);
    this.createNotification(NotificationType.UPLOAD_COMPLETE, template, data);
  }

  /**
   * Show notification for upload failure
   */
  public async notifyUploadFailed(data: NotificationData): Promise<void> {
    if (
      !(await this.isNotificationTypeEnabled(NotificationType.UPLOAD_FAILED))
    ) {
      return;
    }

    const template = this.getTemplate(NotificationType.UPLOAD_FAILED, data);
    this.createNotification(NotificationType.UPLOAD_FAILED, template, data);
  }

  /**
   * Show notification for upload cancellation
   */
  public async notifyUploadCancelled(data: NotificationData): Promise<void> {
    if (
      !(await this.isNotificationTypeEnabled(NotificationType.UPLOAD_CANCELLED))
    ) {
      return;
    }

    const template = this.getTemplate(NotificationType.UPLOAD_CANCELLED, data);
    this.createNotification(NotificationType.UPLOAD_CANCELLED, template, data);
  }

  /**
   * Show notification for batch upload completion
   */
  public async notifyBatchComplete(data: NotificationData): Promise<void> {
    if (
      !(await this.isNotificationTypeEnabled(NotificationType.BATCH_COMPLETE))
    ) {
      return;
    }

    const template = this.getTemplate(NotificationType.BATCH_COMPLETE, data);
    this.createNotification(NotificationType.BATCH_COMPLETE, template, data);
  }

  /**
   * Get notification template for type
   */
  private getTemplate(
    type: NotificationType,
    data: NotificationData
  ): NotificationTemplate {
    switch (type) {
      case NotificationType.UPLOAD_COMPLETE:
        return {
          iconUrl: 'icons/icon-128.png',
          title: '✅ Upload Complete',
          message: data.fileName
            ? `${data.fileName} has been uploaded successfully`
            : 'File uploaded successfully',
          priority: 0,
        };

      case NotificationType.UPLOAD_FAILED:
        return {
          iconUrl: 'icons/icon-128.png',
          title: '❌ Upload Failed',
          message: data.fileName
            ? `Failed to upload ${data.fileName}${data.error ? `: ${data.error}` : ''}`
            : 'Upload failed',
          priority: 1,
          requireInteraction: true,
        };

      case NotificationType.UPLOAD_CANCELLED:
        return {
          iconUrl: 'icons/icon-128.png',
          title: '⚠️ Upload Cancelled',
          message: data.fileName
            ? `Upload cancelled: ${data.fileName}`
            : 'Upload cancelled',
          priority: 0,
        };

      case NotificationType.BATCH_COMPLETE:
        return {
          iconUrl: 'icons/icon-128.png',
          title: '✅ All Uploads Complete',
          message: data.fileCount
            ? `Successfully uploaded ${data.fileCount} file${data.fileCount > 1 ? 's' : ''}`
            : 'All uploads complete',
          priority: 1,
        };

      default:
        return {
          iconUrl: 'icons/icon-128.png',
          title: 'Upload Tracker',
          message: 'Upload event',
          priority: 0,
        };
    }
  }

  /**
   * Create notification with template
   */
  private createNotification(
    type: NotificationType,
    template: NotificationTemplate,
    data: NotificationData
  ): void {
    try {
      const notificationId = `${this.NOTIFICATION_PREFIX}-${type}-${Date.now()}`;

      // Store tab ID for click handler
      if (data.tabId) {
        this.activeNotifications.set(notificationId, data.tabId);
      }

      chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: template.iconUrl,
        title: template.title,
        message: template.message,
        priority: template.priority,
        requireInteraction: template.requireInteraction,
      });

      console.log(`[NotificationManager] Created notification: ${type}`);

      // Auto-clear notification after delay (except for failed uploads)
      if (type !== NotificationType.UPLOAD_FAILED) {
        setTimeout(() => {
          this.clearNotification(notificationId);
        }, 5000);
      }
    } catch (error) {
      console.error(
        '[NotificationManager] Error creating notification:',
        error
      );
    }
  }

  /**
   * Clear notification by ID
   */
  private clearNotification(notificationId: string): void {
    try {
      chrome.notifications.clear(notificationId);
      this.activeNotifications.delete(notificationId);
    } catch (error) {
      console.error(
        '[NotificationManager] Error clearing notification:',
        error
      );
    }
  }

  /**
   * Setup notification click handlers
   */
  private setupClickHandlers(): void {
    chrome.notifications.onClicked.addListener((notificationId) => {
      void this.handleNotificationClick(notificationId);
    });

    chrome.notifications.onClosed.addListener((notificationId) => {
      this.activeNotifications.delete(notificationId);
    });
  }

  /**
   * Handle notification click
   */
  private async handleNotificationClick(notificationId: string): Promise<void> {
    try {
      const tabId = this.activeNotifications.get(notificationId);

      if (tabId) {
        // Focus on the Drive tab
        await this.focusTab(tabId);
      } else {
        // Open a new Drive tab if no tab ID available
        await chrome.tabs.create({
          url: 'https://drive.google.com',
        });
      }

      // Clear the notification
      this.clearNotification(notificationId);

      console.log(`[NotificationManager] Handled click: ${notificationId}`);
    } catch (error) {
      console.error('[NotificationManager] Error handling click:', error);
    }
  }

  /**
   * Focus on a specific tab
   */
  private async focusTab(tabId: number): Promise<void> {
    try {
      // Get the tab
      const tab = await chrome.tabs.get(tabId);

      if (tab.windowId !== undefined) {
        // Focus the window
        await chrome.windows.update(tab.windowId, { focused: true });

        // Activate the tab
        await chrome.tabs.update(tabId, { active: true });

        console.log(`[NotificationManager] Focused tab: ${tabId}`);
      }
    } catch (error) {
      console.error('[NotificationManager] Error focusing tab:', error);
      // Tab might be closed, try opening Drive instead
      await chrome.tabs.create({
        url: 'https://drive.google.com',
      });
    }
  }

  /**
   * Clear all active notifications
   */
  public clearAll(): void {
    const notificationIds = Array.from(this.activeNotifications.keys());

    for (const id of notificationIds) {
      this.clearNotification(id);
    }

    console.log('[NotificationManager] Cleared all notifications');
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    this.clearAll();
    this.activeNotifications.clear();
    console.log('[NotificationManager] Disposed');
  }
}
