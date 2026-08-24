# phase-03-videos — Progress

**Status:** in_progress
**SIs:** 7/11 completed

### SI-03.1 — Dependencies, Config Namespaces, and Docker Compose
- **Status:** completed
- **Tests:** no tests (Infra)
- **Observations:**
  - Adding the new required Joi fields (STORAGE_*, RABBITMQ_URL) broke the pre-existing `env.validation.integration-spec.ts` fixture (`requiredEnv` didn't include them); fixed by extending the fixture — direct consequence of this SI's schema change, not out of scope.
  - Live dev-server boot smoke test via `npm run start:dev` was inconclusive in this environment (Windows Docker bind-mount I/O made the watch-mode webpack build too slow to confirm within a reasonable wait); verified instead via `npx tsc --noEmit` (clean) + the env-validation integration test (passing) + MinIO/RabbitMQ healthchecks + host-reachability curls (both 200).

### SI-03.2 — Video Entity and Migration
- **Status:** completed
- **Tests:** 6 passing
- **Observations:**
  - Extended the shared `cleanAllTables` helper (`src/test/create-test-data-source.ts`) with `DELETE FROM "videos"` (before `channels`, respecting the FK) — every integration test that calls it now truncates the videos table too; safe since the table already exists physically in the shared DB via the real migration run, and TypeORM `synchronize: true` never drops tables absent from a given DataSource's entity list.
  - `size_bytes` maps to TS `string | null` (bigint columns are returned as strings by node-postgres/TypeORM to avoid unsafe-integer precision loss) — intentional, not a typo.

### SI-03.3 — StorageService (Presigned Multipart Upload and Presigned GET)
- **Status:** completed
- **Tests:** 5 passing
- **Observations:**
  - Integration test ensures the `videos` MinIO bucket exists in `beforeAll` (`CreateBucketCommand`, tolerating `BucketAlreadyOwnedByYou`) rather than baking bucket provisioning into `StorageService` itself — keeps the service focused on the multipart/presign contract; bucket lifecycle is a deploy/infra concern.
  - Used native `fetch` (Node 22) to exercise the presigned URLs end-to-end (PUT a part, GET with Range) rather than mocking the HTTP layer, per the project's real-capture-service testing convention.

### SI-03.4 — Queue Producer (RabbitMQ)
- **Status:** completed
- **Tests:** 3 passing
- **Observations:**
  - `ClientProxy#emit()` is a "hot" Observable that in practice only reliably publishes once subscribed (NestJS GitHub issue #2651/#625) — wrapped it in `lastValueFrom()` so the producer both triggers delivery and surfaces broker errors as a rejected promise, instead of a silent fire-and-forget call.
  - First test run failed all 3 tests with "Nest can't resolve dependencies... dependency at index [0] appears to be undefined" — root cause was a circular import: `queue.module.ts` imported `VideoProcessingProducer` while `video-processing.producer.ts` imported the `VIDEO_PROCESSING_SERVICE` token back from `queue.module.ts`, so the `@Inject()` decorator saw `undefined` at module-evaluation time. Fixed by extracting the token into `queue.constants.ts` per the project's constants convention — not just a test-setup issue, this would have broken the real app too.

### SI-03.5 — POST /videos (Initiate Multipart Upload)
- **Status:** completed
- **Tests:** 15 passing (7 channels unit incl. 2 new + 4 videos unit + 1 videos integration + 3 videos e2e)
- **Observations:**
  - `ChannelsService` had no way to resolve a channel from a `userId` (only `createChannel`); added `findByUserId(userId)` reusing the existing single `dataSource` dependency (`dataSource.getRepository(Channel).findOne(...)`) instead of injecting a new `Repository<Channel>` — avoids changing the constructor signature and breaking the 5 existing unit tests that call `new ChannelsService(mockDataSource)` with one argument.
  - `Video.public_id` is `varchar(12)`, so `nanoid()` must be called with an explicit size (`nanoid(12)`) — the package default is 21 chars and would overflow the column.
  - The video's internal `id` (uuid) is generated client-side via `randomUUID()` *before* insert, because the storage key (`videos/{channelId}/{videoId}/original.<ext>`) needs the id before the row exists; passed explicitly to `repository.create({ id, ... })`, which TypeORM accepts (overrides the column's `DEFAULT uuid_generate_v4()`).
  - First test run failed all 3 non-channels suites with `SyntaxError: Cannot use import statement outside a module` from `node_modules/nanoid/index.js` — `nanoid@5` is pure ESM and Jest's default `transformIgnorePatterns` skips `node_modules`, so `require()` inside Jest's sandbox couldn't load it (unlike plain `node -e "require('nanoid')"`, which works because Node 22+/25 has native synchronous ESM-interop for `require()` that Jest's own module loader doesn't use). Fixed by adding `"transformIgnorePatterns": ["/node_modules/(?!(nanoid)/)"]` to both the `jest` block in `package.json` and `test/jest-e2e.json`, letting ts-jest transpile nanoid's ESM to CJS.

### SI-03.6 — POST /videos/:publicId/complete
- **Status:** completed
- **Tests:** 18 passing (9 videos.service unit incl. 5 new completeUpload cases + 2 videos integration incl. 1 new + 7 videos e2e incl. 4 new)
- **Observations:**
  - Plan's API Contracts specifies `Response 200` for this endpoint, but NestJS defaults `@Post()` to 201 — added explicit `@HttpCode(HttpStatus.OK)`, matching the same pattern already used by `AuthController.login`.
  - `VideosService`'s constructor grew a third dependency (`VideoProcessingProducer`); updated all existing test instantiations (unit `new VideosService(...)` calls, integration `Test.createTestingModule` providers) rather than letting them silently pass `undefined` for the new param.
  - The e2e suite now exercises the real RabbitMQ producer end-to-end (no mock) since `AppModule` → `VideosModule` → `QueueModule` connects to the actual broker; the integration test instead mocks `VideoProcessingProducer` since its purpose is the DB/storage contract, not queue delivery (already covered by the unit test's "emits exactly one processing job" case and by SI-03.4's own producer tests).

### SI-03.7 — DELETE /videos/:publicId (Abort Upload)
- **Status:** completed
- **Tests:** 24 passing (13 videos.service unit incl. 4 new abortUpload cases + 11 videos e2e incl. 4 new DELETE cases)
- **Observations:**
  - First e2e run had 2 failures (403 test got 401; 409 test crashed on `initiated.parts[0]` being undefined) — root cause was throttler-storage leakage: `videos.e2e-spec.ts` never cleared `ThrottlerStorage` between tests (unlike `auth.e2e-spec.ts`, which does), so by the 10th+ auth round-trip across the growing suite the per-IP 10 req/min cap on `/auth/*` silently 429'd `register`/`login`, leaving `access_token` (and therefore `initiated`) undefined. Fixed by adding the same `throttlerStorage.storage.clear()` in `beforeEach` that `auth.e2e-spec.ts` already uses — documented as a known gotcha in `.claude/rules/auth-jwt.md`, which I should have applied from the start.

### SI-03.8 — Video Worker (FFmpeg Processing)
- **Status:** pending
- **Tests:** no tests
- **Observations:** none

### SI-03.9 — GET /videos/:publicId (Status and Metadata)
- **Status:** pending
- **Tests:** no tests
- **Observations:** none

### SI-03.10 — GET /videos/:publicId/stream and /download
- **Status:** pending
- **Tests:** no tests
- **Observations:** none

### SI-03.11 — End-to-End Upload-to-Playback Flow
- **Status:** pending
- **Tests:** no tests
- **Observations:** none
