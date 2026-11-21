# 3d_College

A campus mapping studio with mobile browser capture, an editable 3D campus graph, reviewed map revisions, and an offline Android navigation template.

**Status: tested local implementation with GitHub workflows, not a completed production deployment.** See [release status](docs/production-status.md) for remaining requirements and release gates.

## Run locally

Requires Node 24+.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open [Campus Studio](http://localhost:5173), register an account, and create your first campus. Local data persists in `data/campus.sqlite`; no accounts or passwords are pre-seeded. The circular campus example is fictional and unverified.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

## Project structure

- `src/client`: responsive builder, phone capture and offline navigator.
- `src/shared`: map schema, validation, routing and outdoor walk processing.
- `src/server`: authenticated API, SQLite/PostgreSQL adapter and APK worker.
- `android`: fixed offline application template.
- `tests`: routing, processing, security, persistence and browser journeys.
- `scripts`: private database backup and atomic restore helpers.

## Documentation

- [Verification evidence](docs/verification.md)
- [Architecture](docs/architecture.md)
- [Deployment and verification](docs/deployment.md)
- [Production status and remaining work](docs/production-status.md)
- [Original requirements tracker](docs/requirements.md)
The imported conversation is kept locally and excluded from the public repository.

Repository supplied by the owner: [Janardhan7330/3d_collage](https://github.com/Janardhan7330/3d_collage).

Phone mapping needs a reachable HTTPS deployment; localhost QR links work only on this computer. Release APK generation requires an Android worker and operator-managed signing credentials. Core navigation uses a user-confirmed starting point; automatic indoor positioning remains unimplemented.
