# Running and deploying

## Local

Use Node 24+. Run `npm ci`, copy `.env.example` to `.env`, then `npm run dev`. Open `http://localhost:5173`. Local SQLite persists in `data/campus.sqlite`; no accounts are pre-seeded.

For a built preview: `npm run build`, then `APP_ORIGIN=http://localhost:3001 npm start`. API and frontend must use the same origin. The SQLite experimental warning is expected locally; production startup rejects SQLite.

A phone needs a reachable HTTPS origin. Set `APP_ORIGIN` accordingly; localhost on a phone refers to the phone itself. Keep capture foregrounded. Pairing expires after 10 minutes, is single-use, and authorizes up to 24 hours of capture unless ended.

## Production

1. Choose a cloud account, region, domain and budget. These have not been supplied.
2. Provision private PostgreSQL with provider-appropriate TLS. Store `DATABASE_URL` in a secret manager.
3. Put the API behind TLS. Set `NODE_ENV=production`, `HOST=0.0.0.0`, HTTPS `APP_ORIGIN` and the exact trusted proxy hop count. Never expose an API trusting proxy headers directly to the internet.
4. Configure `SMTP_URL`, `MAIL_FROM`, sender domain and quotas; test recovery delivery. Without SMTP the recovery endpoint explicitly reports unavailable.
5. Mount private artifact storage read-only in the API, writable in the isolated worker. Monitor HTTP/database errors, build failures, disk space and queue latency.
6. Back up the database, APK artifacts and signing keys to encrypted restricted storage. Define retention and verify a recovery drill before release.
7. Enable `APK_BUILDS_ENABLED=true` only when a worker has passed a signed-build/install test.

The non-root `Dockerfile` builds the API. `compose.yaml` supplies PostgreSQL and a localhost-bound API for a TLS proxy. It does not provision certificates, a domain, email or an Android worker. Set `POSTGRES_PASSWORD` and HTTPS `APP_ORIGIN`. URI-encode reserved characters in credentials when constructing a database URL.

## Android worker

Use JDK 17, Gradle 8.11.1, Android platform 35 and build tools 35.0.0. Run `npm run build`, supply the worker settings in `.env.example`, then `npm run worker`.

Provision and securely back up your release keystore. Preserve the same key for updates. Never commit keys or passwords. Signing identity is configured per worker; per-college key custody is outstanding. Workers need Google/Maven/Gradle access, PostgreSQL and artifact storage, not the email credentials. Set `WORKER_GRADLE_CACHE` to a private persistent cache. Jobs time out after 15 minutes; running jobs stale for 20 minutes are marked failed. User-visible errors are sanitized; raw Gradle output is not exposed.

For debug verification, run `node --import tsx scripts/prepare-android.ts --demo` then `gradle -p android assembleDebug lintDebug`. The fictional demonstration is visibly labelled. To package a real campus, pass a repository-relative path to its published JSON export instead of `--demo`. Debug compilation is not release-signing or device-install verification.

## Backup and restore

Configure libpq `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, and protected `PGPASSFILE` (or `PGPASSWORD`). Run `sh scripts/backup.sh /secure/path/campus.dump`. Archive-list validation checks the file format, not full recovery.

Create a new empty database and set `RESTORE_DATABASE`. Run `sh scripts/restore.sh /secure/path/campus.dump`. Restore is atomic and refuses to overwrite existing objects. Check accounts, projects, revisions, exports and artifact links before redirecting traffic. Backups contain account/campus data and must remain private.

## Verification

- `npm run check`: TypeScript, API/routing/processing tests, frontend/server bundles.
- `TEST_DATABASE_URL=postgresql://... npm test`: dedicated PostgreSQL integration database. Never use a production database.
- `npx playwright install chromium` then `npm run test:e2e`: project/publish, phone capture and offline navigation journeys.
- `PLAYWRIGHT_CHROME_PATH` optionally selects an existing local Chrome binary.
- CI covers PostgreSQL, Chromium, Android compile and lint. Review the latest GitHub Actions run for remote verification.

## Physical acceptance

Use a surveyed campus with a circular block, multiple entrances and at least two floors. Check measured distances, room access points, return journeys, stairs/lifts and step-free alternatives. Test permission denial, network loss/recovery, terminated browsers, expired pairing and low storage on supported devices. Install a signed APK and cold-start in airplane mode. Agree accuracy targets and supported devices with the college; neither has been supplied yet.

## GitHub delivery

The repository contains automatic application/Android checks and a manual **Build campus APK** workflow. In GitHub, open Actions, select the APK workflow and choose Run workflow. Supply your published campus JSON path within the checkout. The field is required; missing campus data never silently selects a fictional campus. Download the resulting APK from the run’s artifacts.

Release builds require repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Keep ownership and backups of your signing key. This repository is public: never commit private campus maps, student information, passwords or keys.

GitHub stores source and runs checks/builds. GitHub Pages cannot host this application’s persistent API, PostgreSQL database or Android worker. A separate server deployment is still required for live phone capture and shared accounts.

## Installed Android verification

The Android CI job boots an Android 15 emulator, installs the fictional debug APK, disables Wi-Fi/mobile data and enables airplane mode before launching it. It checks local 3D assets, destination search, ordinary and step-free routes, campus checkpoint validation, native camera denial with manual-entry fallback, and another process cold start. The run uploads its report and route screenshot as `android-device-evidence`; failures include device logs.

To repeat on a disposable emulator, build the demo APK and run:

```sh
ANDROID_HOME=/path/to/android-sdk ANDROID_SERIAL=emulator-5554 \
  node --import tsx scripts/verify-android.ts android/app/build/outputs/apk/debug/app-debug.apk
```

This script deliberately refuses physical-device serials. It installs the demo and changes emulator radio settings, restoring the previous settings when it exits. It needs Android build tools 35.0.0 and a debug WebView. It does not establish physical camera reliability or campus accuracy.
