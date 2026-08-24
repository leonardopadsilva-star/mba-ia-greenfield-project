# phase-03-videos — Progress

**Status:** in_progress
**SIs:** 3/11 completed

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
- **Status:** pending
- **Tests:** no tests
- **Observations:** none

### SI-03.5 — POST /videos (Initiate Multipart Upload)
- **Status:** pending
- **Tests:** no tests
- **Observations:** none

### SI-03.6 — POST /videos/:publicId/complete
- **Status:** pending
- **Tests:** no tests
- **Observations:** none

### SI-03.7 — DELETE /videos/:publicId (Abort Upload)
- **Status:** pending
- **Tests:** no tests
- **Observations:** none

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
