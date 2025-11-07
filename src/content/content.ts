/**
 * Content script for Upload Tracker for Drive
 * Injected into Google Drive pages to track upload progress
 */

/* eslint-disable no-console */

import { UploadMonitor } from './upload-monitor.js';
import type { UploadInfo } from '../types/upload.types.js';

/**
 * Global upload monitor instance
 */
let uploadMonitor: UploadMonitor | null = null;

/**
 * Check if we're on a Google Drive page
 */
function isGoogleDrivePage(): boolean {
  return window.location.hostname === 'drive.google.com';
}

/**
 * Handle upload updates
 */
function handleUploadUpdates(uploads: UploadInfo[]): void {
  console.log(`[Content] Upload updates: ${uploads.length} active uploads`);

  uploads.forEach((upload) => {
    console.log(
      `[Content] ${upload.fileName}: ${upload.progress}% - ${upload.status}`
    );
  });

  // TODO: Send updates to background script
  // TODO: Update UI overlay with upload progress
}

/**
 * Initialize the upload tracker
 */
function initialize(): void {
  if (!isGoogleDrivePage()) {
    console.log(
      '[Content] Not on Google Drive, upload tracker not initialized'
    );
    return;
  }

  console.log(
    '[Content] Upload Tracker for Drive initialized on Google Drive page'
  );

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
  console.log('[Content] Setting up upload tracking...');

  // Create upload monitor with update callback
  uploadMonitor = new UploadMonitor(handleUploadUpdates);

  // Start monitoring
  uploadMonitor.start();

  console.log('[Content] Upload tracking setup complete');
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  if (uploadMonitor) {
    uploadMonitor.dispose();
    uploadMonitor = null;
  }
});

// Initialize when script loads
initialize();
