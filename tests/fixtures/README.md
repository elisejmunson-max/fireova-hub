# Media Bank browser fixture

This fixture bundles the repository's actual `app/(app)/media-bank/library.tsx`, pagination/request helpers, and compiled Tailwind/global CSS. Only the browser Supabase client is replaced by `media-bank-supabase.ts` at bundle time. No production files contain a fixture login or authentication bypass.

## Run

```sh
npm ci
npx playwright install --with-deps chromium
node tests/media-bank-browser.mjs
```

Optional `CHROMIUM_PATH` selects a system Chromium executable. By default Playwright uses its installed browser. Optional `MEDIA_BANK_EVIDENCE_DIR` selects the output directory; the default is `../evidence` relative to the repository. Run `node tests/media-bank-browser.mjs --build-only` to validate bundling/CSS without launching a browser.

No server socket, CI secret, Supabase account, production media, or network access to a production service is needed. Playwright fulfills every expected request at `https://media-bank.fixture.test` and aborts unexpected requests. APIs check an HTTP-only, secure, test-only session cookie. The dataset has 241 owner-A media records, including an initially unloaded unique search target, plus one foreign-owner record that must not be returned. SVG responses represent thumbnails and full images. The small MP4 exercises actual browser video decoding. The mocked upload flow does not validate its deliberately minimal image bytes.

## Prepared scenarios (14)

1. Desktop initial 24-item page, bounded thumbnail requests, no originals/videos, scroll pagination, detail navigation, explicit video decoding
2. Whole-library unloaded-item search, counts, persistent selection, empty results, type filter
3. Delayed old search and rapid query/filter changes
4. Failed reset and explicit offset-zero retry
5. Duplicate-page merge and server cursor progression
6. Metadata saves, delete refresh, upload refresh
7. Detail navigation across loaded-page boundaries, full-query wrap, Escape
8. Bulk deletion of hidden and visible selections across filters
9. Thumbnail failure/retry without original fallback
10. Initial server-seed error and recovery
11. Metadata-paged slideshow with only one current original
12. Short laptop 1280×650 layout and reachable detail controls
13. Mobile 390×844 layout and reachable detail controls
14. Fixture session enforcement and foreign-owner isolation

The desktop scenario uses 1280×800. Successful execution saves viewport screenshots, per-scenario request events, response-body bytes, assertions, and a report. Response bytes are exact fulfilled fixture body sizes, not production wire-transfer estimates. A launch failure saves a separate blocked diagnostic; it is never presented as a passed browser run.

## Coverage limits

This is real-browser testing of the actual client component against mocked contracts. It does not exercise Next.js route implementations, actual server rendering, Supabase authentication/RLS/storage, real thumbnail transformations, deployment configuration, event-specific review UI, real AI analysis, HEIC conversion, or production transfers. Production security and measured performance need separate integration checks.

The fixture MP4 was generated locally with:

```sh
ffmpeg -f lavfi -i color=c=0x26372b:s=320x240:d=1 -c:v libx264 -pix_fmt yuv420p -movflags +faststart media-bank-video.mp4
```

The binary is committed, so ffmpeg is not needed to run tests.
