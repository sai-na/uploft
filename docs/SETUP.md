# Setting up the uploader

The tracker overlay, notifications, keep-awake and auto-retry work with no setup.
The uploader (parallel, resumable uploads) talks to the Drive API, so it needs a
Google Cloud project. None of the values below are secrets; they ship inside the
extension.

## 1. Google Cloud project

1. Create a project at <https://console.cloud.google.com/projectcreate>.
2. Enable **Google Drive API** and **Google Picker API** (APIs & Services → Library).
3. Note the **project number** from the project dashboard. It's the `GOOGLE_APP_ID`.

## 2. OAuth consent screen

APIs & Services → OAuth consent screen (Google Auth Platform):

- User type: **External**
- App name: Uploft. Add a support email.
- Branding (needed before you publish): logo `icons/oauth-logo-120.png`, home page
  `https://sai-na.github.io/uploft/`, privacy policy
  `https://sai-na.github.io/uploft/privacy.html`, authorized
  domain `sai-na.github.io`. [STORE_LISTING.md](STORE_LISTING.md) has every value.
- Data access → add the scope `https://www.googleapis.com/auth/drive.file`.
  It's a non-sensitive scope, so publishing needs brand verification only, with
  no security assessment.
- While testing, add yourself under **Test users**. Publish the app once the
  extension is live.

## 3. OAuth client

Credentials → Create credentials → OAuth client ID:

- Application type: **Web application**
- Authorized redirect URIs: `https://<EXTENSION_ID>.chromiumapp.org/`
  - The unpacked build's ID is shown on `chrome://extensions`. It depends on the
    folder you loaded, so keep loading the same `dist/` folder.
  - Add the Chrome Web Store ID too once the item exists.

Copy the client ID into `GOOGLE_CLIENT_ID`.

## 4. API key (for the folder picker)

Credentials → Create credentials → API key, then restrict it:

- Application restrictions: **Websites** → `https://sai-na.github.io/*`
- API restrictions: **Google Picker API** only

Copy it into `GOOGLE_API_KEY`.

## 5. Pages site

`docs/` is served with GitHub Pages: repository Settings → Pages → Deploy from a
branch → `main`, `/docs`. It holds three pages:

- `picker.html`: the folder picker. It's a plain web page because the Google
  Picker script can't be loaded into an extension page (Manifest V3 forbids
  remote code).
- `index.html`: the home page for the sign-in screen and the store listing.
- `privacy.html`: the privacy policy.

If you host it elsewhere, change `PICKER_URL` in `src/uploader/config.ts` and
`externally_connectable` in `manifest.json` to match.

## 6. Build

Fill in `src/uploader/config.ts`, then:

```sh
npm install
npm run build
```

Reload the extension on `chrome://extensions`, click its toolbar icon, then
**Upload files to Drive**.

For the Chrome Web Store, run `npm run package`. It builds, then zips only the
files the extension loads into `release/uploft-<version>.zip`.
It stops if `config.ts` has no client ID. The listing text, permission
justifications and the remaining steps are in [STORE_LISTING.md](STORE_LISTING.md).

## Why drive.file

`drive.file` only lets the extension see files it uploaded and folders you choose
in the picker. The narrower scope keeps the Web Store review simple and limits
what a leaked token could reach. The trade-offs:

- Uploads go into an **Uploft** folder in My Drive until you choose
  another folder.
- To upload into the folder you have open in Drive, the uploader asks you to
  confirm it once in the picker.
- "Skip files already uploaded" only sees files the extension uploaded itself.
