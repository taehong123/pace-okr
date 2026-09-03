# Public entry landing

## Scope

The unauthenticated branch of `/` renders `app/landing.tsx`. Authenticated
navigation, invitation handling, registration, OAuth callbacks and API routes
remain unchanged. Optional bootstrap-cache cleanup tolerates unavailable storage.

The four slides cover OKR adoption, connected work, reviewing an AI-prepared
Project, and daily work with independent Routines. There is no autoplay or wrap.
Native scroll snapping supports touch; arrows, dots and keyboard controls support
manual navigation. The login footer is independent of the reading area.

`lib/landing-copy.ts` owns Korean, English, Japanese, Chinese and Spanish copy.
The saved `okrptr.intro-language` wins, followed by supported browser languages,
then English. Product captures show the current Korean application; localized
captions and alternative text describe the examples. They are not a claim that
the entire signed-in application has five-language localization.

All landing colors reference the shared theme roles. The active `data-theme`
also selects the corresponding image set. No external font, analytics, API or
database capability was added.

## Content sources

- [Google re:Work team: Let's Make Work Better](https://blog.google/company-news/outreach-and-initiatives/small-business/lets-make-work-better/)
- [John Doerr: Intel Operation Crush](https://www.whatmatters.com/okrs-explained/john-doerr-operation-crush)

These support OKR adoption, not customer endorsements of OKRPTR. Work progress
and Key Result values are displayed independently, without automatic attribution.
The undeployed Slack summon bot is not advertised.

## Product captures

`public/landing/` contains four PNGs in desktop and mobile variants for each of
the six themes. `tests/e2e/landing-product-fixture.ts` supplies fictional records
to the actual application and Project review screen. All writes are mocked.
No production data or integration messages are used.

Capture through a local server with a single worker:

```powershell
$env:OKRPTR_E2E_BASE_URL = 'http://localhost:3187'
$env:OKRPTR_CAPTURE_LANDING = '1'
$env:OKRPTR_LANDING_ASSET_DIR = Join-Path $env:TEMP 'okrptr-landing-media'
npx playwright test tests/e2e/landing-assets.spec.ts --project=desktop-chromium --workers=1
```

Review the images, stop the local server before copying generated assets into
`public/landing`, then restart. This prevents Vite from repeatedly reloading its
RSC context while a batch of images is written. Regenerate the captures when the
theme or source product UI changes.

## Verification

```powershell
npx playwright test tests/e2e/landing.spec.ts --project=desktop-chromium --workers=1
npx tsc --noEmit --incremental false
npm run lint
npm test
```

The landing tests cover all languages/themes, native images, 320-3840 CSS-pixel
viewports, actual self-hosted Korean/Latin/numeral fonts, 200% user text,
long titles, keyboard scrolling, swipe, blocked storage, sign-in on every slide,
invitation/deep-link return destinations, existing sessions and sign-out.
Inspect the generated screenshots as well as the geometry assertions.

## Release boundary

This change was prepared separately on `codex/landing`, based on public version
165 (`c82f438f679ac0aec6cde0cc6f7225d76ff03fb7`). Coordinate with other OKRPTR
tasks before integration. Do not include the separately prepared version 166 or
other unapproved work by copying the shared working tree wholesale.

Public deployment requires the user's explicit approval. This implementation
does not itself publish, change DNS, or run migrations.
