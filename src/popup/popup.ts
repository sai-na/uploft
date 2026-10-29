/**
 * Popup script for Upload Tracker for Drive
 * Handles user settings and preferences
 */

import type { StorageData, UserPreferences } from '../types/storage.types.js';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
} from '../types/storage.types.js';

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

/**
 * Apply theme to document
 */
function applyTheme(theme: UserPreferences['theme']): void {
  if (theme === 'auto') {
    // Remove data-theme attribute to use system preference
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', theme);
  }
}

/**
 * Toggle notification type inputs based on master toggle
 */
function toggleNotificationTypes(enabled: boolean): void {
  const notifyOnComplete = document.getElementById(
    'notify-on-complete'
  ) as HTMLInputElement;
  const notifyOnFailed = document.getElementById(
    'notify-on-failed'
  ) as HTMLInputElement;
  const notifyOnCancelled = document.getElementById(
    'notify-on-cancelled'
  ) as HTMLInputElement;
  const notifyOnBatchComplete = document.getElementById(
    'notify-on-batch-complete'
  ) as HTMLInputElement;

  if (notifyOnComplete) notifyOnComplete.disabled = !enabled;
  if (notifyOnFailed) notifyOnFailed.disabled = !enabled;
  if (notifyOnCancelled) notifyOnCancelled.disabled = !enabled;
  if (notifyOnBatchComplete) notifyOnBatchComplete.disabled = !enabled;

  const typesContainer = document.getElementById('notification-types');
  if (typesContainer) {
    typesContainer.style.opacity = enabled ? '1' : '0.5';
  }
}

/**
 * Load settings from Chrome storage
 */
