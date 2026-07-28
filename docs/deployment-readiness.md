# Deployment readiness

Dione treats publisher roots, catalog signatures, and Supabase access controls as
release inputs. A repository build can run offline, but a production release is
blocked until the deployed services attest successfully.

## Security contract

- Remote installs default to disabled. A build enables them only when
  `VITE_PUBLIC_REMOTE_INSTALLS_ENABLED=true` is compiled into the main process.
- Enabled builds require an HTTPS `VITE_PUBLIC_DIONE_CATALOG_URL` and a non-empty
  `DIONE_PUBLISHER_TRUST_STORE`. The trust store contains only public
  Ed25519 keys and is intentionally bundled in the application.
- Every catalog row must pin the current version to a 40-character commit, carry
  a manifest SHA-256, name a trusted publisher key, and have a valid Ed25519
  signature over Dione's `dione-manifest-v1` metadata envelope. The runtime also
  downloads from that immutable commit and verifies the manifest bytes.
- The packaged Supabase credential must be either an `sb_publishable_` key or a
  legacy JWT whose role is exactly `anon`. Secret/service-role credentials are
  rejected before packaging.
- Anonymous database access is limited to `scripts: SELECT`, `reports: INSERT`,
  and `shared_urls: SELECT, INSERT`. Other public relations and functions are not
  reachable by anonymous or authenticated client roles.

## First deployment or policy update

1. Review and apply
   `supabase/migrations/20260728000000_dione_least_privilege.sql` through the
   normal Supabase migration mechanism. Apply it as every role that creates public
   objects (normally the migration owner); PostgreSQL default privileges belong
   to the object-creating role. Re-run live attestation after another creator adds
   a relation or function.
2. Confirm existing integrations do not depend on `authenticated` access. This
   application has no login flow; the migration deliberately revokes that role.
3. Create or rotate publisher Ed25519 keys outside this repository. Keep private
   keys in the catalog publisher/signing system. Construct the trust-store JSON
   from public PEM keys only.
4. Backfill every remotely installable catalog row with `manifest_sha256`,
   `publisher_key_id`, `publisher_signature`, and the immutable commit for its
   current version. The public catalog endpoint must also implement
   `?attestation=1` cursor pages containing an immutable `snapshot_id`, exact
   `total`, unique stable record IDs, `records`, and `next_cursor`. Every page in
   one traversal must remain on the same frozen snapshot. Do not enable remote
   installs with an empty catalog or an array-only/list endpoint.
5. Configure these GitHub Actions **repository variables** (they are public build
   inputs, not signing secrets):

   | Variable | Required value |
   | --- | --- |
   | `REMOTE_INSTALLS_ENABLED` | exactly `true` or `false` |
   | `DIONE_CATALOG_URL` | HTTPS catalog list endpoint; required when enabled |
   | `DIONE_PUBLISHER_TRUST_STORE` | JSON map of key IDs to public Ed25519 PEM; required when enabled |
   | `SUPABASE_URL` | HTTPS project URL |
   | `SUPABASE_ANON_KEY` | publishable key or legacy `anon` JWT |

6. Run `npm run attest-deployment` with the same environment used by the release.
   Only then dispatch the Build and Release workflow.

## Offline repository checks

`npm run check-deployment-readiness` verifies that the runtime gates, migration,
release workflow, and this runbook remain version controlled. It makes no network
requests and does **not** claim that a migration was applied or that catalog data
is currently signed.

`npm run test-deployment-readiness` uses ephemeral fixture keys to test key-role
classification and valid/tampered catalog signatures. It requires no credentials
and never prints configured values.

## Live production attestation

`npm run attest-deployment` is intentionally fail-closed. It performs the offline
checks and then:

1. proves the configured Supabase key is anonymous/publishable;
2. calls `dione_deployment_attestation` as that key and requires contract v1 with
   no RLS, policy, relation-grant, or function-grant violations; and
3. when remote installs are enabled, paginates the deployed catalog and verifies
   every metadata signature against the exact trust store being bundled.

HTTP error bodies and key values are not logged. A network outage, missing RPC,
unapplied migration, unavailable catalog, malformed row, unknown publisher, or
invalid signature fails release rather than degrading to an offline-only claim.

## Rotation and rollback

Add a new public key before publishing records signed by it. Keep the old public
key until all supported catalog records and installed trust receipts have moved
off it. Run live attestation, release the rotated build, and remove the old key in
a later release. To respond to compromise, disable remote installs and release a
build with `REMOTE_INSTALLS_ENABLED=false`; signature verification remains
fail-closed for already downloaded remote manifests.
