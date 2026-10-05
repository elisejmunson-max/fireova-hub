# Post media editor regression

`npm run test:post-media-editor:browser` bundles the actual integrated Create review component, PostMediaEditor and production CSS, then exercises them in Chromium with synthetic data. It never starts a Next server. The only replaced browser modules are the Supabase transport and Next navigation adapters.

Install the repo dependencies and `npx playwright install --with-deps chromium` first. `CHROMIUM_PATH=/path/to/chromium` selects an existing binary; `POST_MEDIA_EVIDENCE_DIR` chooses the evidence destination. `node tests/post-media-editor-browser.mjs --build-only` checks bundling and CSS without launching a browser. `npm run typecheck:post-media-editor` checks the real integrated component graph.

Coverage includes bank pagination/search/retry/stale-response handling; reorder/remove; Photo/Carousel/Reel rules and transitions; missing-media repair; complete/partial/duplicate/failed uploads; video JPEG poster creation and non-fatal poster failure; staged preview, cancel/reopen, Back/Forward and post navigation; CAS conflict/server failure and double-save locks; upload locking; exact caption/original/revision/identity/planning preservation; and a 390px mobile keyboard/scroll/focus flow. Reports contain source/bundle hashes, per-scenario results, request traces and screenshots.

All network is intercepted at `https://post-media.fixture.test`. Unknown routes and every other origin fail the test. API responses, Media Bank mutations, queue CAS and uploads are in-memory fixtures only. Approval and publishing routes are deliberately not implemented. No credentials, production media, real accounts, uploads, or database mutations are used.

This suite does not establish server-side authentication/RLS/database correctness, deployed App Router behavior, every media codec or real-device hardware behavior. A static bundle pass is not a browser pass. A launch failure records status `blocked` and zero executed scenarios, with a nonzero exit status.