async function loadSettings(): Promise<void> {
  try {
    const preferences = await loadPreferences();

    // Update UI elements
    const enableNotifications = document.getElementById(
      'enable-notifications'
    ) as HTMLInputElement;
    const enableSound = document.getElementById(
      'enable-sound'
    ) as HTMLInputElement;
    const notifyOnComplete = document.getElementById(
      'notify-on-complete'
    ) as HTMLInputElement;
    const notifyOnFailed = document.getElementById(
      'notify-on-failed'
    ) as HTMLInputElement;
    const notifyOnCancelled = document.getElementById(
      'notify-on-cancelled'
    ) as HTMLInputElement;
    const notifyOnBatchComplete = document.getElementById(
      'notify-on-batch-complete'
    ) as HTMLInputElement;
    const uiPosition = document.getElementById(
      'ui-position'
    ) as HTMLSelectElement;
    const theme = document.getElementById('theme') as HTMLSelectElement;
    const autoHide = document.getElementById('auto-hide') as HTMLInputElement;
    const keepAwake = document.getElementById('keep-awake') as HTMLInputElement;
    const autoRetry = document.getElementById('auto-retry') as HTMLInputElement;

    if (keepAwake) keepAwake.checked = preferences.keepAwake;
    if (autoRetry) autoRetry.checked = preferences.autoRetry;
    if (enableNotifications) {
      enableNotifications.checked = preferences.enableNotifications;
      toggleNotificationTypes(preferences.enableNotifications);
    }
    if (enableSound) enableSound.checked = preferences.enableSound;
    if (notifyOnComplete)
      notifyOnComplete.checked = preferences.notifyOnComplete;
    if (notifyOnFailed) notifyOnFailed.checked = preferences.notifyOnFailed;
    if (notifyOnCancelled)
      notifyOnCancelled.checked = preferences.notifyOnCancelled;
    if (notifyOnBatchComplete)
      notifyOnBatchComplete.checked = preferences.notifyOnBatchComplete;
    if (uiPosition) uiPosition.value = preferences.uiPosition;
    if (theme) {
      theme.value = preferences.theme;
      applyTheme(preferences.theme);
    }
    if (autoHide) autoHide.checked = preferences.autoHide;
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
    theme: preferences.theme || DEFAULT_PREFERENCES.theme,
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
 * Initialize popup
 */
document.addEventListener('DOMContentLoaded', () => {
  // Load initial settings
  void loadSettings();

  const version = document.getElementById('version');
  if (version) version.textContent = `v${chrome.runtime.getManifest().version}`;

  document.getElementById('open-uploader')?.addEventListener('click', () => {
    void openUploader();
  });

  // Get all UI elements
  const enableNotifications = document.getElementById(
    'enable-notifications'
  ) as HTMLInputElement;
  const enableSound = document.getElementById(
    'enable-sound'
  ) as HTMLInputElement;
  const notifyOnComplete = document.getElementById(
    'notify-on-complete'
  ) as HTMLInputElement;
  const notifyOnFailed = document.getElementById(
    'notify-on-failed'
  ) as HTMLInputElement;
  const notifyOnCancelled = document.getElementById(
    'notify-on-cancelled'
  ) as HTMLInputElement;
  const notifyOnBatchComplete = document.getElementById(
    'notify-on-batch-complete'
  ) as HTMLInputElement;
  const uiPosition = document.getElementById(
    'ui-position'
  ) as HTMLSelectElement;
  const theme = document.getElementById('theme') as HTMLSelectElement;
  const autoHide = document.getElementById('auto-hide') as HTMLInputElement;
  const keepAwake = document.getElementById('keep-awake') as HTMLInputElement;
  const autoRetry = document.getElementById('auto-retry') as HTMLInputElement;

  /**
   * Collect and save current settings, keeping ones set in the uploader
   */
  const saveCurrentSettings = async (): Promise<void> => {
    const current = await loadPreferences();
    const preferences: UserPreferences = {
      ...current,
      keepAwake: keepAwake?.checked ?? DEFAULT_PREFERENCES.keepAwake,
      autoRetry: autoRetry?.checked ?? DEFAULT_PREFERENCES.autoRetry,
      enableNotifications:
        enableNotifications?.checked ?? DEFAULT_PREFERENCES.enableNotifications,
      enableSound: enableSound?.checked ?? DEFAULT_PREFERENCES.enableSound,
      notifyOnComplete:
        notifyOnComplete?.checked ?? DEFAULT_PREFERENCES.notifyOnComplete,
      notifyOnFailed:
        notifyOnFailed?.checked ?? DEFAULT_PREFERENCES.notifyOnFailed,
      notifyOnCancelled:
        notifyOnCancelled?.checked ?? DEFAULT_PREFERENCES.notifyOnCancelled,
      notifyOnBatchComplete:
        notifyOnBatchComplete?.checked ??
        DEFAULT_PREFERENCES.notifyOnBatchComplete,
      uiPosition:
        (uiPosition?.value as UserPreferences['uiPosition']) ??
        DEFAULT_PREFERENCES.uiPosition,
      theme:
        (theme?.value as UserPreferences['theme']) ?? DEFAULT_PREFERENCES.theme,
      autoHide: autoHide?.checked ?? DEFAULT_PREFERENCES.autoHide,
    };

    const validated = validatePreferences(preferences);
    await saveSettings(validated);
  };
  const saveOnChange = (): void => void saveCurrentSettings();

  // Add event listeners for all settings
  enableNotifications?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    toggleNotificationTypes(enabled);
    saveOnChange();
  });

  enableSound?.addEventListener('change', saveOnChange);
  notifyOnComplete?.addEventListener('change', saveOnChange);
  notifyOnFailed?.addEventListener('change', saveOnChange);
  notifyOnCancelled?.addEventListener('change', saveOnChange);
  notifyOnBatchComplete?.addEventListener('change', saveOnChange);
  uiPosition?.addEventListener('change', saveOnChange);

  theme?.addEventListener('change', (e) => {
    const selectedTheme = (e.target as HTMLSelectElement)
      .value as UserPreferences['theme'];
    applyTheme(selectedTheme);
    saveOnChange();
  });

  autoHide?.addEventListener('change', saveOnChange);
  keepAwake?.addEventListener('change', saveOnChange);
  autoRetry?.addEventListener('change', saveOnChange);
});
