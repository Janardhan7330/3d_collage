# Proposed delivery outline

This is an initial sequencing proposal, not an approved technical architecture or a claim of implementation. Preserve all requirements through every phase.

1. Reconcile the remaining specification and user architecture. Inspect the supplied repository/cloud constraints, choose the stack, define campus coordinates, versioned map contracts, permissions and acceptance criteria.
2. Build account and project persistence with tenant isolation, recovery and an understandable dashboard. Verify access controls before connecting mapping clients.
3. Implement secure mobile pairing, permission-aware capture, named landmarks, floor transitions, durable progress and resumable upload. Test on actual phones.
4. Build graph editing, route validation, circular corridors, loop correction and accessible routing. Retain raw measurements and uncertainty for review.
5. Add synchronized 3D visualization with floor controls and measured or explicitly simplified geometry. Integrate optional satellite reference after checking API terms.
6. Implement the offline Android runtime: packaged map data, nickname search, route calculation, directions and 3D rendering. Verify manual-start/checkpoint navigation offline; evaluate sensor-assisted positioning separately against measured accuracy targets.
7. Implement isolated APK workers, signing, artifact downloads, revision-based rebuilds and clear build failures. Verify a generated application on a physical Android device.
8. Complete a campus field trial, security and accessibility checks, backup restoration and deployment. Compare every requirement against evidence; retain unresolved items explicitly.

## Engineering boundaries

- Captured motion does not itself establish verified room geometry. Map review and correction are part of the product.
- Pairing grants only the intended session scope; map ownership and tenant authorization remain server responsibilities.
- APK builds consume validated immutable map revisions so the graph, search data and 3D display describe the same campus version.
- Core offline navigation must not depend on live builder APIs or satellite tiles.
- Automatic room-level positioning remains a requirement to investigate; do not report it as solved by a manual-start fallback.
- Technical capability and licensing claims require primary-source verification during architecture work and physical-device validation during implementation.
