import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  AskFounderBody,
  AskFounderParams,
  AskFounderResponse,
  CreatePostBody,
  CreatePostResponse,
  DeletePostParams,
  GetFeedQueryParams,
  GetFeedResponse,
  GetPostParams,
  GetPostResponse,
  GetProfileParams,
  GetProfileResponse,
  ReshuutPostParams,
  ReshuutPostResponse,
  SetReactionBody,
  SetReactionParams,
  SetReactionResponse,
  ToggleFollowParams,
  ToggleFollowResponse,
  UpdateProfileBody,
  UpdateProfileParams,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import {
  db,
  foundersTable,
  postsTable,
  type FounderRow,
  type PostRow,
} from "@workspace/db";

const router: IRouter = Router();

const seedFounders = [
  {
    name: "Maya Okafor",
    handle: "maya",
    bio: "Building better ways for small teams to make hard decisions.",
    avatarColor: "#F59E0B",
    isFollowing: false,
    followerCount: 184,
    followingCount: 92,
  },
  {
    name: "Alex Tan",
    handle: "alextan",
    bio: "Founder at Fold. Thinking out loud about product, people and momentum.",
    avatarColor: "#3B82F6",
    isFollowing: true,
    followerCount: 428,
    followingCount: 117,
  },
  {
    name: "Priya Shah",
    handle: "priyashah",
    bio: "Climate tech founder. London. Usually asking the uncomfortable question.",
    avatarColor: "#10B981",
    isFollowing: false,
    followerCount: 316,
    followingCount: 143,
  },
];

async function ensureSeeded(): Promise<void> {
  const existing = await db.select({ id: foundersTable.id }).from(foundersTable).limit(1);
  if (existing.length) return;
  const founders = await db.insert(foundersTable).values(seedFounders).returning();
  const byHandle = new Map(founders.map((founder) => [founder.handle, founder]));
  await db.insert(postsTable).values([
    {
      authorId: byHandle.get("alextan")!.id,
      transcript:
        "The best founder conversations I’ve had this month started with someone admitting what they didn’t know. Certainty is useful for execution, but curiosity is what keeps the company alive.",
      durationSeconds: 28,
      goat: 18,
      rocket: 9,
      laughing: 2,
      confused: 1,
      thumbsDown: 0,
      createdAt: new Date(Date.now() - 22 * 60 * 1000),
    },
    {
      authorId: byHandle.get("priyashah")!.id,
      transcript:
        "A tiny observation from a customer call: people don’t want another dashboard. They want to know what to do next, and they want to trust why. We’re rebuilding the whole flow around that.",
      durationSeconds: 34,
      goat: 12,
      rocket: 24,
      laughing: 0,
      confused: 3,
      thumbsDown: 1,
      createdAt: new Date(Date.now() - 67 * 60 * 1000),
    },
    {
      authorId: byHandle.get("maya")!.id,
      transcript:
        "Today’s reminder to myself: a decision can be reversible and still deserve care. Move quickly, write down the assumption, and make it easy for the team to tell you when the assumption stops being true.",
      durationSeconds: 31,
      goat: 21,
      rocket: 14,
      laughing: 1,
      confused: 0,
      thumbsDown: 0,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
  ]);
}

function founderJson(founder: FounderRow) {
  return {
    id: founder.id,
    name: founder.name,
    handle: founder.handle,
    bio: founder.bio,
    avatarColor: founder.avatarColor,
    avatarUrl: founder.avatarUrl,
    location: founder.location,
    website: founder.website,
    isFollowing: founder.isFollowing,
  };
}

function postJson(post: PostRow, author: FounderRow) {
  return {
    id: post.id,
    author: founderJson(author),
    transcript: post.transcript,
    audioUrl: post.audioUrl,
    durationSeconds: post.durationSeconds,
    createdAt: post.createdAt,
    reactions: {
      goat: post.goat,
      rocket: post.rocket,
      laughing: post.laughing,
      confused: post.confused,
      thumbsDown: post.thumbsDown,
    },
    viewerReaction: post.viewerReaction as
      | "goat"
      | "rocket"
      | "laughing"
      | "confused"
      | "thumbsDown"
      | null,
    isReshuuted: post.isReshuuted,
    reshuutedBy: post.reshuutedBy,
  };
}

async function hydratePosts(rows: PostRow[]) {
  if (!rows.length) return [];
  const founders = await db
    .select()
    .from(foundersTable)
    .where(inArray(foundersTable.id, [...new Set(rows.map((row) => row.authorId))]));
  const byId = new Map(founders.map((founder) => [founder.id, founder]));
  return rows.map((row) => postJson(row, byId.get(row.authorId)!));
}

router.get("/feed", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetFeedQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const all = await db.select().from(postsTable).orderBy(desc(postsTable.createdAt));
  let rows = all;
  if (params.data.view === "following") {
    const followed = await db
      .select({ id: foundersTable.id })
      .from(foundersTable)
      .where(eq(foundersTable.isFollowing, true));
    rows = all.filter((post) => followed.some((founder) => founder.id === post.authorId));
  }
  res.json(GetFeedResponse.parse(await hydratePosts(rows)));
});

router.get("/profiles/:handle", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const resolvedHandle = params.data.handle === "me" ? "maya" : params.data.handle;
  const [founder] = await db
    .select()
    .from(foundersTable)
    .where(eq(foundersTable.handle, resolvedHandle));
  if (!founder) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  const rows = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.authorId, founder.id))
    .orderBy(desc(postsTable.createdAt));
  res.json(
    GetProfileResponse.parse({
      founder: founderJson(founder),
      followerCount: founder.followerCount,
      followingCount: founder.followingCount,
      postCount: rows.length,
      posts: await hydratePosts(rows),
      suggestedQuestions: [
        `What is ${founder.name.split(" ")[0]} learning right now?`,
        `What does ${founder.name.split(" ")[0]} believe about building teams?`,
        `What recent idea keeps coming up?`,
      ],
    }),
  );
});

