# Project core properties

Project scheduling uses **기한** (due date) only. New workspaces receive:

- 상위 Initiative
- 상태
- 우선순위
- 기한
- 책임자 (one member; the internal `project_dri` role is unchanged)
- 하위 업무자 (multiple members)
- KR 기여 예상치

주기, 스프린트, 예상 시간, 예상 기간 and 시기 are not default properties.
Project creation, detail and final approval do not ask for a cadence. Existing
item cadence values remain available for compatibility; Routine recurrence and
external-data refresh schedules are unchanged.

Property removal is soft and workspace-scoped: preserve definitions, values and
IDs for restoration. Never reactivate a removed property during default setup.
The legacy built-in DRI label becomes 책임자 without changing assignments,
defaults or visibility. Preserve user-customized names and avoid collisions with
existing custom fields. The review-before-create and permission guards remain.
