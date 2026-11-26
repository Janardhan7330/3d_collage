# Permanent phone hosting with Render

The root `render.yaml` prepares a Docker web service and PostgreSQL 17 database in Singapore. It is a deployment proposal, not an already running service. Both selected compute plans are paid: review Render's current quote and approve it before applying the blueprint. Connecting an account alone does not create these resources.

## Deploy after account and cost approval

1. Connect the Render account and select the intended workspace. Create a Blueprint from `Janardhan7330/3d_collage`, branch `main`, using `render.yaml`.
2. Review the web service, database, storage and total charges before confirming creation. The configured capacities are starting sizes, not a load-tested production capacity guarantee.
3. Wait for the database and service to become healthy. Render supplies a stable HTTPS address. `APP_ORIGIN` references that service's `RENDER_EXTERNAL_URL`, so pairing links and secure session cookies use the actual hosted address. The database accepts private network access only.
4. Open that HTTPS address on the computer, register, and create an empty campus. Generate a new pairing QR from this hosted studio, scan it on a physical phone, allow location access, record an actual landmark, finish, then review and save it on the computer. Old temporary-preview QR codes do not transfer.
5. Confirm `/api/health` reports phone connectivity available. Test denied location permission, stale GPS, interrupted upload/reconnection, and a service restart before inviting other users. Record the phone model, browser and results.

The initial deployment starts with an empty database. Local SQLite accounts and campus data do not move automatically. Agree on and verify a migration or reviewed map import before treating this as a replacement for existing local data. Do not seed an example campus.

## Release requirements still outstanding

- Configure SMTP and verify account recovery mail delivery before a public release.
- Establish database backups, retention and a tested restore procedure; verify the selected Render plan's backup provisions.
- Android builds remain disabled. A separate Android worker, persistent artifact storage and owner-managed signing identity are needed to enable them.
- Verify campus measurements and phone behavior on site. Hosting does not provide automatic indoor reconstruction or indoor positioning.
- Review monitoring, load capacity and the remaining [production release gates](production-status.md).

After the first deployment, `checksPass` allows deployments only after the linked branch's CI checks pass. Confirm that Render sees the repository's GitHub checks. If changing to a custom domain, update `APP_ORIGIN` to that exact HTTPS origin and regenerate phone pairing links.

Configuration follows Render's [Blueprint specification](https://render.com/docs/blueprint-spec) and [environment variable documentation](https://render.com/docs/environment-variables). Validate against the [official schema](https://render.com/schema/render.yaml.json) before applying changes.

Validated on 27 November 2026 against Render's official JSON Schema (draft 2020-12). The application also passed 30 automated tests, its production build and all three browser journeys. These checks do not confirm an actual Render deployment or physical-phone sensor behavior.
