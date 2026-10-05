# Monthly planning

The Create Content panel shows canonical editorial planning dates from `content_plan_slots`, a dated post list and per-month owner priorities. It does not schedule or publish posts. It does not run any preparation connector automatically.

## Data contract

- `GET /api/monthly-plan?month=YYYY-MM` returns `{month, features: {month, revision, priorities}, entries, truncated}`
- `PUT /api/monthly-plan` accepts exactly `{month, revision, priorities}`
- A priority is `{id: <UUIDv4>, text: <nonblank text>}`; at most 20 per month and 1,000 characters each
- Every write requires the revision last read. Revision `0` is create-only; later writes use owner/month/revision predicates. A conflict is HTTP 409, never a blind upsert
- The current authenticated user determines ownership. Callers cannot supply an owner ID
- Responses are private/no-store. Missing tables and failed reads return unavailable, never a successfully empty saved list
- A future preparation tool can read the same owner-scoped GET contract. This feature does not install or activate such a tool

## UI behavior

Desktop panel collapses; smaller screens use a modal sheet with focus trapping, keyboard dismissal and Back/Forward support. Saved priorities persist in the database across devices and refreshes. Unsubmitted inputs stay in memory by month while switching or closing the panel, with an Unsaved indicator and an unload warning. They are not saved until the owner clicks Add priority or Save changes. Conflicts retain input and require review of the newer saved version before resolving.

## Database release gate

The underlying durable-planning migration is a dependency. `supabase/monthly-feature-plans.sql` is a separate additive migration requiring explicit production migration/permission approval before execution. Do not execute it automatically during application builds.

Only the new table/function are changed:

| Role | New table | Validation trigger function |
| --- | --- | --- |
| authenticated | SELECT, INSERT, UPDATE under owner-only RLS | No client EXECUTE |
| PUBLIC, anon, service_role | None | None |

The migration adds no definer function, service-role workflow, credentials or schema-wide default privileges. It does not update existing drafts, captions, media, approved posts or review notes. An immutable owner/month key, bounded JSON and strictly incrementing revision are checked in the database as well as the API.

## Verification

- `npm run test:monthly-planning`: model, API and existing planning regression tests
- `npm run typecheck:monthly-planning`: focused strict TypeScript
- `npm run test:monthly-planning:browser`: actual dashboard/panel/CSS with fake-only network interception; requires Playwright Chromium
- `bash supabase/tests/run-monthly-feature-plans.sh`: guarded disposable local PostgreSQL test database, with `MIGRATION_OWNER=postgres` or `supabase_admin`
- GitHub workflow uses contents-read-only permissions, no application secrets and a disposable test PostgreSQL service. It verifies both migration owners and retains fake-data browser evidence

Full-project TypeScript already has unrelated failures. Focused checks must pass; do not treat Next's existing `ignoreBuildErrors` setting as type safety verification.
