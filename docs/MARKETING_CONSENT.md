# Marketing Consent Exposure

- The introductory prompt is optional and account-scoped, not workspace-scoped.
- `POST /api/account/marketing-consent` with `action: "claim"` atomically reserves its one permitted display. Other tabs, devices and future sessions receive `showPrompt: false`.
- A reservation is deliberately at-most-once: losing the response or closing the tab must not cause another prompt. `shown_at` records this reservation, not verified viewing or consent.
- Both choices start unchecked. Only an explicit `PATCH` changes consent values. A successful save records the choices and response marker in the same database transaction.
- X, Escape and "continue without consent" use `action: "dismiss"`. This records a skipped response without changing existing consent values or eligibility.
- Existing grants, partial grants, consent events and withdrawal events suppress the prompt. Legacy account marketing events also count; mandatory privacy consent alone does not.
- The existing browser dismissal key is imported as a dismissal. It is a fallback only; the server owns cross-device state.
- Settings stay collapsed under "Email preferences" until opened. Details load only on expansion. Users can still change or withdraw consent there.
- Failed writes never display success or retry automatically. Failed prompt requests do not block the service. Existing expiry, eligibility and signed unsubscribe behavior remain unchanged.
- Invitations, billing and security notifications are independent of these marketing choices.

## Verification

`tests/marketing-consent.test.mjs` exercises real SQLite transactions, concurrent claims, historical responses, additive LF migration, rollback, eligibility, unsubscribe and account authorization.

`tests/e2e/marketing-consent.spec.ts` uses mocked API writes with one Playwright worker for cross-tab/device behavior, lazy settings, save failure, withdrawal, theme contrast, rendered Pretendard fonts, keyboard access and narrow layouts/text zoom. Never exercise these writes on production accounts.
