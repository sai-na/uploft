/**
 * Popup script for Upload Tracker for Drive
 * Handles user settings and preferences
 */

import type { StorageData, UserPreferences } from '../types/storage.types.js';

const DEFAULT_PREFERENCES: UserPreferences = {
  enableNotifications: true,
  enableSound: false,
  uiPosition: 'bottom-right',
  theme: 'auto',
  autoHide: false,
};

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
    const uiPosition = document.getElementById(
      'ui-position'
    ) as HTMLSelectElement;
    const theme = document.getElementById('theme') as HTMLSelectElement;
    const autoHide = document.getElementById('auto-hide') as HTMLInputElement;

    if (enableNotifications)
      enableNotifications.checked = preferences.enableNotifications;
    if (enableSound) enableSound.checked = preferences.enableSound;
    if (uiPosition) uiPosition.value = preferences.uiPosition;
    if (theme) theme.value = preferences.theme;
    if (autoHide) autoHide.checked = preferences.autoHide;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings(preferences: UserPreferences): Promise<void> {
  try {
    await chrome.storage.sync.set({ preferences } satisfies StorageData);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Initialize popup
 */
document.addEventListener('DOMContentLoaded', () => {
  // Load initial settings
  void loadSettings();

  // Set up event listeners for all settings
  const enableNotifications = document.getElementById(
    'enable-notifications'
  ) as HTMLInputElement;
  const enableSound = document.getElementById(
    'enable-sound'
  ) as HTMLInputElement;
  const uiPosition = document.getElementById(
    'ui-position'
  ) as HTMLSelectElement;
  const theme = document.getElementById('theme') as HTMLSelectElement;
  const autoHide = document.getElementById('auto-hide') as HTMLInputElement;

  const saveCurrentSettings = (): void => {
    const preferences: UserPreferences = {
      enableNotifications:
        enableNotifications?.checked ?? DEFAULT_PREFERENCES.enableNotifications,
      enableSound: enableSound?.checked ?? DEFAULT_PREFERENCES.enableSound,
      uiPosition:
        (uiPosition?.value as UserPreferences['uiPosition']) ??
        DEFAULT_PREFERENCES.uiPosition,
      theme:
        (theme?.value as UserPreferences['theme']) ?? DEFAULT_PREFERENCES.theme,
      autoHide: autoHide?.checked ?? DEFAULT_PREFERENCES.autoHide,
    };
    void saveSettings(preferences);
  };

  // Add event listeners
  enableNotifications?.addEventListener('change', saveCurrentSettings);
  enableSound?.addEventListener('change', saveCurrentSettings);
  uiPosition?.addEventListener('change', saveCurrentSettings);
  theme?.addEventListener('change', saveCurrentSettings);
  autoHide?.addEventListener('change', saveCurrentSettings);
});
