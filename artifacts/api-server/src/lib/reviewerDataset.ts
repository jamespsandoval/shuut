export const REVIEWER_DATASET_VERSION = "v1";
export const REVIEWER_DATASET_NAMESPACE = `reviewer-fixture-${REVIEWER_DATASET_VERSION}`;
export const REVIEWER_DATASET_CONFIRMATION = "seed";
export const REVIEWER_DATASET_TARGETS = ["staging"] as const;

export const fixtureHandles = [
  "reviewer-fixture-orbit",
  "reviewer-fixture-harbor",
  "reviewer-fixture-meadow",
] as const;

export function gateReviewerDataset(env: NodeJS.ProcessEnv, mode: "seed" | "teardown" | "dry-run") {
  if (!REVIEWER_DATASET_TARGETS.includes(env.REVIEWER_DATASET_TARGET as (typeof REVIEWER_DATASET_TARGETS)[number])) {
    throw new Error("Refusing reviewer dataset: REVIEWER_DATASET_TARGET must be staging");
  }
  if (env.NODE_ENV === "production") {
    throw new Error(`Refusing reviewer dataset ${mode}: fixtures are prohibited in production`);
  }
  if (env.REVIEWER_DATASET_CONFIRM !== REVIEWER_DATASET_CONFIRMATION) {
    throw new Error(`Refusing reviewer dataset ${mode}: set REVIEWER_DATASET_CONFIRM=seed explicitly`);
  }
}

export const expectedFixturePosts = [
  "A clear beginning makes a useful idea easier to share.",
  "Small experiments can make welcoming products.",
  "Good design leaves room for people to participate.",
  "A calm review dataset helps us test the listening experience.",
] as const;
export const expectedComments = ["A thoughtful point.", "Thanks for sharing this example."] as const;

export function auditIsSafe(audit: { externalComments: number; externalReactions: number; externalReshuuts: number; externalFollows: number; externalMentions: number; externalNotifications: number; extraPosts: number; changedProfiles: number }) {
  return Object.values(audit).every((value) => value === 0);
}

export function mapFixtureIds(rows: Array<{ handle: string; id: number }>) {
  return new Map(fixtureHandles.map((handle) => {
    const row = rows.find((candidate) => candidate.handle === handle);
    if (!row) throw new Error(`Missing reserved fixture profile: ${handle}`);
    return [handle, row.id] as const;
  }));
}

export function mapExpectedPostIds(
  rows: Array<{ id: number; authorId: number; transcript: string }>,
  authors: number[],
  transcriptPrefix = "",
) {
  return new Map(expectedFixturePosts.map((text, index) => {
    const row = rows.find((candidate) =>
      candidate.authorId === authors[index] &&
      candidate.transcript === `${transcriptPrefix}${text}`);
    return [index, row?.id] as const;
  }));
}

export function datasetManifest() {
  return {
    version: REVIEWER_DATASET_VERSION,
    namespace: REVIEWER_DATASET_NAMESPACE,
    reviewer: "existing verified REVIEWER_EMAIL founder (never created, changed, or deleted)",
    fixtureHandles: [...fixtureHandles],
    posts: 4,
    comments: 2,
    audio: "Self-generated 440 Hz sine tone; CC0-equivalent, no voice or third-party recording",
  } as const;
}

export function requestedMode(argv: string[]) {
  if (argv.includes("--teardown")) return "teardown" as const;
  if (argv.includes("--dry-run")) return "dry-run" as const;
  return "seed" as const;
}