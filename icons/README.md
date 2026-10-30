# Icons

Uploft's balloon: a hot-air balloon in Google Drive's blue, green and yellow, with a little face.

| File                                                        | Used for                                                                    | Source                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| `icon-16.png`                                               | Toolbar (1x). No face: at 16 px the eyes blur into a band                   | `src/icon-16.svg`                            |
| `icon-32.png`                                               | Toolbar (2x)                                                                | `src/icon-32.svg`                            |
| `icon-48.png`                                               | `chrome://extensions`                                                       | `src/icon-48.svg`                            |
| `icon-128.png`                                              | Chrome Web Store, install dialog, notifications                             | `src/icon-128.svg` (96px tile, 16px padding) |
| `oauth-logo-120.png`                                        | Google sign-in screen logo (Google Auth Platform → Branding); not packaged  | `src/icon-128.svg`                           |
| `logo-light.svg`, `logo-dark.svg`                           | The logo in the popup and uploader: white tile in light mode, night in dark |                                              |
| `balloon-carry.svg`, `balloon-wait.svg`, `balloon-done.svg` | The balloon on its own, for the uploader's drop area and states             |                                              |
| `bmc-button.png`                                            | Buy Me a Coffee's own button, bundled so nothing loads from their servers   |                                              |

All the SVGs come from `src/make_icons.py`. After changing it:

```sh
python3 icons/src/make_icons.py icons
rsvg-convert -w 16  -h 16  icons/src/icon-16.svg  -o icons/icon-16.png
rsvg-convert -w 32  -h 32  icons/src/icon-32.svg  -o icons/icon-32.png
rsvg-convert -w 48  -h 48  icons/src/icon-48.svg  -o icons/icon-48.png
rsvg-convert -w 128 -h 128 icons/src/icon-128.svg -o icons/icon-128.png
rsvg-convert -w 120 -h 120 icons/src/icon-128.svg -o icons/oauth-logo-120.png
```
