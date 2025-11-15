/**
 * DOM-specific type definitions and type guards for Google Drive upload tracking
 * Uses stable selectors based on ARIA attributes and data attributes
 */

/**
 * Stable selectors for Google Drive upload UI elements
 */
export const DOM_SELECTORS = {
  /** Upload dialog container - matches dialogs with "Upload" or "Uploading" in aria-label */
  UPLOAD_DIALOG: '[role="dialog"][aria-label*="Upload"]',

  /** Individual file upload container */
  FILE_CONTAINER: '[role="group"][aria-label^="File upload:"]',

  /** Element containing file name in tooltip */
  FILE_NAME_ELEMENT: '[data-tooltip*="."]',

  /** Progress indicator element */
  PROGRESS_ELEMENT: '[data-progress]',

  /** Upload speed element */
  SPEED_ELEMENT: '[data-speed]',

  /** Time remaining element */
  TIME_REMAINING_ELEMENT: '[data-time-remaining]',
} as const;

/**
 * Upload dialog element interface
 */
export interface UploadDialogElement extends HTMLElement {
  /** ARIA role attribute */
  role: 'dialog';

  /** ARIA label containing "Uploading" */
  ariaLabel: string;
}

/**
 * File upload container element interface
 */
export interface FileContainerElement extends HTMLElement {
  /** ARIA role attribute */
  role: 'group';

  /** ARIA label starting with "File Upload:" */
  ariaLabel: string;
}

/**
 * Progress element interface with data attribute
 */
export interface ProgressElement extends HTMLElement {
  /** Progress value as string (e.g., "75" for 75%) */
  dataset: {
    progress: string;
  };
}

/**
 * File name element interface with tooltip
 */
export interface FileNameElement extends HTMLElement {
  /** Tooltip containing file name with extension */
  dataset: {
    tooltip: string;
  };
}

/**
 * Upload speed element interface
 */
export interface SpeedElement extends HTMLElement {
  /** Upload speed as string (e.g., "5.2 MB/s") */
  dataset: {
    speed: string;
  };
}

/**
 * Time remaining element interface
 */
export interface TimeRemainingElement extends HTMLElement {
  /** Estimated time remaining (e.g., "2 minutes") */
  dataset: {
    timeRemaining: string;
  };
}

/**
 * Type guard: Check if element is an upload dialog
 */
export function isUploadDialog(
  element: Element | null
): element is UploadDialogElement {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  return (
    element.getAttribute('role') === 'dialog' &&
    (element.getAttribute('aria-label')?.includes('Upload') ?? false)
  );
}

/**
 * Type guard: Check if element is a file upload container
 */
export function isFileContainer(
  element: Element | null
): element is FileContainerElement {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  return (
    element.getAttribute('role') === 'group' &&
    (element.getAttribute('aria-label')?.startsWith('File upload:') ?? false)
  );
}

/**
 * Type guard: Check if element has progress data attribute
 */
export function hasProgressData(
  element: Element | null
): element is ProgressElement {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  return element.dataset['progress'] !== undefined;
}

/**
 * Type guard: Check if element has file name tooltip
 */
export function hasFileNameTooltip(
  element: Element | null
): element is FileNameElement {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  return (
    element.dataset['tooltip'] !== undefined &&
    element.dataset['tooltip'].includes('.')
  );
}

/**
 * Type guard: Check if element has speed data
 */
export function hasSpeedData(element: Element | null): element is SpeedElement {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  return element.dataset['speed'] !== undefined;
}

/**
 * Type guard: Check if element has time remaining data
 */
export function hasTimeRemainingData(
  element: Element | null
): element is TimeRemainingElement {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  return element.dataset['timeRemaining'] !== undefined;
}

/**
 * Extract progress value from progress element
 * @returns Progress as number (0-100) or null if invalid
 */
export function extractProgress(element: ProgressElement): number | null {
  const progressValue = element.dataset['progress'];
  const progress = parseInt(progressValue, 10);

  if (isNaN(progress) || progress < 0 || progress > 100) {
    return null;
  }

  return progress;
}

/**
 * Extract file name from tooltip element
 * @returns File name or null if not found
 */
export function extractFileName(element: FileNameElement): string | null {
  const tooltip = element.dataset['tooltip'];

  if (!tooltip || !tooltip.includes('.')) {
    return null;
  }

  return tooltip;
}

/**
 * Extract upload speed from speed element
 * @returns Upload speed string or null if not found
 */
export function extractSpeed(element: SpeedElement): string | null {
  return element.dataset['speed'] || null;
}

/**
 * Extract time remaining from time element
 * @returns Time remaining string or null if not found
 */
export function extractTimeRemaining(
  element: TimeRemainingElement
): string | null {
  return element.dataset['timeRemaining'] || null;
}

/**
 * DOM query result with type safety
 */
export interface UploadDOMElements {
  /** The upload dialog container */
  dialog: UploadDialogElement;

  /** Individual file upload containers */
  fileContainers: FileContainerElement[];
}

/**
 * File upload DOM data extracted from container
 */
export interface FileUploadDOMData {
  /** The container element */
  container: FileContainerElement;

  /** File name extracted from tooltip */
  fileName: string | null;

  /** Upload progress (0-100) */
  progress: number | null;

  /** Upload speed string */
  speed: string | null;

  /** Time remaining string */
  timeRemaining: string | null;
}
