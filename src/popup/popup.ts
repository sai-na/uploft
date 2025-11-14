/**
 * Popup script for Upload Tracker for Drive
 * Handles user settings and preferences
 */

/* eslint-disable no-console */

import type { StorageData, UserPreferences } from '../types/storage.types.js';

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
    const result = (await chrome.storage.sync.get(
      'preferences'
    )) as StorageData;
    const preferences: UserPreferences =
      result['preferences'] || DEFAULT_PREFERENCES;

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

    console.log('[Popup] Settings loaded:', preferences);
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
    console.log('[Popup] Settings saved:', preferences);
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
  };
}

/**
 * Initialize popup
 */
document.addEventListener('DOMContentLoaded', () => {
  // Load initial settings
  void loadSettings();

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

  /**
   * Collect and save current settings
   */
  const saveCurrentSettings = (): void => {
    const preferences: UserPreferences = {
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
    void saveSettings(validated);
  };

  // Add event listeners for all settings
  enableNotifications?.addEventListener('change', (e) => {
    const enabled = (e.target as HTMLInputElement).checked;
    toggleNotificationTypes(enabled);
    saveCurrentSettings();
  });

  enableSound?.addEventListener('change', saveCurrentSettings);
  notifyOnComplete?.addEventListener('change', saveCurrentSettings);
  notifyOnFailed?.addEventListener('change', saveCurrentSettings);
  notifyOnCancelled?.addEventListener('change', saveCurrentSettings);
  notifyOnBatchComplete?.addEventListener('change', saveCurrentSettings);
  uiPosition?.addEventListener('change', saveCurrentSettings);

  theme?.addEventListener('change', (e) => {
    const selectedTheme = (e.target as HTMLSelectElement)
      .value as UserPreferences['theme'];
    applyTheme(selectedTheme);
    saveCurrentSettings();
  });

  autoHide?.addEventListener('change', saveCurrentSettings);

  console.log('[Popup] Event listeners initialized');
});
