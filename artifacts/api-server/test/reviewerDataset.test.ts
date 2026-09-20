import test from "node:test";
import assert from "node:assert/strict";
import {
  datasetManifest,
  gateReviewerDataset,
  requestedMode,
  auditIsSafe,
  mapFixtureIds,
  mapExpectedPostIds,
} from "../src/lib/reviewerDataset";

test("manifest is stable and distinguishes the reviewer from three fixtures", () => {
  const first = datasetManifest();
  assert.deepEqual(datasetManifest(), first);
  assert.equal(first.fixtureHandles.length, 3);
  assert.match(first.reviewer, /existing verified/);
  assert.equal(first.namespace, "reviewer-fixture-v1");
});

test("dataset requires explicit confirmation", () => {
  assert.throws(() => gateReviewerDataset({ NODE_ENV: "staging", REVIEWER_DATASET_TARGET: "staging" }, "seed"), /REVIEWER_DATASET_CONFIRM/);
  assert.doesNotThrow(() => gateReviewerDataset({ NODE_ENV: "staging", REVIEWER_DATASET_TARGET: "staging", REVIEWER_DATASET_CONFIRM: "seed" }, "dry-run"));
});

test("production fixtures are always prohibited", () => {
  const env = { NODE_ENV: "production", REVIEWER_DATASET_TARGET: "staging", REVIEWER_DATASET_CONFIRM: "seed" };
  assert.throws(() => gateReviewerDataset(env, "seed"), /prohibited in production/);
  assert.throws(() => gateReviewerDataset({ ...env, REVIEWER_DATASET_TARGET: "production" }, "seed"), /TARGET/);
  assert.throws(() => gateReviewerDataset({ REVIEWER_DATASET_CONFIRM: "seed" }, "seed"), /TARGET/);
});

test("mode flags are explicit", () => {
  assert.equal(requestedMode([]), "seed");
  assert.equal(requestedMode(["--dry-run"]), "dry-run");
  assert.equal(requestedMode(["--teardown"]), "teardown");
});

test("ownership audit refuses every external interaction category", () => {
  const safe = { externalComments: 0, externalReactions: 0, externalReshuuts: 0, externalFollows: 0, externalMentions: 0, externalNotifications: 0, extraPosts: 0, changedProfiles: 0 };
  assert.equal(auditIsSafe(safe), true);
  for (const key of Object.keys(safe) as (keyof typeof safe)[]) {
    assert.equal(auditIsSafe({ ...safe, [key]: 1 }), false, key);
  }
});

test("ownership mappings do not depend on database row order", () => {
  const fixtures = mapFixtureIds([
    { handle: "reviewer-fixture-meadow", id: 30 },
    { handle: "reviewer-fixture-orbit", id: 10 },
    { handle: "reviewer-fixture-harbor", id: 20 },
  ]);
  assert.deepEqual([...fixtures.values()], [10, 20, 30]);
  const posts = mapExpectedPostIds([
    { id: 42, authorId: 99, transcript: "A clear beginning makes a useful idea easier to share." },
    { id: 40, authorId: 10, transcript: "Small experiments can make welcoming products." },
  ], [99, 10]);
  assert.equal(posts.get(0), 42);
  assert.equal(posts.get(1), 40);
});