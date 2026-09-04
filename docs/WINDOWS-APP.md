# Windows app

OKRI uses an installable PWA, not a native EXE or an embedded WebView.
Edge/Chrome can install it into a standalone window with the existing Google
browser authentication, cookies and workspace selection. The browser owns the
Windows shortcut, taskbar integration, installation confirmation and uninstall.
Do not add a second account store or copy OAuth tokens into desktop storage.

## Installation

Open OKRI in Edge or Chrome. When the browser offers installation, the login
screen and app menu show `앱 설치`. The same one-use browser event serves all
buttons. Dismissal does not report success. Installed/standalone windows do not
show the button. Browsers without the install event can use their own site-app
installation menu; there is no simulated install dialog.

The manifest uses stable same-origin `/` identity and launch scope. Shortcuts
open existing My Work and OKR views; they do not pin an account
or team. Team address routing and OAuth remain the web application's concern.

## Build and update

- `predev` and `prebuild` generate `public/manifest.webmanifest` and
  `public/offline.html` from the shared theme registry and offline source.
- Existing SVG branding is rasterized into the versioned 192/512px PNG icons.
  `scripts/generate-app-icons.mjs` uses the existing sharp installation only when
  refreshing those icons; sharp is not needed by the normal app build/runtime.
- Build fingerprints include the offline document, static assets and worker
  source. An updated worker waits for existing app windows and site tabs to close. There is no
  forced reload or background polling loop.
- Root navigation always requests the server. Only hashed/public static assets
  and the fixed offline document enter Cache Storage. API responses, OAuth,
  invitations, workspace data and writes are never cached by the worker.
- Offline mode is a connection status screen, not offline editing. Retry keeps
  the original app URL. Offline fonts use only the needed Pretendard subsets.

## Verification

`npm test` includes manifest/icon, install-event, cache isolation, upgrade and
network/storage failure tests. `tests/e2e/pwa.spec.ts` validates real Chromium
manifest/installability, offline navigation and themed/responsive controls with
one browser worker and local API mocks. It does not install software on a user's
machine or create production records.

The packaged EXE, Microsoft Store listing, code signing, native tray, push
notifications and background offline writes are not part of this PWA release.
