/**
 * Google Cloud settings for the uploader (see docs/SETUP.md)
 * None of these are secrets: they ship inside the extension and the picker page.
 */

/** OAuth client ID of type "Web application" */
export const GOOGLE_CLIENT_ID: string =
  '88124285227-0p9sld49c894joa5iahq1251mmm7m0te.apps.googleusercontent.com';

/** Browser API key restricted to the picker page, for the Google Picker */
export const GOOGLE_API_KEY: string = 'AIzaSyBtFzvCOAwgh8316bmvk_aK9jXXcVRDZas';

/** Google Cloud project number, so folders picked are shared with this app */
export const GOOGLE_APP_ID: string = '88124285227';

/** Hosted page that shows the Google Picker; must match externally_connectable */
export const PICKER_URL = 'https://sai-na.github.io/uploft/picker.html';

export function isUploaderConfigured(): boolean {
  return GOOGLE_CLIENT_ID !== '';
}

export function isPickerConfigured(): boolean {
  return (
    isUploaderConfigured() && GOOGLE_API_KEY !== '' && GOOGLE_APP_ID !== ''
  );
}
