import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db, foundersTable, postsTable, commentsTable, accountFollowsTable, postReactionsTable, postReshuutsTable, postMentionsTable, notificationsTable, usersTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  datasetManifest,
  fixtureHandles,
  gateReviewerDataset,
  requestedMode,
  REVIEWER_DATASET_NAMESPACE,
  expectedComments,
  expectedFixturePosts,
  auditIsSafe,
  mapFixtureIds,
  mapExpectedPostIds,
} from "../lib/reviewerDataset";

const execFileAsync = promisify(execFile);
const storage = new ObjectStorageService();
const marker = `[${REVIEWER_DATASET_NAMESPACE}]`;
const profiles = [
  ["reviewer-fixture-orbit", "Orbit Works", "Fictional product studio exploring calm, useful ideas.", "#2D9CDB"],
  ["reviewer-fixture-harbor", "Harbor Notes", "Fictional community notes about making things thoughtfully.", "#27AE60"],
  ["reviewer-fixture-meadow", "Meadow Lab", "Fictional experiments in simple, accessible design.", "#F2994A"],
] as const;

async function toneWav(seconds: number) {
  const path = `/tmp/${randomUUID()}.ogg`;
  try {
    await execFileAsync("ffmpeg", ["-version"]);
  } catch {
    throw new Error("ffmpeg is required to generate the self-created Ogg/Opus reviewer fixtures");
  }
  await execFileAsync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=" + seconds, "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-f", "ogg", "-y", path]);
  const { readFile, unlink } = await import("node:fs/promises");
  const data = await readFile(path);
  await unlink(path);
  return data;
}

async function findReviewer(email: string) {
  const rows = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(and(eq(usersTable.email, email.trim().toLowerCase()), eq(usersTable.deletionStatus, "active")));
  if (!rows[0]) throw new Error("REVIEWER_EMAIL must belong to an existing active account");
  const result = await db.execute(sql`select id from shuut_users where id = ${rows[0].id} and email_verified_at is not null and deletion_status = 'active' limit 1`);
  if (!result.rows[0]) throw new Error("REVIEWER_EMAIL must belong to an email-verified account");
  const founders = await db.select({ id: foundersTable.id }).from(foundersTable).where(eq(foundersTable.userId, rows[0].id));
  if (founders.length !== 1) throw new Error("REVIEWER_EMAIL must have exactly one founder profile from normal onboarding");
  return { userId: rows[0].id, founderId: founders[0].id };
}

