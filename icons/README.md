# Icons

Upload arrow inside a progress ring in Google Drive's colours.

| File                         | Used for                                                                   | Source                                          |
| ---------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| `icon-16.png`, `icon-32.png` | Toolbar (1x / 2x)                                                          | `src/icon-small.svg` (drawn on a 16px grid)     |
| `icon-48.png`                | `chrome://extensions`                                                      | `src/icon-48.svg`                               |
| `icon-128.png`               | Chrome Web Store, install dialog                                           | `src/icon-128.svg` (96px artwork, 16px padding) |
| `oauth-logo-120.png`         | Google sign-in screen logo (Google Auth Platform → Branding); not packaged | `src/icon-128.svg`                              |

Re-render after editing a source:

```sh
rsvg-convert -w 16  -h 16  icons/src/icon-small.svg -o icons/icon-16.png
rsvg-convert -w 32  -h 32  icons/src/icon-small.svg -o icons/icon-32.png
rsvg-convert -w 48  -h 48  icons/src/icon-48.svg    -o icons/icon-48.png
rsvg-convert -w 128 -h 128 icons/src/icon-128.svg   -o icons/icon-128.png
rsvg-convert -w 120 -h 120 icons/src/icon-128.svg   -o icons/oauth-logo-120.png
```
