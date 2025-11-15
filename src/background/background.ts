/**
 * Background service worker for Upload Tracker for Drive
 * Handles extension lifecycle and Chrome API interactions
 */

import type {
  ExtensionMessage,
  MessageResponse,
} from '../types/messages.types.js';
import { MessageType } from '../types/messages.types.js';
import type { StorageData, UserPreferences } from '../types/storage.types.js';
import { NotificationManager } from './notifications.js';

const DEFAULT_PREFERENCES: UserPreferences = {
  enableNotifications: true,
  enableSound: false,
  notifyOnComplete: true,
  notifyOnFailed: true,
  notifyOnCancelled: false,
  notifyOnBatchComplete: true,
  uiPosition: 'bottom-right',
  theme: 'auto',
  autoHide: false,
};

// Initialize notification manager
const notificationManager = new NotificationManager();

// Service worker install event
chrome.runtime.onInstalled.addListener((details) => {
  // Initialize default settings on install
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.storage.sync.set({
      preferences: DEFAULT_PREFERENCES,
    } satisfies StorageData);
  }
});

// Service worker activate event
chrome.runtime.onStartup.addListener(() => {
  // Extension startup complete
});

// Message handler for communication with content scripts
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    // Get tab ID from sender
    const tabId = sender.tab?.id;

    // Handle different message types
    switch (message.type) {
      case MessageType.UPLOAD_COMPLETE:
        void notificationManager.notifyUploadComplete({
          ...message.data,
          tabId,
        });
        break;

      case MessageType.UPLOAD_FAILED:
        void notificationManager.notifyUploadFailed({
          ...message.data,
          tabId,
        });
        break;

      case MessageType.UPLOAD_CANCELLED:
        void notificationManager.notifyUploadCancelled({
          ...message.data,
          tabId,
        });
        break;

      case MessageType.BATCH_COMPLETE:
        void notificationManager.notifyBatchComplete({
          ...message.data,
          tabId,
        });
        break;

      default:
        console.warn('[Background] Unknown message type:', message);
    }

    // Send response
    sendResponse({ success: true });
    return true; // Keep message channel open for async response
  }
);
