# Requirements tracker

Extracted from the available reference conversation on 2026-11-20. The table records the original scope. See production-status.md for implemented coverage and verification.md for test evidence. This is a working index; the source transcript preserves more detail. Missing source text must be reconciled before claiming complete coverage.

| ID | Requirement | Acceptance evidence needed |
| --- | --- | --- |
| R01 | Universal platform supporting multiple colleges and projects | Independent college projects coexist without data leakage |
| R02 | Registration, login, recovery, profiles, secure sessions and logout | Account lifecycle and session security checks |
| R03 | Dashboard with saved projects, mapping sessions, APK history and builds | Resume existing work and create a new project without losing data |
| R04 | College name, location, optional logo, project name and campus details | Persistent project creation and editing |
| R05 | QR or connection-code pairing to a mobile browser without installing a mapping app | Scoped secure authorization, expiry and interrupted-session recovery |
| R06 | Walking capture: outdoor GPS, orientation, acceleration, gyroscope, steps, distance, turns, timestamps and accuracy where supported | Device trials with permissions denied and unavailable sensors |
| R07 | Separate gate, building entrance and other start landmarks | Distinct named nodes and user-confirmed starting position |
| R08 | Straight, curved, circular and irregular routes, closed loops and connected routes | Circular block field trial, loop closure and correction of accumulated error |
| R09 | Add locations while walking with required name and optional searchable nickname | Create, rename, reposition and delete locations; search aliases |
| R10 | Locations linked to project, building, floor, category and access points | Correct room entrances and custom categories; gates, blocks, departments, classrooms, labs, offices, counters, canteens, hostels, shops, stairs, lifts and corridors |
| R11 | Multi-floor stairs, landings, ascent/descent, lifts and building transitions | Explicit floor confirmation and correct cross-floor connections |
| R12 | Accessible routes and avoiding stairs where alternatives exist | Valid alternative route or explicit no-route result |
| R13 | Optional authorized Google Maps satellite reference | Outdoor alignment reference with attribution and licensing review; no assumption of indoor detail or offline redistribution |
| R14 | Processing engine: sensor fusion, pedestrian dead reckoning where feasible, segmentation, landmarks, loop detection and error correction | Recorded datasets and on-site accuracy evaluation; uncertainty retained |
| R15 | Editable navigation graph with distance, floor, accessibility and connection types | Connectivity validation and correction without invented coordinates |
| R16 | Editable 3D campus with irregular buildings, roads, entrances, rooms, corridors, stairs and lifts | Floor selection, hidden upper floors, graph/model consistency and explicit simplified-geometry labels |
| R17 | Finish, save, process, inspect, correct, validate and confirm readiness before APK build | Incomplete or disconnected map cannot be silently accepted as verified |
| R18 | Automated reusable Android template with per-college name, branding, map, assets, locations, search and graph | Installable college-specific APK from a verified map revision |
| R19 | Secure build queue, package IDs, versions, signing, logs, failures, artifacts and rebuild history | Isolated build execution and protected signing credentials |
| R20 | Offline local map, building/floor/room database, aliases, graph, 3D assets, search and routing | Airplane-mode tests after installation/data provisioning |
| R21 | Turn-by-turn guidance, distances, floor/stair instructions, route display and optional voice | Verified directions generated from actual graph geometry |
| R22 | Automatic indoor positioning objective, uncertainty reporting and reliable-position recalculation | Device and field evaluation; manual-start/checkpoint mode when accuracy is insufficient |
| R23 | Mapping-session QR distinct from optional navigation-location checkpoints | Separate data models, authorization and user flows |
| R24 | College isolation and roles: platform admin, owner, mapper, editor/reviewer and visitor | Server-side authorization tests; navigation users cannot edit maps |
| R25 | Versioned maps, recoverable revisions, assets, validations and audit records | Restore prior revision and trace build to immutable map version |
| R26 | Clean responsive accessible UX; final visual design controlled by user | Understandable mapping/build flows; UI separated from navigation logic |
| R27 | GitHub, deployment configuration, secrets, logging, monitoring, backups and recovery | Environment-specific deployment and tested restore procedure |

## Data entities preserved from the source

Users, colleges/organizations, memberships, projects, campus boundaries, buildings, floors, rooms/locations, aliases, entrances, staircases, elevators, mapping sessions, raw sensor samples, walking segments, landmarks, navigation nodes and edges, map revisions, validation results, 3D assets, build jobs, generated APK versions, and audit logs. Every college-specific record must be scoped to its college/project.

## Pending inputs

- Remaining master specification after the truncated section 15, and any omitted earlier conversation or attachments.
- User's preferred architecture and any additional specifications.
- GitHub repository and cloud requirements, budget, and deployment ownership.
- Target Android devices/browser versions and a real campus test dataset or floor plan.
- Accuracy and completion criteria to agree before field validation.

The source's suggested React/Next.js, Three.js, Node.js, PostgreSQL/PostGIS, object storage, and Kotlin/Flutter are candidates, not selected technologies.
