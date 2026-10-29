/**
 * Popup script for Upload Tracker for Drive
 * Opens the uploader and edits the settings that apply everywhere
 */

import type { StorageData, UserPreferences } from '../types/storage.types.js';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
} from '../types/storage.types.js';

/** Switches and chips, by element ID */
const TOGGLES = {
  'keep-awake': 'keepAwake',
  'auto-retry': 'autoRetry',
  'enable-notifications': 'enableNotifications',
  'notify-on-complete': 'notifyOnComplete',
  'notify-on-failed': 'notifyOnFailed',
  'notify-on-cancelled': 'notifyOnCancelled',
  'notify-on-batch-complete': 'notifyOnBatchComplete',
} as const satisfies Record<string, keyof UserPreferences>;

type ToggleId = keyof typeof TOGGLES;

/**
 * Open the uploader, or focus it if it's already open. When the current tab is
 * a Drive folder, the uploader offers to upload there.
 */
async function openUploader(): Promise<void> {
  const uploaderUrl = chrome.runtime.getURL('uploader.html');
  const [existing] = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.TAB],
    documentUrls: [uploaderUrl, `${uploaderUrl}?*`],
  });
  if (existing && existing.tabId !== -1) {
    await chrome.tabs.update(existing.tabId, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    window.close();
    return;
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const folderId =
    /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/.exec(
      activeTab?.url ?? ''
    )?.[1];
  await chrome.tabs.create({
    url: folderId ? `${uploaderUrl}?folder=${folderId}` : uploaderUrl,
  });
  window.close();
}

function toggle(id: ToggleId): HTMLInputElement | null {
  return document.getElementById(id) as HTMLInputElement | null;
}

function themeInputs(): HTMLInputElement[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>('input[name="theme"]'),
  ];
}

/**
 * Apply theme to the popup; auto follows the device
 */
function applyTheme(theme: UserPreferences['theme']): void {
  if (theme === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

/**
 * Show which notifications to send only while notifications are on
 */
function toggleNotificationTypes(enabled: boolean): void {
  const types = document.getElementById('notification-types');
  if (types) types.hidden = !enabled;
}

/**
 * Show a notification now, so the user can check their computer lets
 * Chrome show them
 */
async function sendTestNotification(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.notifications.create(
        {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
          title: 'Notifications are working',
          message: "You'll get one like this when your uploads finish.",
        },
        () => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        }
      );
    });
    button.textContent = 'Sent';
  } catch (error) {
    console.error('[Popup] Test notification failed:', error);
    button.textContent = "Couldn't send";
  }
  setTimeout(() => {
    button.textContent = 'Send a test';
    button.disabled = false;
  }, 3000);
}

/**
 * Load settings from Chrome storage
 */
async function loadSettings(): Promise<void> {
  try {
    const preferences = await loadPreferences();

    for (const [id, key] of Object.entries(TOGGLES)) {
      const input = toggle(id as ToggleId);
      if (input) input.checked = preferences[key];
    }
    toggleNotificationTypes(preferences.enableNotifications);

    for (const input of themeInputs()) {
      input.checked = input.value === preferences.theme;
    }
    applyTheme(preferences.theme);
  } catch (error) {
    console.error('[Popup] Error loading settings:', error);
  }
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings(preferences: UserPreferences): Promise<void> {
  try {
    await chrome.storage.sync.set({ preferences } satisfies StorageData);
  } catch (error) {
    console.error('[Popup] Error saving settings:', error);
  }
}

/**
 * Validate preferences before saving
 */
function validatePreferences(preferences: UserPreferences): UserPreferences {
  // Ensure all boolean values are actually booleans
  return {
    enableNotifications: Boolean(preferences.enableNotifications),
    enableSound: Boolean(preferences.enableSound),
    notifyOnComplete: Boolean(preferences.notifyOnComplete),
    notifyOnFailed: Boolean(preferences.notifyOnFailed),
    notifyOnCancelled: Boolean(preferences.notifyOnCancelled),
    notifyOnBatchComplete: Boolean(preferences.notifyOnBatchComplete),
    uiPosition: preferences.uiPosition || DEFAULT_PREFERENCES.uiPosition,
    theme: ['auto', 'light', 'dark'].includes(preferences.theme)
      ? preferences.theme
      : DEFAULT_PREFERENCES.theme,
    autoHide: Boolean(preferences.autoHide),
    keepAwake: Boolean(preferences.keepAwake),
    autoRetry: Boolean(preferences.autoRetry),
    parallelUploads:
      Number(preferences.parallelUploads) ||
      DEFAULT_PREFERENCES.parallelUploads,
    existingFiles: ['skip', 'replace', 'keep'].includes(
      preferences.existingFiles
    )
      ? preferences.existingFiles
      : DEFAULT_PREFERENCES.existingFiles,
  };
}

/**
 * Collect and save current settings, keeping ones set in the uploader
 */
async function saveCurrentSettings(): Promise<void> {
  const preferences: UserPreferences = { ...(await loadPreferences()) };
  for (const [id, key] of Object.entries(TOGGLES)) {
    const input = toggle(id as ToggleId);
    if (input) preferences[key] = input.checked;
  }
  const theme = themeInputs().find((input) => input.checked)?.value;
  if (theme) preferences.theme = theme as UserPreferences['theme'];

  await saveSettings(validatePreferences(preferences));
}

/**
 * Initialize popup
 */
document.addEventListener('DOMContentLoaded', () => {
  void loadSettings();

  const version = document.getElementById('version');
  if (version) version.textContent = `v${chrome.runtime.getManifest().version}`;

  document.getElementById('open-uploader')?.addEventListener('click', () => {
    void openUploader();
  });

  const testButton = document.getElementById(
    'test-notification'
  ) as HTMLButtonElement | null;
  testButton?.addEventListener('click', () => {
    void sendTestNotification(testButton);
  });

  for (const id of Object.keys(TOGGLES) as ToggleId[]) {
    toggle(id)?.addEventListener('change', () => {
      if (id === 'enable-notifications') {
        toggleNotificationTypes(toggle(id)?.checked ?? true);
      }
      void saveCurrentSettings();
    });
  }

  for (const input of themeInputs()) {
    input.addEventListener('change', () => {
      applyTheme(input.value as UserPreferences['theme']);
      void saveCurrentSettings();
    });
  }
});
