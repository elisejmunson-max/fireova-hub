# Marketing Intelligence V1

Marketing Intelligence is the event-level analysis layer for the Fireova Marketing Hub. Every event should have one report, and UI consumers should render that report instead of independently interpreting raw event data.

## What It Owns

- Qualitative marketing ratings and potential labels.
- Business goal, service, and ideal client matches.
- Content strengths and supported content gaps.
- Event marketing opportunities.
- Recommended formats and posting order.
- Source snapshots, source fingerprints, and generator version invalidation.
- Future extension fields for vision, video, caption, engagement, posting history, calendar, and seasonality inputs.

## What It Does Not Own

- Real AI analysis.
- Engagement, reach, or performance predictions.
- Media blob storage.
- User authentication or Supabase persistence.
- UI layout decisions.

## Lifecycle

Use `getOrGenerateMarketingIntelligence(event)` from `lib/local-fireova-marketing-intelligence.ts`.

The helper:

1. Builds the relevant source inputs.
2. Computes a deterministic source fingerprint.
3. Reads the persisted report.
4. Returns the persisted report when the fingerprint and generator version still match.
5. Regenerates and persists a report when relevant source data changed.
6. Regenerates when `MARKETING_INTELLIGENCE_GENERATOR_VERSION` changes.

Use `safelyGetOrGenerateMarketingIntelligence(event)` in UI code that must degrade gracefully.

## Fingerprint Inputs

The source fingerprint includes:

- Event details, media metadata, notes, venue, and vendors.
- Content Bank metadata linked to the event media.
- Generated posts and post statuses.
- Marketing opportunity user state.
- Business Profile goals, services, ideal clients, brand voice, and brand priorities.
- The generator version.

This prevents unnecessary regeneration while still invalidating stale reports when meaningful local data changes.

## Persistence

Reports are stored in localStorage under `fireova-marketing-hub-marketing-intelligence-v1`, keyed by event ID. Event deletion removes the report through `deleteLocalEvent`.

Writes are guarded so storage quota or browser storage failures do not break event pages or the dashboard.

## Regeneration And Merge Strategy

Rule-based opportunities may refresh on regeneration. User work is preserved by merging generated opportunities with saved opportunity state:

- Manual opportunities are retained.
- Dismissed rule opportunities remain dismissed.
- Generated-post links survive regeneration.
- User-edited rule opportunity titles and summaries are preserved for matching IDs.
- Manual opportunity reasons and missing-shot notes are preserved.

The report stores the merged opportunity list as its opportunity section.

## UI Consumer Rule

UI code must not recalculate intelligence conclusions such as strengths, gaps, goal matches, potential ratings, recommended formats, or posting order. UI pages should use the report and helper APIs.

Low-level reusable functions used by the generator may still live outside this module when they are not UI-specific.

The dashboard still ranks ready posts and Content Bank items for weekly planning. That ranking should be treated as planner orchestration, not event intelligence. Before adding real AI, move any event-level ranking signals needed by the dashboard into the report.

## Development Inspector

In development, the event Opportunities page exposes a collapsible `View intelligence report` panel. It shows report version, generator version, source fingerprint, generated time, goal matches, strengths, gaps, potentials, and opportunity IDs/sources/statuses. The panel is hidden in production.

## Future AI Inputs

Vision, video, caption, engagement, posting history, calendar, and seasonality systems should populate or replace structured fields in the report. They should update the source fingerprint inputs or generator version so stale reports invalidate predictably.

Do not add AI claims directly to UI surfaces without first adding them to the report model and fingerprint lifecycle.
