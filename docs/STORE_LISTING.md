# Chrome Web Store listing

Copy these values into the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) and the Google Cloud console. Build the upload with `npm run package` (see the [README](../README.md)).

## Store listing tab

**Name** (comes from `manifest.json`)

```
Uploft – Uploader for Google Drive
```

**Summary**: the store shows the `description` from `manifest.json`, which can be up to 132 characters. The current one has 118:

```
Upload to Google Drive several files at a time, resume after network drops, and track Drive uploads with notifications
```

This alternative (128 characters) leads with reliability. Using it means changing `manifest.json`:

```
Reliable Google Drive uploads that resume after closed tabs, crashes and Wi-Fi drops. Several files at once, with notifications.
```

**Description**

```
Start a big upload to Google Drive, walk away, and find it finished when you're back.

Uploading through the Drive website is fragile. Close the tab, let the computer sleep or lose Wi-Fi for a few minutes, and the upload stops or starts over. Uploft is built to keep going.

UPLOADS THAT DON'T FALL OVER
• Survives a closed tab or a crash: reopen the uploader and it carries on from what Drive already received, not from zero.
• Rides out Wi-Fi drops: it waits for the network, retries with back-off and continues from the last byte Drive confirmed.
• Keeps your computer awake while uploads run, and stops Chrome from unloading the tab.

FASTER BATCHES
• Uploads up to six files at the same time.
• Big files go up in pieces that grow on fast connections.
• Folders keep their structure in Drive.
• Uploading the same folder again skips the files that are already there.

FOR UPLOADS YOU START IN DRIVE
• A progress panel with speed and time left on drive.google.com.
• Notifications when uploads finish or fail.
• Optional automatic retry: it presses Drive's Retry button for you.

PRIVATE BY DESIGN
• Uses Google's narrowest Drive permission: it can only see files it uploaded and folders you pick, never the rest of your Drive.
• Files go straight from your browser to Google. There is no server in between, no analytics and no tracking.
• Source code: https://github.com/sai-na/uploft

HOW TO USE
1. Click the toolbar icon, then "Upload files to Drive".
2. Sign in with Google.
3. Drop in files or folders. They go into an "Uploft" folder in My Drive, or any folder you choose.

Privacy policy: https://sai-na.github.io/uploft/privacy.html

Free, made by Sai Nath. If it saved you a long upload, you can buy me a coffee: https://buymeacoffee.com/sai.nath
```

**Category**: Productivity → Tools

**Language**: English

**Official URL / Homepage**: `https://sai-na.github.io/uploft/`

**Support URL**: `https://github.com/sai-na/uploft/issues`

## Privacy practices tab

**Single purpose**

```
Upload files to Google Drive reliably and track the progress of Google Drive uploads, so uploads survive closed tabs, sleep and network drops.
```

**Permission justifications**

| Permission                                            | Justification to paste                                                                                                                                                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                             | Saves the user's settings, the chosen Drive folder, the signed-in account's name and email, and the short-lived access token (session storage), so uploads and sign-in continue after the popup or tab closes.              |
| `notifications`                                       | Tells the user when an upload finishes or fails, including uploads started on drive.google.com.                                                                                                                             |
| `power`                                               | Keeps the computer from going to sleep while uploads are running, so they aren't cut off. It is released as soon as the uploads finish.                                                                                     |
| `identity`                                            | Shows Google's sign-in window (chrome.identity.launchWebAuthFlow) to get a Google Drive access token with the drive.file scope.                                                                                             |
| Host `https://drive.google.com/*`                     | The content script reads Google Drive's own upload panel to show progress and notifications, and clicks Drive's Retry button when automatic retry is on. It also keeps the Drive tab from being discarded while it uploads. |
| Host `https://www.googleapis.com/*`                   | The uploader sends files to the Google Drive API (resumable uploads), creates folders and checks for files it already uploaded. Host access lets it read the upload's progress headers.                                     |
| `externally_connectable` `https://sai-na.github.io/*` | Lets our hosted Google Picker page (sai-na.github.io/uploft/picker.html) ask the extension for a token and return the folder the user picked. The extension answers only that exact page.                                   |