async function seed(email: string, dryRun: boolean) {
  const reviewer = await findReviewer(email);
  if (dryRun) return { mode: "dry-run", reviewer: email, reviewerFounderId: reviewer.founderId, planned: datasetManifest() };
  const fixtureIds: number[] = [reviewer.founderId];
  for (const [handle, name, bio, color] of profiles) {
    const existing = await db.select({
      id: foundersTable.id,
      userId: foundersTable.userId,
      name: foundersTable.name,
      bio: foundersTable.bio,
    }).from(foundersTable).where(eq(foundersTable.handle, handle)).limit(1);
    if (existing[0] && (
      existing[0].userId !== null ||
      existing[0].name !== name ||
      existing[0].bio !== bio
    )) {
      throw new Error(`Reserved reviewer fixture handle ${handle} is already in use; refusing to overwrite it`);
    }
    const row = await db.insert(foundersTable).values({ name, handle, bio, avatarColor: color })
      .onConflictDoUpdate({ target: foundersTable.handle, set: { name, bio, avatarColor: color } }).returning({ id: foundersTable.id });
    fixtureIds.push(row[0].id);
  }
  let audio: Buffer | undefined;
  const audioPaths: string[] = [];
  const postIds: number[] = [];
  for (let i = 0; i < 4; i++) {
    const transcript = `${marker} ${expectedFixturePosts[i]}`;
    const uploaded: string[] = [];
    try {
      const post = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${REVIEWER_DATASET_NAMESPACE}))`);
        const found = await tx.select({ id: postsTable.id, audioUrl: postsTable.audioUrl }).from(postsTable).where(and(eq(postsTable.authorId, fixtureIds[i]), eq(postsTable.transcript, transcript)));
        let postId = found[0]?.id;
        let audioPath = found[0]?.audioUrl ?? null;
        if (!postId) {
          const created = await tx.insert(postsTable).values({ authorId: fixtureIds[i], transcript, audioUrl: null, durationSeconds: 1, transcriptionStatus: "ready", moderationStatus: "approved" }).returning({ id: postsTable.id });
          postId = created[0].id;
        }
        if (!audioPath) {
          audio ??= await toneWav(1);
          audioPath = `/objects/uploads/${randomUUID()}`;
          uploaded.push(audioPath);
          await storage.saveUpload(audioPath, audio, "audio/ogg");
          await tx.update(postsTable).set({ audioUrl: audioPath }).where(eq(postsTable.id, postId));
        }
        return { id: postId, audioUrl: audioPath };
      });
      audioPaths.push(post.audioUrl);
      postIds.push(post.id);
    } catch (error) {
      for (const objectPath of uploaded) await storage.deleteObject(objectPath);
      throw error;
    }
  }
  if (postIds.length >= 2) {
    await db.transaction(async (tx) => {
     await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${REVIEWER_DATASET_NAMESPACE}))`);
     for (const [index, comment] of expectedComments.entries()) {
      const transcript = `${marker} ${comment}`;
       const existing = await tx.select({ id: commentsTable.id })
         .from(commentsTable)
         .where(and(
           eq(commentsTable.postId, postIds[0]),
           eq(commentsTable.authorId, fixtureIds[index + 1]),
           eq(commentsTable.transcript, transcript),
         ));
      if (!existing.length) await tx.insert(commentsTable).values({ postId: postIds[0], authorId: fixtureIds[index + 1], transcript, transcriptionStatus: "ready", audioUrl: audioPaths[index], durationSeconds: 1, moderationStatus: "approved" });
     }
    await tx.insert(accountFollowsTable).values({ followerFounderId: fixtureIds[0], followedFounderId: fixtureIds[1] }).onConflictDoNothing();
    await tx.insert(accountFollowsTable).values({ followerFounderId: fixtureIds[1], followedFounderId: fixtureIds[0] }).onConflictDoNothing();
    await tx.insert(postReactionsTable).values({ postId: postIds[0], founderId: fixtureIds[0], emojiType: "rocket" }).onConflictDoNothing();
    await tx.insert(postReshuutsTable).values({ postId: postIds[1], founderId: fixtureIds[0] }).onConflictDoNothing();
    await tx.insert(postMentionsTable).values({ postId: postIds[0], founderId: fixtureIds[3] }).onConflictDoNothing();
    await tx.insert(notificationsTable).values({ actorId: fixtureIds[0], recipientId: fixtureIds[3], postId: postIds[0], eventType: "mention", dedupeKey: `${marker}:mention:${postIds[0]}` }).onConflictDoNothing();
    for (const id of fixtureIds) {
      const [followers, following] = await Promise.all([
        tx.select({ count: sql<number>`count(*)` }).from(accountFollowsTable).where(eq(accountFollowsTable.followedFounderId, id)),
        tx.select({ count: sql<number>`count(*)` }).from(accountFollowsTable).where(eq(accountFollowsTable.followerFounderId, id)),
      ]);
      await tx.update(foundersTable).set({ followerCount: Number(followers[0].count), followingCount: Number(following[0].count) }).where(eq(foundersTable.id, id));
    }
    const reactions = await tx.select({ emojiType: postReactionsTable.emojiType }).from(postReactionsTable).where(eq(postReactionsTable.postId, postIds[0]));
    const counts = { rocket: 0, laughing: 0, thumbsDown: 0 };
    for (const reaction of reactions) if (reaction.emojiType in counts) counts[reaction.emojiType as keyof typeof counts]++;
    await tx.update(postsTable).set({ rocket: counts.rocket, laughing: counts.laughing, thumbsDown: counts.thumbsDown }).where(eq(postsTable.id, postIds[0]));
    });
  }
  return { mode: "seed", reviewer: email, manifest: datasetManifest(), founderIds: fixtureIds };
}

