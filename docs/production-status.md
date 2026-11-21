# Release status

This system is under development. It is not certified production-ready and has not been deployed. Original requirements remain in `requirements.md`.

| Area | Implemented locally | Remaining |
| --- | --- | --- |
| Accounts | Registration, login, profiles, logout, reset tokens, session revocation, hashed credentials | SMTP delivery, abuse/volume tests, email-verification policy |
| Projects | Persistent dashboard, per-project roles, isolation, team changes | Organization administration, optional logo upload and app icon branding |
| Phone mapping | Single-use QR/code, bounded capture cookie, IndexedDB queue, idempotent upload, GPS/motion/orientation, landmarks and floors | Physical-device tests; gyro/step estimation; calibrated PDR and sensor fusion; background/resume device matrix |
| Processing | Outdoor drafts, accuracy/gap filtering, loop candidates, raw retention | Indoor reconstruction, surveyed drift correction, validated automatic loop closure, large-survey processing jobs |
| Editing | Locations/aliases/categories, buildings, floors, footprints, editable connections and polylines, step-free flags | Direct manipulation canvas, richer floor plans and asset upload |
| Navigation | Shared graph routing, aliases, turns/floors, accessible routes, manual known start, printable revision-scoped QR checkpoints and offline scanning | Automatic indoor positioning, beacons, live rerouting |
| 3D | Irregular/circular footprints, floor filters, location markers, route highlighting | Large-campus/device performance validation; measured detailed assets |
| Satellite | Online Google satellite reference link at campus origin | Embedded authorized API if required; API key/provider setup |
| Publishing | Validation, explicit confirmation, immutable revisions, restore, JSON exports | On-site approval and accuracy evidence |
| Android | Offline runtime/template, per-project package ID, queue/worker and external signing configuration | Production signing identity and device install; physical airplane-mode tests (worker signed-build test passed with a throwaway key) |
| Operations | PostgreSQL, Docker/Compose, CI definition, health checks, graceful shutdown, backup/restore scripts, shared limits | Cloud/domain/TLS/mail setup, secrets, monitoring, artifact storage, load tests, full operational recovery drill (isolated database backup/restore passed) |

The source master specification was truncated during section 15. Reconcile missing text before claiming complete coverage.

No measurement is automatically promoted to a verified room coordinate. The fictional example remains unconfirmed. A build cannot silently succeed when no worker is configured.
