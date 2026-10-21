# Little Moments — context for Claude

AI-assisted baby photo journal for iPad-first "digital journaling" mums. Phase 1 = no AI; validate layout quality, editing feel, and "one page in under 3 minutes" on real devices. Owner: Jacky (frontend dev, React/TS). Reply in Chinese unless asked otherwise.

## Decisions already made (don't relitigate without new evidence)

- **React Native (Expo SDK 58, RN 0.88) over Capacitor/PWA.** Owner knows RN; native gestures; Skia canvas. iOS/iPadOS first; Android only "renders, untuned".
- **Canvas = @shopify/react-native-skia 2.14** + Reanimated 4 + **Gesture Handler 3 (hook API: `usePanGesture`, `useSimultaneousGestures`, callbacks `onBegin/onUpdate/onFinalize`)** — not the v2 `Gesture.Pan()` builder.
- **PageDocument (packages/page-schema) is the single source of truth.** Units are PDF points, A4 = 595×842. Screen and 300 dpi export are just scales. Versioned with `schemaVersion` + migrations (`migrations.ts`) — pages must survive years.
- **Layout engine is deterministic and pure TS** (`packages/layout-engine`). Text measurement is injected (`MeasureText`); app passes Skia Paragraph, tests pass a fake. AI (Phase 2) will only pick template/slot assignments/captions, never coordinates.
- **Local-first, no backend in Phase 1.** SQLite (expo-sqlite) for pages/photos/events; files under `Paths.document`, stored as **relative** paths (iOS container path changes).
- **Memory budget:** photos are downsampled at decode time on import (`WORK_EDGE` 2560, thumbs 480). Never load originals into Skia.
- **PDF export = one 300 dpi JPEG per page** via pdf-lib (text not selectable). Vector text + CJK subsetting deferred.
- **Phase 1 UI is English only.** All copy lives in `apps/mobile/src/strings.ts` (no i18n framework yet). The layout engine still supports `locale: 'zh'` but the app passes `'en'`.
- **Baby profile is required** (expo-router `Stack.Protected` in `_layout.tsx`). One baby in the UI, but the DB is multi-baby (`babies` table, `pages.baby_id`). Age and zodiac are **derived** from birthday (`src/baby/derive.ts`), never stored. Western zodiac only (Chinese zodiac was dropped with bilingual support).
- The page heading is `dateLine(journalDate, 'en', ageText)`; the engine receives a pre-formatted `ageText` and knows nothing about babies. Already-generated pages keep their baked heading text until re-laid out.
- Render must stay pure (React Compiler lint): read "today" via `useToday()`, not `Date.now()` in render.
- Gestures mutate shared values only (UI thread); commit to the doc once on gesture end (`EditorCanvas.tsx`). Shared values use `.get()/.set()` (React Compiler lint rule).

## Layout

```
apps/mobile/src/app        expo-router screens: index (grid), new (import+select+caption), page/[id] (editor)
apps/mobile/src/editor     EditorCanvas (gestures), useEditor (undo + debounced save), text/sticker sheets
apps/mobile/src/render     PageContent (shared by screen + export), text.ts (Skia paragraph), export.tsx
apps/mobile/src/photos     import/downscale, dates (pure, tested), files, orphan cleanup
apps/mobile/src/db         migrate, repo, events (local-only metrics: time from flow start to first export)
packages/page-schema       Zod schema, migrations, geometry, edit helpers (+ vitest)
packages/layout-engine     7 templates (3/4/5 photos), slot assignment, text fitting, stickers (+ vitest)
packages/ai-contracts      caption request/output/response schemas, interpret(), fallback, prompt (+ vitest, fixtures)
apps/api                   Hono caption proxy: generate.ts (retry policy), app.ts (routes, quota, idempotency, logs), anthropic.ts (SDK adapter)
tools/template-preview     renders every template headless (CanvasKit) with the real PageContent → PNGs
```

## Commands

```bash
pnpm install                     # Node 22 (.nvmrc), pnpm 10 via corepack
pnpm test                        # vitest in all packages
pnpm typecheck
cd apps/mobile && npx expo lint  # must pass (React Compiler rules)
npx expo run:ios                 # simulator; needs Xcode 26+ (Xcode 16 fails on ExpoModulesJSI)
npx eas-cli@latest build -p ios --profile simulator   # cloud build when local Xcode is too old
npx eas-cli@latest build -p android --profile preview # APK for Android tablets
pnpm --filter @lm/template-preview preview            # needs a CJK .otf in tools/template-preview/
```

`ios/` and `android/` are generated (CNG) and gitignored — change `app.json`/config plugins, never edit them by hand. Install native deps with `npx expo install`.

## Status (2026-10-21)

