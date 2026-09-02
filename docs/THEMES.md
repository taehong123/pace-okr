# OKRPTR design and theme contract

## Design source and structure preservation

The upstream design source is [ALLVIBE Design v1.0.0](https://github.com/all-vibe/all-vibe-agent-toolkit/blob/4f927714f728abcbe8920a3c39aad49692758c46/plugins/all-vibe-design/skills/all-vibe-design/SKILL.md), shared by 조성배 on 2026-08-24.
Read its foundations, application-design, interaction-accessibility, content-design
and service-profiles references before substantial UI work. This document records
OKRPTR-specific clarifications, not a replacement design system.

- Preserve navigation order, default destination, URL contracts, tab grouping,
  object hierarchy, view modes and create/edit flows. Styling is not permission
  to move features or rewrite their behavior.
- White is monochrome: white canvas, ink-black actions/links/focus, cool neutral
  separators. Keep semantic status colors and external brand marks intact.
- Existing explicit themes remain available and saved preferences win.
- Korean, Latin and numerals use the same self-hosted Pretendard Variable 1.3.9
  family through `--font-ui`. The 92 official Unicode-range subsets load only
  when their glyphs are visible; do not preload the entire font or add a CDN.
- Typography comes from `--type-body` (1rem), `--type-label` (.875rem),
  `--type-meta` (.8125rem), `--type-section` (1.125rem), `--type-page` (1.5rem).
  The root respects browser defaults (100%) at every viewport width.
  Do not add per-screen pixel font patches, CSS zoom or scale transforms.
- Korean body line height is 1.6; headings start at 1.25. Letter spacing is zero.
  Titles wrap instead of losing essential content. Rows expand with their content.
- Desktop density is deliberately quieter: controls 36px, editable fields 40px,
  and rows at least 48px. At 980px and below, or with a coarse pointer, controls
  and fields are at least 44px and rows at least 52px. All dimensions use rem.
  This is the user's balance correction, not a font-size reduction: body and
  inputs remain 16px. Never enlarge desktop density at 1800px or any wider size.
  Deletion selection retains an 18px square inside a 44px unframed hit area;
  completion has a circular indicator. Long content must increase row height.
- Radii: controls 8px, containers 10px, overlays 14px. Prefer quiet borders over
  shadows or nested tinted panels. Remove redundant eyebrow copy, not useful help.
- Spacing uses the 4/8/12/16/24/32px scale (`--space-*`). Desktop page insets are
  32px, mobile insets 16px. Page top spacing is 24px and heading-to-content spacing
  is 16px. The page heading and document share a left edge.
  Tree indentation is 32px on desktop and 16px on mobile. Sibling titles,
  counts and percentages share fixed grid tracks; labels must not split mid-word.
- The OKR read surface is an unframed document, not a card inside another card.
  Child Projects use dividers, not nested boxes. Root titles have section-sized
  text, execution rows body-sized text, and metadata regular medium-weight text.
- New layout/typography tests cover 320, 390, 768, 1440, 1920, 2560 and 3840 CSS px,
  larger user text, unchanged navigation, long Korean titles and overlay stacking.
- Run browser verification with one worker. Test writes use local mocks only;
  never create production QA workspaces, records or Slack messages.

## Theme color contract

Use the unmodified sRGB scales in [Radix Colors 3.0.0](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette).
Their [role-based steps](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
are the source for backgrounds, separators, interactive borders and text.
`lib/themes.ts` includes the exact upstream scale data and maps roles once.
Stronger text steps are selected when necessary to meet 4.5:1 WCAG contrast.

| Theme | Neutral | KR and main accent | Initiative |
| --- | --- | --- | --- |
| White | Gray | Ink / Gray | Slate |
| Beige | Sand | Gold | Teal |
| Gray | Slate | Teal | Violet |
| Dark | Gray Dark | Blue Dark | Violet Dark |
| Neon | Slate Dark | Cyan Dark | Violet Dark |
| Cyberpunk | Mauve Dark | Pink Dark | Cyan Dark |

Bright accents belong on controls, rails and badges, not large tinted panels.
Status colors retain their meaning independently of the hierarchy palette.
Upstream licenses are retained with the font assets and in
`public/RADIX-COLORS-LICENSE.txt`. Font reference:
[Pretendard variable subsets](https://github.com/orioncactus/pretendard#%EA%B0%80%EB%B3%80-%EB%8B%A4%EC%9D%B4%EB%82%98%EB%AF%B9-%EC%84%9C%EB%B8%8C%EC%85%8B).

`lib/themes.ts` is the single source for theme IDs, labels, brightness, defaults,
previews and semantic colors. White is the fallback; a valid saved `okrptr.theme`
always wins. `app/layout.tsx` applies the generated palette and preference before
the first body paint. The client and BlockNote consume the same registry.

## Component rules

- Surface text uses `text-primary`, `text-secondary` or `text-tertiary` on the
  corresponding `bg-*` surface. Links and icons have their own tokens.
- Actions use **paired** `button-{role}-bg` and `button-{role}-fg` tokens, never
  `ink`, `raised`, hardcoded white, or an unrelated accent as a substitute.
- Use the existing `primary-action`, `secondary`/`cancel` and `icon-button`
  classes. Existing component-specific action selectors are mapped together
  in the shared action-state section of `app/globals.css`.
- When adding an action selector, map its role once; the nested hover/active
  rules must apply to it too. Destructive filled actions use the danger pair.
- Disabled colors are explicit, not opacity. `disabled` and `aria-disabled`
  controls use the common disabled pair, including nested labels and icons.
  Busy controls retain that readable pair and expose `aria-busy` where needed.
- Do not animate foreground/background/opacity between enabled and disabled
  button states: individually valid endpoints can have unreadable intermediate
  colors. Border/shadow motion remains allowed.
- Semantic messages/badges use a matching `{status}-fg` / `{status}-bg` pair.
  Small status dots use the foreground token, not the pale badge background.
- Focus uses `focus-ring`. A subtle separator is not a control outline;
  identifiable controls use `border-control`.
- KR/Initiative backgrounds stay neutral. Their badges and rails use matching
  theme accent roles, not a shared light/dark brown or gray-green palette.
  All progress bars and range controls use `progress-fill` / `progress-track`;
  percentage labels use `progress-text`. Cyberpunk alone adds a small static
  selection glow.
- BlockNote menu/editor variables follow the active palette, but user-authored
  text/highlight colors and external brand marks must remain untouched.
- New component colors must not be literal hex/RGB values in `globals.css`.
  Add roles to the registry and contrast tests instead of theme-specific patches.

## Regression checks

- `tests/e2e/design-balance.spec.ts`: desktop density stays stable through 4K;
  editable values and mobile touch targets retain their size, search/date values
  fit their columns, and selection/completion hit areas stay separate with larger
  user text.
- `tests/themes.test.mjs`: all palettes are complete, references resolve, text
  and button contrast is at least 4.5:1; controls, rails and disabled labels are
  at least 3:1. First-paint restoration handles invalid/blocked storage.
- `tests/e2e/themes.spec.ts`: every palette across the real screens and dialogs,
  editor/slash menus, keyboard theme selection, reload persistence, contrast,
  overflow and runtime errors. Buttons are checked at rest, hover, active,
  focus, disabled/busy and frame-by-frame when enabled.
- Axe contrast violations fail regardless of severity. Do not disable or filter
  them to accommodate a palette.
- Verify actual Korean/Latin glyph rendering through browser font diagnostics,
  not just a computed font-family declaration. Fonts must load from this site's
  own origin, and subsets not needed by the page must remain unloaded.
- Test projects cover 320px, 390px, 1440px and 3840px viewports. Theme previews
  are two columns on small screens and three where space permits.

References: [VS Code role-based theme colors](https://code.visualstudio.com/api/references/theme-color#button-control),
[Dark Modern palette](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_modern.json),
[WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
