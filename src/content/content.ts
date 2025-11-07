/**
 * Content script for Upload Tracker for Drive
 * Injected into Google Drive pages to track upload progress
 */

/**
 * Check if we're on a Google Drive page
 */
function isGoogleDrivePage(): boolean {
  return window.location.hostname === 'drive.google.com';
}

/**
 * Initialize the upload tracker
 */
function initialize(): void {
  if (!isGoogleDrivePage()) {
    console.log('Not on Google Drive, upload tracker not initialized');
    return;
  }

  console.log('Upload Tracker for Drive initialized on Google Drive page');

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupUploadTracking);
  } else {
    setupUploadTracking();
  }
}

/**
 * Set up upload tracking
 */
function setupUploadTracking(): void {
  console.log('Setting up upload tracking...');

  // Create MutationObserver to watch for upload dialogs
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // Look for upload dialog
        const uploadDialog = document.querySelector(
          '[role="dialog"][aria-label*="Uploading"]'
        );
        if (uploadDialog) {
          console.log('Upload dialog detected');
          handleUploadDialog(uploadDialog as HTMLElement);
        }
      }
    }
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('Upload tracking observer started');
}

/**
 * Handle upload dialog when detected
 */
function handleUploadDialog(dialog: HTMLElement): void {
  console.log('Handling upload dialog:', dialog);

  // Look for file upload containers
  const fileContainers = dialog.querySelectorAll(
    '[role="group"][aria-label^="File Upload:"]'
  );

  console.log('Found file containers:', fileContainers.length);

  fileContainers.forEach((container) => {
    const fileName = extractFileName(container as HTMLElement);
    const progress = extractProgress(container as HTMLElement);

    console.log(`Tracking upload: ${fileName} - ${progress}%`);
  });
}

/**
 * Extract file name from container
 */
function extractFileName(container: HTMLElement): string {
  const fileNameElement = container.querySelector('[data-tooltip*="."]');
  return fileNameElement?.getAttribute('data-tooltip') || 'Unknown file';
}

/**
 * Extract progress from container
 */
function extractProgress(container: HTMLElement): number {
  const progressElement = container.querySelector('[data-progress]');
  const progressValue = progressElement?.getAttribute('data-progress');
  return progressValue ? parseInt(progressValue, 10) : 0;
}

// Initialize when script loads
initialize();
