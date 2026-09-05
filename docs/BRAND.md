# OKRI identity

The approved identity is a broken O/target ring with an inward diagonal arrow,
paired with a bold outlined OKRI wordmark. It shares Kuiver's monochrome,
rounded-square silhouette and diagonal geometry without reusing its quiver.

- `lib/brand-artwork.ts` is the editable vector source. The wordmark is artwork,
  not a UI font; all surrounding interface text remains on Pretendard.
- `app/brand-logo.tsx` renders the same paths with a stable aspect ratio and an
  accessible OKRI name. Decorative uses are hidden from assistive technology.
- Brand artwork alone uses the approved ink `#111111` and paper `#ffffff`,
  reversed in Dark, Neon and Cyberpunk. Do not apply status/action colors to it.
  This is an artwork exception to UI palette tokens, not a new interface palette.
- Workspace images and initials represent customer workspaces, not OKRI. Keep
  those separate from the service logo and do not replace customer uploads.
- Generate public SVGs, PWA PNGs, maskable/Apple icons and the share image with
  `node scripts/generate-app-icons.mjs`. Commit generated files with the source.
- Increment `BRAND_ASSET_VERSION` for future artwork changes so installed apps
  and browser caches see new asset URLs. Keep the manifest ID and launch URL.
- The app is a PWA on Windows/Mac; no native EXE/DMG bundle is present here.
  Already installed apps receive icon updates on the browser's update schedule.
- External Slack/ChatGPT app-directory icons are controlled by their respective
  app configurations, not by deploying the website. Use `okri-512.png` there.

Checks: `node --test tests/brand.test.mjs`; browser checks use one worker and
mocked API writes in `tests/e2e/brand.spec.ts`.
