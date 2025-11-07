/**
 * Chrome Storage types for extension preferences
 */

export interface UserPreferences {
  enableNotifications: boolean;
  enableSound: boolean;
  notifyOnComplete: boolean;
  notifyOnFailed: boolean;
  notifyOnCancelled: boolean;
  notifyOnBatchComplete: boolean;
  uiPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  theme: 'auto' | 'light' | 'dark';
  autoHide: boolean;
}

export interface StorageData {
  preferences?: UserPreferences;
}