- Phase 1 editor/export pushed. AI plan steps 2 (`ai-contracts`) and 3 (`apps/api`, local) done — 250 unit tests across the repo. First real-API smoke run (2026-10-20, n=3): schema accepted, all ok, latency 1.1/1.9/3.0 s (min/median/max), ~800 input tokens. It exposed (a) smoke inputs identical to prompt examples → model copied them verbatim, (b) a fabrication false positive from our own example ("said it all"). Fixed in `caption@2`. Smoke n=16 on `caption@2` (2026-10-21): 16/16 ok, copied 0, p50 1.7 s / p90 3.4 s / max 3.6 s, but ~10/14 non-empty captions added content the note lacked (feelings; and people/events: "with her family", "while Zoe napped, her mom…", first person "kept me company", filler about "three photos"); regex caught only 2 ("first").
- **`caption@3` + eval (2026-10-21, owner-approved):** product rule = **feelings may be added, people/events/places/milestones may not**; third person only; instruction-like note → empty caption; photo count no longer sent to the model. New warnings: people terms join `possible_fabrication` (mum and dad separate; "we/us/our" in note allows "parents"), new `first_person`. `pnpm --filter @lm/api eval [reps]` = 30 fixed cases (`apps/api/eval/cases.ts`) + LLM judge (`JUDGE_MODEL`, default claude-sonnet-5-5) → headline **addedContentRate** (non-feeling unsupported claims), detector caught/missed/extra vs judge, empty-caption expectation, photo/first-person/copy counts, latency. Results JSON in `apps/api/eval/results/` (gitignored). **First real eval run pending (owner).** Timeouts 12 s / 8 s unchanged until more latency data.
- **Step 1 of the AI plan done: baby profile + English UI** (typecheck, lint, iOS bundle green). Adds native dep `@react-native-community/datetimepicker` → owner must `npx expo prebuild -p ios --clean` before `run:ios`.
- Owner's Mac: upgraded to Xcode 26-capable setup; first local simulator build **succeeded** (Metro bundled). Was locating the Simulator app (`open -a Simulator` not found — check `$(xcode-select -p)/Applications/` for Simulator.app vs Xcode 27's Device Hub).
- **Not yet verified on device:** gesture feel (any one-frame snap-back on release), memory with 48 MP photos, export timings, PDF in Goodnotes, HEIC import, EXIF dates. See README "真机测试清单".

## Agreed AI plan (owner reviews each step before code)

1. ~~Baby profile~~ (done)
2. ~~`packages/ai-contracts`~~ (done): request `{requestId, input:{nickname, ageText, note≤300, photoCount, pronoun?}}`; model output `{title ≤40, caption ≤300}` (soft 200 in prompt) defined once in Zod → `providerJsonSchema()` strips keywords the API rejects (exact-schema test); `interpret()` = stop_reason → JSON.parse → normalise (cosmetic only) → Zod → warnings (`possible_fabrication` terms, `long_caption`); **never truncates**, over-limit → `retryHint` for one rewrite; error codes + `isRetryable`/`classifyHttpStatus`; `fallbackCaption()` ("Mia · 3 months 12 days" + user's note); `PROMPT_VERSION='caption@3'`, examples are data (`PROMPT_EXAMPLES`) and must pass our own semantic checks (test); smoke cases must differ from examples; note wrapped in `<note>` with tag escaping. Lengths count code points (`charCount`).
3. ~~`apps/api`~~ (done, local only): Hono on Node (`pnpm --filter @lm/api dev`, 127.0.0.1:8787 by default; `HOST=0.0.0.0` opts in to LAN for physical devices). `POST /v1/captions` (header `X-Device-Id` uuid) → always 200 + `CaptionResponse` for valid requests; 400 for bad body/device id. `generateCaption()` = max 3 calls, 12 s budget, 8 s/call, min 1.5 s left to start a call, equal-jitter backoff (base 500, cap 4000), retry-after honoured or fall back if it doesn't fit, one rewrite for schema_violation/invalid_json. Anthropic SDK with **`maxRetries: 0`** (SDK default 2 would multiply retries). Quotas 30/device/day + 1000 global/day (UTC day) and requestId idempotency (per device, 5 min, in-flight dedupe) behind `QuotaStore`/`IdempotencyStore` — memory now; Durable Objects on Workers or Redis on multi-instance Node later, **not KV**. Logs: one JSON line per request, lengths only, device id hashed. `pnpm --filter @lm/api smoke` = real-API check (needs `.env`).
   - **Deploy gate (agreed): do not deploy publicly until App Attest or user sign-in exists.** `X-Device-Id` is client-generated and forgeable; it is only a rate-limit key.
   - `@lm/ai-contracts` is `"type": "module"` so tsx/Node can load it; Metro resolution of it is still unverified (step 4).
4. App integration: loading state, fallback, `TextLayer.source: 'ai-draft'` (schemaVersion 2 + migration), edit-distance metric. Send only nickname + age text + user sentence (never full name, birthday or photos).

## Next candidates (owner decides)

1. Pan/zoom a photo inside its frame (edit `crop`) — biggest missing editing feature.
2. On-device dedupe/blur/face via a Swift Expo Module using Apple Vision (feature prints, aesthetics).
3. Backup: export bundle (JSON + photos) first; data model already UUID-based for later sync.
4. Phase 2: AI Gateway (Node/Hono) — thumbnails only with consent, Zod-validated JSON output, fallback to rules, captions marked as drafts (`source: 'ai-draft'` to add to TextLayer).
