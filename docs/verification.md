# Verification evidence

Verified locally on 2026-11-21 using Node 24, PostgreSQL 17, Chrome, Java 17, Gradle 8.11.1 and Android API 35.

| Check | Result |
| --- | --- |
| TypeScript and frontend/server/offline production bundles | Passed |
| Unit and API tests using SQLite | 27 passed |
| Same tests using isolated PostgreSQL | 27 passed |
| Browser journeys | 3 passed: project/publish; phone capture with offline queue recovery; offline navigation and checkpoints |
| Android debug compilation and lint | Passed; no lint errors |
| Installed Android 15 emulator, offline operation | Six checks passed: install, offline cold start/3D, search/routing, checkpoint validation, camera denial fallback, second cold start |
| Queued worker → signed release APK → signature verification | Passed with a disposable test key; key deleted afterward |
| PostgreSQL backup and restore into a separate empty database | Passed; restored project data checked |

The demonstration APK contains fictional campus geometry and is labelled accordingly. It is not a surveyed campus or a production signing identity. Local evidence logs and generated artifacts stay outside the public repository. GitHub Actions supplies an independent check on source changes. The [Android emulator and application run](https://github.com/Janardhan7330/3d_collage/actions/runs/44923212698) passed on 2026-11-21 at commit `9ed9e987acb75e543d451e95e9a06aaca7b1c59b`; its `android-device-evidence` artifact contains the six-check report and screenshot (14-day retention).

## Reproduce

Run `npm run check`, `TEST_DATABASE_URL=postgresql://… npm test` against a disposable database, and `npm run test:e2e`. Browser tests need Playwright Chromium or `PLAYWRIGHT_CHROME_PATH`.

For Android run `npm run build`, `node --import tsx scripts/prepare-android.ts --demo`, then `gradle -p android assembleDebug lintDebug` with the Android SDK and Java 17 configured. `scripts/verify-worker.ts` exercises the release worker using an isolated job and disposable signing key; inspect its required environment settings before running.

See [installed Android verification](deployment.md#installed-android-verification) to repeat the emulator test.

## Not yet verified

Physical Android installation, camera scans on supported phones, physical-device cold starts in airplane mode, surveyed indoor accuracy, large-campus performance, production mail delivery, production hosting and signing identity. Automatic indoor sensor positioning is not implemented. See [release status](production-status.md) for the full remaining scope.