router.patch("/profiles/:handle", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = UpdateProfileParams.safeParse(req.params);
  const body = UpdateProfileBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid profile details" });
    return;
  }
  const resolvedHandle = params.data.handle === "me" ? "maya" : params.data.handle;
  const [existing] = await db
    .select()
    .from(foundersTable)
    .where(eq(foundersTable.handle, resolvedHandle));
  if (!existing) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  const [founder] = await db
    .update(foundersTable)
    .set({
      name: body.data.name,
      handle: body.data.handle,
      bio: body.data.bio,
      location: body.data.location || null,
      website: body.data.website || null,
      avatarUrl: body.data.avatarDataUrl ?? existing.avatarUrl,
    })
    .where(eq(foundersTable.id, existing.id))
    .returning();
  const rows = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.authorId, founder.id))
    .orderBy(desc(postsTable.createdAt));
  res.json(
    UpdateProfileResponse.parse({
      founder: founderJson(founder),
      followerCount: founder.followerCount,
      followingCount: founder.followingCount,
      postCount: rows.length,
      posts: await hydratePosts(rows),
      suggestedQuestions: [
        `What is ${founder.name.split(" ")[0]} learning right now?`,
        `What does ${founder.name.split(" ")[0]} believe about building teams?`,
        `What recent idea keeps coming up?`,
      ],
    }),
  );
});

router.post("/posts", async (req, res): Promise<void> => {
  await ensureSeeded();
  const body = CreatePostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [maya] = await db.select().from(foundersTable).where(eq(foundersTable.handle, "maya"));
  const [created] = await db
    .insert(postsTable)
    .values({
      authorId: maya.id,
      transcript: body.data.transcript,
      durationSeconds: body.data.durationSeconds,
      audioUrl: body.data.audioDataUrl,
    })
    .returning();
  res.status(201).json(CreatePostResponse.parse(postJson(created, maya)));
});

router.get("/posts/:postId", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [author] = await db.select().from(foundersTable).where(eq(foundersTable.id, post.authorId));
  res.json(GetPostResponse.parse(postJson(post, author)));
});

router.delete("/posts/:postId", async (req, res): Promise<void> => {
  const params = DeletePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(postsTable).where(eq(postsTable.id, params.data.postId));
  res.sendStatus(204);
});

router.put("/posts/:postId/reaction", async (req, res): Promise<void> => {
  const params = SetReactionParams.safeParse(req.params);
  const body = SetReactionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid reaction" });
    return;
  }
  const [current] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!current) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const counts = {
    goat: current.goat,
    rocket: current.rocket,
    laughing: current.laughing,
    confused: current.confused,
    thumbsDown: current.thumbsDown,
  };
  const key = body.data.emojiType;
  const old = current.viewerReaction as keyof typeof counts | null;
  if (old) counts[old] = Math.max(0, counts[old] - 1);
  const nextReaction = old === key ? null : key;
  if (nextReaction) counts[nextReaction] += 1;
  const [updated] = await db
    .update(postsTable)
    .set({ ...counts, viewerReaction: nextReaction })
    .where(eq(postsTable.id, current.id))
    .returning();
  const [author] = await db.select().from(foundersTable).where(eq(foundersTable.id, updated.authorId));
  res.json(SetReactionResponse.parse(postJson(updated, author)));
});

router.post("/posts/:postId/reshuut", async (req, res): Promise<void> => {
  const params = ReshuutPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [updated] = await db
    .update(postsTable)
    .set({ isReshuuted: true, reshuutedBy: "Maya Okafor" })
    .where(eq(postsTable.id, params.data.postId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [author] = await db.select().from(foundersTable).where(eq(foundersTable.id, updated.authorId));
  res.json(ReshuutPostResponse.parse(postJson(updated, author)));
});

router.put("/profiles/:handle/follow", async (req, res): Promise<void> => {
  const params = ToggleFollowParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [founder] = await db
    .select()
    .from(foundersTable)
    .where(eq(foundersTable.handle, params.data.handle));
  if (!founder) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  const isFollowing = !founder.isFollowing;
  const followerCount = Math.max(0, founder.followerCount + (isFollowing ? 1 : -1));
  await db
    .update(foundersTable)
    .set({ isFollowing, followerCount })
    .where(and(eq(foundersTable.id, founder.id)));
  res.json(ToggleFollowResponse.parse({ isFollowing, followerCount }));
});

router.post("/profiles/:handle/ask", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = AskFounderParams.safeParse(req.params);
  const body = AskFounderBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid question" });
    return;
  }
  const [founder] = await db
    .select()
    .from(foundersTable)
    .where(eq(foundersTable.handle, params.data.handle));
  if (!founder) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  const posts = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.authorId, founder.id))
    .orderBy(desc(postsTable.createdAt))
    .limit(3);
  const hasEnoughContext = posts.length > 0;
  const answer = hasEnoughContext
    ? `${founder.name.split(" ")[0]} tends to favour learning in public and turning observations into concrete next steps. In the posts available here, the recurring theme is to stay curious, make assumptions explicit, and use customer or team feedback to decide what changes next.`
    : `${founder.name.split(" ")[0]} hasn’t posted enough yet for me to answer that without guessing.`;
  res.json(
    AskFounderResponse.parse({
      answer,
      hasEnoughContext,
      sources: posts.slice(0, 2).map((post) => ({
        postId: post.id,
        excerpt: post.transcript.slice(0, 120),
        createdAt: post.createdAt,
      })),
    }),
  );
});

export default router;