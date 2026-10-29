/**
 * Background service worker for Upload Tracker for Drive
 * Handles extension lifecycle and Chrome API interactions
 */

import type {
  ExtensionMessage,
  MessageResponse,
} from '../types/messages.types.js';
import { MessageType } from '../types/messages.types.js';
import type { StorageData } from '../types/storage.types.js';
import { DEFAULT_PREFERENCES } from '../types/storage.types.js';
import { NotificationManager } from './notifications.js';
import { UploadGuard } from './upload-guard.js';
import { GoogleAuth } from '../uploader/auth.js';
import {
  GOOGLE_API_KEY,
  GOOGLE_APP_ID,
  PICKER_URL,
} from '../uploader/config.js';
import type {
  PickerInitResponse,
  PickerMessage,
} from '../uploader/picker-messages.js';
import { DESTINATION_KEY } from '../uploader/picker-messages.js';

// Initialize notification manager
const notificationManager = new NotificationManager();

// Keeps the computer awake and the tab alive while uploads run
const uploadGuard = new UploadGuard();

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

      case MessageType.UPLOAD_ACTIVITY:
        if (tabId !== undefined) {
          void uploadGuard.setTabActive(tabId, message.data.active);
        }
        break;

      default:
        console.warn('[Background] Unknown message type:', message);
    }

    // Send response
    sendResponse({ success: true });
    return true; // Keep message channel open for async response
  }
);

// The hosted Google Picker page asks for a token and reports the chosen folder
chrome.runtime.onMessageExternal.addListener(
  (
    message: PickerMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: PickerInitResponse) => void
  ) => {
    // Only the hosted picker page gets a token
    const senderUrl = sender.url ? new URL(sender.url) : null;
    if (
      !senderUrl ||
      `${senderUrl.origin}${senderUrl.pathname}` !== PICKER_URL
    ) {
      return false;
    }

    const closePicker = (): void => {
      if (sender.tab?.id !== undefined) {
        void chrome.tabs.remove(sender.tab.id).catch(() => undefined);
      }
    };

    switch (message.type) {
      case 'PICKER_INIT':
        new GoogleAuth()
          .getToken()
          .then((token) =>
            sendResponse({
              ok: true,
              token,
              apiKey: GOOGLE_API_KEY,
              appId: GOOGLE_APP_ID,
            })
          )
          .catch((error: Error) =>
            sendResponse({ ok: false, error: error.message })
          );
        return true; // Respond asynchronously

      case 'PICKER_RESULT': {
        const { id, name } = message.folder;
        if (/^[\w-]+$/.test(id) && typeof name === 'string') {
          void chrome.storage.local.set({
            [DESTINATION_KEY]: { id, name: name.slice(0, 255) },
          });
        }
        sendResponse({ ok: true });
        closePicker();
        return false;
      }

      case 'PICKER_CANCEL':
        sendResponse({ ok: true });
        closePicker();
        return false;

      default:
        return false;
    }
  }
);
