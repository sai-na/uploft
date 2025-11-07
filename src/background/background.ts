/**
 * Background service worker for Upload Tracker for Drive
 * Handles extension lifecycle and Chrome API interactions
 */

import type {
  ExtensionMessage,
  MessageResponse,
  MessageType,
} from '../types/messages.types.js';
import type { StorageData, UserPreferences } from '../types/storage.types.js';

const DEFAULT_PREFERENCES: UserPreferences = {
  enableNotifications: true,
  enableSound: false,
  uiPosition: 'bottom-right',
  theme: 'auto',
  autoHide: false,
};

// Service worker install event
chrome.runtime.onInstalled.addListener((details) => {
  // Initialize default settings on install
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    void chrome.storage.sync.set({
      preferences: DEFAULT_PREFERENCES,
    } satisfies StorageData);
  }
});

// Message handler for communication with content scripts
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    // Handle different message types
    if (message.type === ('UPLOAD_COMPLETE' as MessageType)) {
      void handleUploadComplete(message.data);
    } else if (message.type === ('UPLOAD_FAILED' as MessageType)) {
      void handleUploadFailed(message.data);
    }

    // Send response
    sendResponse({ success: true });
    return true; // Keep message channel open for async response
  }
);

/**
 * Handle upload completion
 */
async function handleUploadComplete(data: { fileName: string }): Promise<void> {
  try {
    const result = (await chrome.storage.sync.get(
      'preferences'
    )) as StorageData;
    const preferences = result['preferences'];

    if (preferences?.enableNotifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'Upload Complete',
        message: `${data.fileName} has been uploaded successfully`,
      });
    }
  } catch (error) {
    console.error('Error handling upload complete:', error);
  }
}

/**
 * Handle upload failure
 */
async function handleUploadFailed(data: {
  fileName: string;
  error?: string;
}): Promise<void> {
  try {
    const result = (await chrome.storage.sync.get(
      'preferences'
    )) as StorageData;
    const preferences = result['preferences'];

    if (preferences?.enableNotifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: 'Upload Failed',
        message: `Failed to upload ${data.fileName}${data.error ? `: ${data.error}` : ''}`,
      });
    }
  } catch (error) {
    console.error('Error handling upload failed:', error);
  }
}
