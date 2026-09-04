# OKRPTR development contract

Before changing UI, read `docs/THEMES.md` and the relevant component styles.
The document is an implementation contract, not optional inspiration.

- Preserve behavior, navigation, permissions, customer data and other services.
- Use the shared font, typography, spacing and semantic color tokens.
- Keep Korean, Latin and numerals on the self-hosted Pretendard family.
- Do not change text size by viewport width or add nonzero letter spacing.
- Do not invent component hex colors. Use the documented Radix palette roles.
- Hierarchy badges, rails and progress indicators must follow the chosen theme.
- Use an aligned, unframed layout for page sections; avoid nested visual cards.
- Before publishing, check actual rendered fonts, light/dark palette contrast,
  narrow/mobile and wide layouts, long titles, keyboard access and user text zoom.
- Run browser checks with one worker and mocked writes. Do not create test
  records or send integration messages in production.
- Coordinate with other OKRPTR tasks before changing shared files or deploying.
- Keep migration SQL as LF. Never weaken database guards to fix packaging.
