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
- Typography comes from `--type-body` (1rem), `--type-label` (.875rem),
  `--type-meta` (.8125rem), `--type-section` (1.25rem), `--type-page` (1.75rem).
  The root respects browser defaults (100%), becoming 112.5% at 1800 CSS px.
  Do not add per-screen pixel font patches, CSS zoom or scale transforms.
- Korean body line height is 1.6; headings start at 1.25 with restrained tracking.
  Titles wrap instead of losing essential content. Rows expand with their content.
- Controls target 44 CSS px or more, rows 52px or more. Deletion selection has an
  18px square inside an unframed hit area; completion has a circular indicator.
- Radii: controls 8px, containers 10px, overlays 14px. Prefer quiet borders over
  shadows or nested tinted panels. Remove redundant eyebrow copy, not useful help.
- New layout/typography tests cover 320, 390, 768, 1440, 1920, 2560 and 3840 CSS px,
  larger user text, unchanged navigation, long Korean titles and overlay stacking.
- Run browser verification with one worker. Test writes use local mocks only;
  never create production QA workspaces, records or Slack messages.

## Theme color contract

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
- KR/Initiative backgrounds stay neutral. Only their badges and rails use the
  hierarchy palette. Cyberpunk alone adds a small static selection glow.
- BlockNote menu/editor variables follow the active palette, but user-authored
  text/highlight colors and external brand marks must remain untouched.
- New component colors must not be literal hex/RGB values in `globals.css`.
  Add roles to the registry and contrast tests instead of theme-specific patches.

## Regression checks

- `tests/themes.test.mjs`: all palettes are complete, references resolve, text
  and button contrast is at least 4.5:1; controls, rails and disabled labels are
  at least 3:1. First-paint restoration handles invalid/blocked storage.
- `tests/e2e/themes.spec.ts`: every palette across the real screens and dialogs,
  editor/slash menus, keyboard theme selection, reload persistence, contrast,
  overflow and runtime errors. Buttons are checked at rest, hover, active,
  focus, disabled/busy and frame-by-frame when enabled.
- Axe contrast violations fail regardless of severity. Do not disable or filter
  them to accommodate a palette.
- Test projects cover 320px, 390px, 1440px and 3840px viewports. Theme previews
  are two columns on small screens and three where space permits.

References: [VS Code role-based theme colors](https://code.visualstudio.com/api/references/theme-color#button-control),
[Dark Modern palette](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_modern.json),
[WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
