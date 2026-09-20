# App Review reviewer dataset runbook

This dataset is an explicitly invoked fixture for App Store review. It is never
seeded by the request path and does not create credentials, sessions, OTPs, or
email verification.

## Prerequisite

Create `REVIEWER_EMAIL` through the normal shipped email OTP flow, and complete
email verification normally. The seed command only looks up that existing,
active, verified account; it will not create or verify it.

Required environment names (values are intentionally not documented here):
`DATABASE_URL`, `PRIVATE_OBJECT_DIR`, `REVIEWER_EMAIL`,
`REVIEWER_DATASET_TARGET` (exactly `staging`) and
`REVIEWER_DATASET_CONFIRM`. Production execution is always refused: fictional
fixtures must never appear as activity for normal members. Never place these
values in source control. The reviewer
must already have exactly one founder profile from normal onboarding; the
dataset reuses that profile and never creates, changes, or deletes it.

## Safe execution

Use staging first:

```sh
REVIEWER_DATASET_TARGET=staging REVIEWER_DATASET_CONFIRM=seed pnpm --dir artifacts/api-server reviewer:dry-run
REVIEWER_DATASET_TARGET=staging REVIEWER_DATASET_CONFIRM=seed pnpm --dir artifacts/api-server reviewer:seed
```

Review the output manifest and verify the feed, profiles, follows, reactions,
reshüüt, comments, and mention notification. Do not point this command at
production. App Review production access must use the real OTP account and
reviewer-created activity, not fictional seeded activity.

## Provenance and safety

Audio is generated locally at execution time as one-second 440 Hz sine tones,
encoded as Ogg/Opus. It contains no speech, external voice, or third-party
recording and is self-generated/CC0-equivalent. Objects use private
`/objects/uploads/<UUID>` paths and are never public URLs. Text and handles are
clearly fictional and neutral. The fixture namespace is
`reviewer-fixture-v1`.

## Idempotency and teardown

Reserved handles and transcript namespace markers make reruns converge rather
than create duplicate fixtures. Audio paths are random UUIDs created only for
missing posts; reruns reuse marker-owned paths rather than overwrite arbitrary
objects. Teardown is
explicit:

```sh
REVIEWER_DATASET_TARGET=staging REVIEWER_DATASET_CONFIRM=seed pnpm --dir artifacts/api-server reviewer:teardown
```

It requires the same verified `REVIEWER_EMAIL`, takes a write-blocking lock
over all fixture tables, revalidates every exact owned row, and refuses cleanup
if any external interaction is present. It then removes only the four exact
marker-owned posts, their two exact comments, owned relationships and
notifications, the three reserved fictional profiles, and the private audio
objects referenced by those posts. It never deletes the reviewer
founder/account or unrelated member data.

## Verification

Check the command manifest, then verify the reviewer account is still active
and verified, four `reviewer-fixture-v1` posts exist, and fixture-only
relationships appear in the feed. Confirm audio playback uses authorized
private object access. After teardown, query handles beginning with
`reviewer-fixture-` and transcripts containing `[reviewer-fixture-v1]`; both
should return zero rows. Keep database and object-storage audit records with
the review evidence.