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

Open [Campus Studio](http://localhost:5173), register an account, and create your first campus. Local data persists in `data/campus.sqlite`; no accounts or passwords are pre-seeded. Every new campus starts empty. Add your actual locations and paths; the studio does not insert example geometry.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

## Map with your phone

`localhost` cannot connect a different phone. Run `npm run phone` to create a temporary HTTPS connection using the system SSH client and localhost.run. The launcher verifies the provider’s host key and does not read or change your SSH credentials. An optional Cloudflare alternative is available with `PHONE_TUNNEL=cloudflare CLOUDFLARED_BIN=/path/to/cloudflared npm run phone`.

Open the HTTPS link printed by that command **on your computer**, sign in, create your campus, and choose **Map my campus with my phone**. Generate a fresh QR, scan it with your phone’s camera, open it in Safari/Chrome, and allow location access. Start at your real entrance and save your own location names. Finish the walk, then review/import the measurements in the studio and save the map.

Keep the computer, command and phone page running during capture. The temporary URL is publicly reachable, with project access protected by sign-in and single-use pairing; it changes each time and stops when the command stops. It is for testing, not permanent hosting. Indoor coordinates still need manual review.

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