**Remote code**: No, I am not using remote code. All JavaScript ships in the package. The folder picker is a separate web page that the extension opens in a tab; the extension doesn't run its code.

**Data usage**: tick these boxes:

| Data type                           | Tick? | Why                                                                                                     |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | Yes   | Shows the signed-in Google account's name and email, and stores them on the device.                     |
| Health information                  | No    |                                                                                                         |
| Financial and payment information   | No    |                                                                                                         |
| Authentication information          | Yes   | Stores a Google OAuth access token on the device to call the Drive API.                                 |
| Personal communications             | No    |                                                                                                         |
| Location                            | No    |                                                                                                         |
| Web history                         | No    | Reads the current tab's address only when the toolbar button is clicked on Drive, and doesn't store it. |
| User activity                       | No    |                                                                                                         |
| Website content                     | Yes   | Handles the files the user uploads and reads file names and progress from Drive's upload panel.         |

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**: `https://sai-na.github.io/uploft/privacy.html`

## Graphic assets

| Asset              | Size     | Source                                                                                            |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| Store icon         | 128×128  | `icons/icon-128.png` (96 px artwork with 16 px padding, as the store asks)                        |
| Screenshots        | 1280×800 | In `store-assets/`, upload in this order:                                                         |
|                    |          | 1. `screenshot-1-uploading.png`: three files uploading side by side, with speed and time left     |
|                    |          | 2. `screenshot-2-finished.png`: finished batch with "Replaced" and "Already in Drive" rows        |
|                    |          | 3. `screenshot-3-resume-after-closing.png`: reopening the uploader after it was closed mid-upload |
|                    |          | 4. `screenshot-4-dark.png`: dark mode                                                             |
|                    |          | Made with a demo account and a stand-in for Google's API, so no real files or accounts appear     |
| Small promo tile   | 440×280  | `store-assets/promo-tile-440x280.png`                                                             |
| Marquee (optional) | 1400×560 | Same layout as the promo tile, wider                                                              |

## Google sign-in screen (Google Auth Platform)

Google Cloud console, project `uploft` (the new project in the account that owns Uploft):

**Branding**

| Field                      | Value                                          |
| -------------------------- | ---------------------------------------------- |
| App name                   | `Uploft` (must match the store name)           |
| User support email         | Your support address (pick one from the list)  |
| App logo                   | `icons/oauth-logo-120.png` (120×120)           |
| Application home page      | `https://sai-na.github.io/uploft/`             |
| Application privacy policy | `https://sai-na.github.io/uploft/privacy.html` |
| Authorized domains         | `sai-na.github.io`                             |
| Developer contact          | Your email                                     |

**Data Access**: only `https://www.googleapis.com/auth/drive.file`. It is non-sensitive, so Google checks the branding but does no security assessment.

**Clients**: add `https://<STORE_ITEM_ID>.chromiumapp.org/` as a redirect URI on the "Uploft extension" client, next to the unpacked one. The store assigns the item ID when you first upload a draft.

**Audience**: click **Publish app** once the store listing is live. Until then, only the listed test users can sign in.

## Before you submit

1. Turn on GitHub Pages: **Settings → Pages → Deploy from a branch → `main`, `/docs`**. Then check that the three pages load:
   - `/uploft/`
   - `/privacy.html`
   - `/picker.html`
2. Prove you own `sai-na.github.io` in [Google Search Console](https://search.google.com/search-console). Google needs this before it approves the branding.
   - A domain property isn't possible on github.io. Use a URL-prefix property for `https://sai-na.github.io/` instead.
   - Its verification file or meta tag has to be at the site root, which needs a `sai-na/sai-na.github.io` repository.
3. Run `npm run package`, then upload `release/uploft-<version>.zip`.
4. Add the store item's redirect URI to the OAuth client (see **Clients** above).
5. Submit for review, then publish the app on the Google sign-in screen.

Watch for one more request: Google may also ask you to verify the `chromiumapp.org` redirect domain, which you can't do. If that blocks branding approval, switch to a **Chrome Extension** OAuth client with `chrome.identity.getAuthToken`, which has no redirect domain.
