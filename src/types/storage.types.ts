/**
 * Chrome Storage types for extension preferences
 */

/** What the uploader does when the folder already has a file with the same name */
export type ExistingFiles = 'skip' | 'replace' | 'keep';

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
  /** Keep the computer awake while uploads are running */
  keepAwake: boolean;
  /** Retry failed Drive uploads automatically */
  autoRetry: boolean;
  /** Files the uploader sends at the same time (1-6) */
  parallelUploads: number;
  /** Same-name files the uploader already put in the destination folder */
  existingFiles: ExistingFiles;
}

export interface StorageData {
  preferences?: UserPreferences;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  enableNotifications: true,
  enableSound: false,
  notifyOnComplete: true,
  notifyOnFailed: true,
  notifyOnCancelled: false,
  notifyOnBatchComplete: true,
  uiPosition: 'bottom-right',
  theme: 'auto',
  autoHide: false,
  keepAwake: true,
  autoRetry: true,
  parallelUploads: 4,
  existingFiles: 'skip',
};

/**
 * Read preferences, filling in defaults for keys saved by older versions
 */
export async function loadPreferences(): Promise<UserPreferences> {
  const result = await chrome.storage.sync.get('preferences');
  const stored = result['preferences'] as
    | (Partial<UserPreferences> & { skipExisting?: boolean })
    | undefined;
  // 1.1.0 betas saved a skipExisting switch; off meant keep both
  const { skipExisting, ...rest } = stored ?? {};
  return {
    ...DEFAULT_PREFERENCES,
    ...(skipExisting === false ? { existingFiles: 'keep' as const } : {}),
    ...rest,
  };
}
