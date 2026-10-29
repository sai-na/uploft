<img src="icons/icon-128.png" width="64" height="64" alt="" align="left" />

# Upload Tracker for Drive

A Chrome extension for uploading to Google Drive without babysitting the tab.
Uploads survive closed tabs, crashes, sleep and Wi-Fi drops. It also tracks the
uploads you start on drive.google.com.

<br clear="left" />

## Features

### Uploads you start in Drive (no setup)

- A progress panel on drive.google.com with speed and time left, plus
  notifications when uploads finish, fail or are cancelled.
- **Keep awake**: the computer doesn't sleep while uploads run.
- **No tab discarding**: Chrome's Memory Saver can't unload the Drive tab
  mid-upload.
- **Auto-retry**: when an upload fails it presses Drive's Retry button after
  5 s, 20 s and 60 s, or as soon as the network comes back. You get a failure
  notification only after the last try.

### The uploader (Google sign-in)

Click the toolbar icon, then **Upload files to Drive**.

- **Resumes instead of restarting.** It uses Drive's resumable uploads, and the
  queue is saved in IndexedDB. After a dropped connection, a closed tab or a
  Chrome restart it asks Drive how much it already has and carries on from
  there.
- **Several files at once.** 1–6 files go up side by side (4 by default). One
  file's pieces must go in order, so this speeds up batches, not a single huge
  file.
- **Adaptive pieces.** Big files go up in 8 MB pieces that grow to 64 MB on fast
  connections and shrink on slow ones.
- **Retries the right things.** Rate limits and server errors are retried with
  back-off. Offline time waits for the network without using up retries. A
  stalled connection is restarted.
- **Folders keep their structure**, and files already in Drive can be skipped.
- **Narrow permission.** It uses `drive.file`, so it can only see files it
  uploaded and folders you pick in Google's folder picker.

## Development

```sh
npm install
npm run build      # compiles to dist/
npm test           # upload engine and auto-retry tests
npm run lint
```

Load `dist/` on `chrome://extensions` with **Developer mode → Load unpacked**.
The extension's ID depends on the folder's path, so keep loading the same
`dist/` folder.

The Drive-tab features work as soon as the extension loads. The uploader needs
a Google Cloud project (OAuth client, API key, project number) and the GitHub
Pages site; see [docs/SETUP.md](docs/SETUP.md).

## Releasing

```sh
npm run package
```

This builds, then zips only the files the extension loads (no source maps or
type files) into `release/upload-tracker-for-drive-<version>.zip`. It stops if
a referenced file is missing or the uploader has no Google client ID.

The store listing text, permission justifications, data disclosures and
sign-in screen branding are in [docs/STORE_LISTING.md](docs/STORE_LISTING.md).

## Layout

| Path              | What's there                                                      |
| ----------------- | ----------------------------------------------------------------- |
| `src/content/`    | Drive-tab tracker: progress panel, auto-retry                     |
| `src/background/` | Service worker: notifications, keep-awake, folder picker messages |
| `src/popup/`      | Toolbar popup and settings                                        |
| `src/uploader/`   | The uploader page, upload engine and Drive API client             |
| `docs/`           | GitHub Pages site: home page, privacy policy, folder picker       |
| `icons/`          | Icons and their SVG sources                                       |
| `test/`           | Engine tests against a simulated Drive                            |

## Privacy

Files go straight from your browser to Google, with no server in between, no
analytics and no tracking. See the
[privacy policy](https://sai-na.github.io/upload-tracker-for-drive/privacy.html).

## Support

The extension is free. If it saved you a long upload, you can buy me a coffee.

<a href="https://buymeacoffee.com/sai.nath"><img src="icons/bmc-button.png" alt="Buy me a coffee" height="48" /></a>