async function teardown(email: string) {
  const reviewer = await findReviewer(email);
  const committed = await db.transaction(async (tx) => {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${REVIEWER_DATASET_NAMESPACE}))`);
  await tx.execute(sql`
    lock table
      shuut_users,
      shuut_founders,
      shuut_posts,
      shuut_comments,
      shuut_account_follows,
      shuut_post_reactions,
      shuut_post_reshuuts,
      shuut_post_mentions,
      shuut_notifications
    in share row exclusive mode
  `);
  const rows = await tx.select({ id: foundersTable.id, handle: foundersTable.handle }).from(foundersTable).where(inArray(foundersTable.handle, [...fixtureHandles]));
  const fixtureMap = mapFixtureIds(rows);
  const fixtureIds = fixtureHandles.map((handle) => fixtureMap.get(handle)!);
  const ownedAuthorIds = [reviewer.founderId, ...fixtureIds];
  if (fixtureIds.length !== 3) throw new Error(`Teardown refused: expected three fixture profiles, found ${fixtureIds.length}`);
  const profileRows = await tx.select({ handle: foundersTable.handle, userId: foundersTable.userId, name: foundersTable.name, bio: foundersTable.bio })
    .from(foundersTable).where(inArray(foundersTable.handle, [...fixtureHandles]));
  await tx.execute(sql`select id from shuut_founders where id = any(${[reviewer.founderId, ...fixtureIds]}) for update`);
  const changedProfiles = profileRows.filter((row) => {
    const expected = profiles.find((profile) => profile[0] === row.handle);
    return !expected || row.userId !== null || row.name !== expected[1] || row.bio !== expected[2];
  }).length;
  const allOwnedPosts = await tx.select({ id: postsTable.id, authorId: postsTable.authorId, transcript: postsTable.transcript })
    .from(postsTable).where(inArray(postsTable.authorId, ownedAuthorIds));
  const posts = await tx.select({ id: postsTable.id, audioUrl: postsTable.audioUrl })
    .from(postsTable)
    .where(and(
      inArray(postsTable.authorId, ownedAuthorIds),
      like(postsTable.transcript, `${marker}%`),
    ));
  const expectedPostMap = mapExpectedPostIds(allOwnedPosts, ownedAuthorIds, `${marker} `);
  const expectedPostIds = new Set([...expectedPostMap.values()].filter((id): id is number => id !== undefined));
  if (expectedPostIds.size !== expectedFixturePosts.length) {
    throw new Error(`Teardown refused: expected ${expectedFixturePosts.length} exact marker-owned posts, found ${expectedPostIds.size}`);
  }
  const extraPosts = allOwnedPosts.filter((post) => fixtureIds.includes(post.authorId) || (post.authorId === reviewer.founderId && post.transcript.startsWith(marker))).filter((post) => !expectedPostIds.has(post.id)).length;
  const postIds = expectedFixturePosts.map((_, index) => expectedPostMap.get(index)).filter((id): id is number => id !== undefined);
  const reviewerPostId = expectedPostMap.get(0) ?? 0;
  const orbitPostId = expectedPostMap.get(1) ?? 0;
  if (postIds.length) await tx.execute(sql`select id from shuut_posts where id = any(${postIds}) for update`);
  const audit = {
    changedProfiles,
    extraPosts,
    externalComments: Number((await tx.execute(sql`select count(*)::int as count from shuut_comments c where (c.post_id = any(${postIds}) and not ((c.post_id = ${reviewerPostId} and c.author_id = ${fixtureIds[1]} and c.transcript = ${marker + " " + expectedComments[0]}) or (c.post_id = ${reviewerPostId} and c.author_id = ${fixtureIds[2]} and c.transcript = ${marker + " " + expectedComments[1]}))) or (c.author_id = any(${fixtureIds}) and not ((c.post_id = ${reviewerPostId} and c.author_id = ${fixtureIds[1]} and c.transcript = ${marker + " " + expectedComments[0]}) or (c.post_id = ${reviewerPostId} and c.author_id = ${fixtureIds[2]} and c.transcript = ${marker + " " + expectedComments[1]})))`)).rows[0]?.count ?? 0),
    externalReactions: Number((await tx.execute(sql`select count(*)::int as count from shuut_post_reactions where founder_id = any(${fixtureIds}) or (post_id = any(${postIds}) and not (post_id = ${reviewerPostId} and founder_id = ${reviewer.founderId} and emoji_type = 'rocket'))`)).rows[0]?.count ?? 0),
    externalReshuuts: Number((await tx.execute(sql`select count(*)::int as count from shuut_post_reshuuts where founder_id = any(${fixtureIds}) or (post_id = any(${postIds}) and not (post_id = ${orbitPostId} and founder_id = ${reviewer.founderId}))`)).rows[0]?.count ?? 0),
    externalFollows: Number((await tx.execute(sql`select count(*)::int as count from shuut_account_follows where (follower_founder_id = any(${fixtureIds}) or followed_founder_id = any(${fixtureIds})) and not ((follower_founder_id = ${reviewer.founderId} and followed_founder_id = ${fixtureIds[0]}) or (follower_founder_id = ${fixtureIds[0]} and followed_founder_id = ${reviewer.founderId}))`)).rows[0]?.count ?? 0),
    externalMentions: Number((await tx.execute(sql`select count(*)::int as count from shuut_post_mentions where (founder_id = any(${fixtureIds}) or post_id = any(${postIds})) and not (post_id = ${reviewerPostId} and founder_id = ${fixtureIds[2]})`)).rows[0]?.count ?? 0),
    externalNotifications: Number((await tx.execute(sql`select count(*)::int as count from shuut_notifications where (actor_id = any(${fixtureIds}) or recipient_id = any(${fixtureIds}) or post_id = any(${postIds})) and not (actor_id = ${reviewer.founderId} and recipient_id = ${fixtureIds[2]} and post_id = ${reviewerPostId} and event_type = 'mention' and dedupe_key is not distinct from ${`${marker}:mention:${reviewerPostId}`})`)).rows[0]?.count ?? 0),
  };
  if (!auditIsSafe(audit)) throw new Error(`Teardown refused; ownership audit found external rows: ${JSON.stringify(audit)}`);
  const objectPaths = new Set(posts.flatMap((post) => post.audioUrl ? [post.audioUrl] : []));
    if (postIds.length) {
      await tx.delete(notificationsTable).where(eq(notificationsTable.dedupeKey, `${marker}:mention:${reviewerPostId}`));
      await tx.delete(postMentionsTable).where(and(eq(postMentionsTable.postId, reviewerPostId), eq(postMentionsTable.founderId, fixtureIds[2])));
      await tx.delete(postReactionsTable).where(and(eq(postReactionsTable.postId, reviewerPostId), eq(postReactionsTable.founderId, reviewer.founderId), eq(postReactionsTable.emojiType, "rocket")));
      await tx.delete(postReshuutsTable).where(and(eq(postReshuutsTable.postId, orbitPostId), eq(postReshuutsTable.founderId, reviewer.founderId)));
      await tx.delete(commentsTable).where(and(inArray(commentsTable.postId, postIds), like(commentsTable.transcript, `${marker}%`)));
      await tx.delete(postsTable).where(inArray(postsTable.id, postIds));
    }
    await tx.delete(accountFollowsTable).where(sql`(follower_founder_id = ${reviewer.founderId} and followed_founder_id = ${fixtureIds[0]}) or (follower_founder_id = ${fixtureIds[0]} and followed_founder_id = ${reviewer.founderId})`);
    await tx.delete(foundersTable).where(inArray(foundersTable.id, fixtureIds));
  
  const [followers, following] = await Promise.all([
    tx.select({ count: sql<number>`count(*)` })
      .from(accountFollowsTable)
      .where(eq(accountFollowsTable.followedFounderId, reviewer.founderId)),
    tx.select({ count: sql<number>`count(*)` })
      .from(accountFollowsTable)
      .where(eq(accountFollowsTable.followerFounderId, reviewer.founderId)),
  ]);
  await tx.update(foundersTable).set({
    followerCount: Number(followers[0].count),
    followingCount: Number(following[0].count),
  }).where(eq(foundersTable.id, reviewer.founderId));
  return { mode: "teardown", deletedFixtureProfiles: fixtureIds.length, deletedPosts: postIds.length, audit, objectPaths: [...objectPaths] };
  });
  for (const objectPath of committed.objectPaths) await storage.deleteObject(objectPath);
  return committed;
}

const mode = requestedMode(process.argv.slice(2));
gateReviewerDataset(process.env, mode);
const result = mode === "teardown"
  ? await teardown(process.env.REVIEWER_EMAIL ?? "")
  : await seed(process.env.REVIEWER_EMAIL ?? "", mode === "dry-run");
console.log(JSON.stringify(result, null, 2));