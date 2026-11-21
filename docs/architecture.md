# Implementation architecture

The builder uses React/TypeScript, a Node 24/Express API, and Three.js loaded on demand. Map validation, Dijkstra routing, outdoor processing and JSON contracts live in `src/shared`; the offline runtime uses the same graph code.

PostgreSQL is required in production. SQLite is a local development adapter. Parameterized SQL, transactions, shared database-backed rate counters, and optimistic map versions work across both engines. Drafts and immutable revisions store graph and building geometry together as validated JSON to keep them consistent.

Accounts use salted scrypt password hashes. Session and pairing tokens are stored as SHA-256 hashes. Credentials use HttpOnly, SameSite=Strict cookies; production requires HTTPS. Every write checks the configured origin and JSON content type. Membership is checked on every project operation, including exports and APK downloads. Roles are owner, editor, mapper and reviewer. A paired phone gets capture permission only. Uploads and completion must match the paired session ID; reconnecting rotates device credentials without changing the session.

Phone measurements enter IndexedDB before upload; batches are idempotent. Observations stay separate from reviewed geometry. Outdoor drafting filters poor GPS, preserves gaps, and proposes loop closures without snapping positions. Indoor room/floor positions require confirmation. Motion and orientation are retained; sensor fusion and pedestrian dead reckoning are not implemented or validated.

The Android template packages the offline React/Three.js bundle and an immutable campus JSON revision. A Java activity uses WebViewAssetLoader, disables file/content access, blocks external requests, and has no INTERNET permission. Search, aliases, routing, floor selection and 3D use bundled data. Printable checkpoint QR codes identify a project, published revision and verified node. Offline scanning uses bundled ZXing and optional camera permission; users confirm their physical location before setting the route start. Native Android sensor positioning is outstanding.

The worker atomically claims a job, validates its revision, copies a fixed template into a temporary workspace, invokes Gradle without a shell, and signs using operator-provided credentials. Package IDs derive from project UUIDs. Uploaded build scripts are never executed. Isolate workers and keep signing credentials out of the API process.

## Boundaries

- Projects are the college access boundary. Organization-wide administration and a platform admin console are outstanding.
- Coordinates are metres east/north of the campus origin. Heights derive from entered floors and floor height; simplified shapes are labelled.
- Satellite reference opens a documented Google Maps URL. Imagery is not copied, automatically traced, or packaged offline. Embedded Maps API integration is outstanding.
- Artifacts use private filesystem storage. Multi-host production needs a private shared volume or object-storage adapter.
- Schema initialization is idempotent. Future changes need numbered transactional migrations before upgrading deployed databases.
- Generated APKs are direct-install applications. Play Store distribution is not configured.

## Primary references checked

- [Node SQLite API](https://nodejs.org/api/sqlite.html)
- [Vite](https://vite.dev/guide/)
- [Three.js](https://threejs.org/docs/)
- [Android local assets](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
- [AGP 8.9 compatibility](https://developer.android.com/build/releases/agp-8-9-0-release-notes)
- [Google Maps URL parameters](https://developers.google.com/maps/documentation/urls/get-started)

These explain implementation choices, not physical-device accuracy or deployment verification.
