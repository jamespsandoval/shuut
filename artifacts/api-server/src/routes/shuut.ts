import { Router, type IRouter } from "express";
import { Readable } from "stream";
import { and, asc, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
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
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  TranscribeAudioBody,
  TranscribeAudioResponse,
  UpdatePostBody,
  UpdatePostParams,
  UpdatePostResponse,
  CreatePostShareLinkParams,
  CreatePostShareLinkResponse,
  CreatePostCommentBody,
  CreatePostCommentParams,
  CreatePostCommentResponse,
  GetPostCommentsParams,
  GetPostCommentsResponse,
  GetCommentAudioParams,
} from "@workspace/api-zod";
import {
  db,
  foundersTable,
  postsTable,
  commentsTable,
  profileImageUploadsTable,
  usersTable,
  type FounderRow,
  type PostRow,
  type CommentRow,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  clearSessionCookie,
  getAuthenticatedUserId,
} from "../middlewares/sessionAuth";
import { auditSecurityEvent, consumeRateLimit, privacyHash } from "../lib/security";
import { createPostShareToken } from "../lib/postShareToken";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const PENDING_UPLOAD_TTL_MS = 20 * 60 * 1000;
const POST_EDIT_WINDOW_MS = 30 * 1000;

async function cleanupExpiredProfileUploads() {
  const expired = await db
    .select()
    .from(profileImageUploadsTable)
    .where(lt(profileImageUploadsTable.createdAt, new Date(Date.now() - PENDING_UPLOAD_TTL_MS)));
  for (const upload of expired) {
    await objectStorage.deleteObject(upload.objectPath);
  }
  if (expired.length) {
    await db
      .delete(profileImageUploadsTable)
      .where(lt(profileImageUploadsTable.createdAt, new Date(Date.now() - PENDING_UPLOAD_TTL_MS)));
  }
}

async function currentFounder(userId: string) {
  const [linked] = await db.select().from(foundersTable).where(eq(foundersTable.userId, userId));
  return linked ?? null;
}

let syntheticProfilesCleaned = false;
async function ensureSeeded(): Promise<void> {
  if (syntheticProfilesCleaned) return;
  await db.delete(foundersTable).where(and(
    isNull(foundersTable.userId),
    or(
      and(eq(foundersTable.handle, "maya"), eq(foundersTable.name, "Maya Okafor")),
      and(eq(foundersTable.handle, "alextan"), eq(foundersTable.name, "Alex Tan")),
      and(eq(foundersTable.handle, "priyashah"), eq(foundersTable.name, "Priya Shah")),
    ),
  ));
  await db.update(postsTable)
    .set({ viewerReaction: null })
    .where(inArray(postsTable.viewerReaction, ["goat", "confused"]));
  syntheticProfilesCleaned = true;
}

function founderJson(founder: FounderRow) {
  const storedAvatar = founder.avatarObjectPath;
  const avatarUrl = storedAvatar?.startsWith("/objects/uploads/")
    ? `/api/storage${storedAvatar}`
    : storedAvatar?.startsWith("data:image/")
      ? storedAvatar
      : null;
  return {
    id: founder.id,
    name: founder.name,
    handle: founder.handle,
    bio: founder.bio,
    avatarColor: founder.avatarColor,
    avatarUrl,
    location: founder.location,
    website: founder.website,
    isFollowing: founder.isFollowing,
    previewTranscript: founder.previewTranscript,
  };
}

function postJson(post: PostRow, author: FounderRow, viewerFounderId?: number | null) {
  const storedAudio = post.audioUrl;
  const audioUrl = storedAudio?.startsWith("/objects/uploads/")
    ? `/api/posts/${post.id}/audio`
    : null;
  return {
    id: post.id,
    author: founderJson(author),
    transcript: post.transcript,
    audioUrl,
    durationSeconds: post.durationSeconds,
    createdAt: post.createdAt,
    reactions: {
      rocket: post.rocket,
      laughing: post.laughing,
      thumbsDown: post.thumbsDown,
    },
    viewerReaction: ["rocket", "laughing", "thumbsDown"].includes(post.viewerReaction ?? "")
      ? post.viewerReaction as "rocket" | "laughing" | "thumbsDown"
      : null,
    isReshuuted: post.isReshuuted,
    reshuutedBy: post.reshuutedBy,
    canEdit:
      post.transcriptionStatus === "ready" &&
      viewerFounderId === post.authorId &&
      Date.now() <= post.createdAt.getTime() + POST_EDIT_WINDOW_MS,
    editableUntil:
      viewerFounderId === post.authorId
        ? new Date(post.createdAt.getTime() + POST_EDIT_WINDOW_MS)
        : null,
  };
}

function commentJson(comment: CommentRow, author: FounderRow) {
  return {
    id: comment.id,
    author: founderJson(author),
    transcript: comment.transcript,
    audioUrl: `/api/comments/${comment.id}/audio`,
    durationSeconds: comment.durationSeconds,
    createdAt: comment.createdAt,
  };
}

async function hydratePosts(rows: PostRow[], viewerFounderId?: number | null) {
  if (!rows.length) return [];
  const founders = await db
    .select()
    .from(foundersTable)
    .where(inArray(foundersTable.id, [...new Set(rows.map((row) => row.authorId))]));
  const byId = new Map(founders.map((founder) => [founder.id, founder]));
  return rows.map((row) => postJson(row, byId.get(row.authorId)!, viewerFounderId));
}

router.get("/feed", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetFeedQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const all = (await db.select().from(postsTable).orderBy(desc(postsTable.createdAt)))
    .filter((post) => post.transcriptionStatus === "ready");
  const viewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  let rows = all;
  if (params.data.view === "following") {
    const followed = await db
      .select({ id: foundersTable.id })
      .from(foundersTable)
      .where(eq(foundersTable.isFollowing, true));
    rows = all.filter((post) => followed.some((founder) => founder.id === post.authorId));
  }
  res.json(GetFeedResponse.parse(await hydratePosts(rows, viewer?.id)));
});

router.get("/profiles/:handle", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  let founder;
  if (params.data.handle === "me") {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to view your profile" });
      return;
    }
    founder = await currentFounder(userId);
  } else {
    [founder] = await db.select().from(foundersTable).where(eq(foundersTable.handle, params.data.handle));
  }
  if (!founder) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  const rows = (await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.authorId, founder.id))
    .orderBy(desc(postsTable.createdAt)))
    .filter((post) => post.transcriptionStatus === "ready");
  const viewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  res.json(
    GetProfileResponse.parse({
      founder: founderJson(founder),
      followerCount: founder.followerCount,
      followingCount: founder.followingCount,
      postCount: rows.length,
      posts: await hydratePosts(rows, viewer?.id),
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
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const existing = await currentFounder(userId);
  if (!existing) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  if (body.data.avatarObjectPath && body.data.avatarObjectPath !== existing.avatarObjectPath) {
    const [pendingUpload] = await db
      .select()
      .from(profileImageUploadsTable)
      .where(and(
        eq(profileImageUploadsTable.objectPath, body.data.avatarObjectPath),
        eq(profileImageUploadsTable.userId, userId),
      ));
    if (!pendingUpload) {
      res.status(403).json({ error: "This headshot upload does not belong to you" });
      return;
    }
    try {
      await objectStorage.setAcl(body.data.avatarObjectPath, {
        owner: userId,
        visibility: "public",
      });
    } catch {
      res.status(400).json({ error: "The uploaded headshot could not be verified" });
      return;
    }
  }
  const [founder] = await db
    .update(foundersTable)
    .set({
      name: body.data.name,
      handle: body.data.handle,
      bio: body.data.bio,
      location: body.data.location || null,
      website: body.data.website || null,
      avatarObjectPath: body.data.avatarObjectPath ?? existing.avatarObjectPath,
      previewTranscript: body.data.previewTranscript ?? existing.previewTranscript,
    })
    .where(eq(foundersTable.id, existing.id))
    .returning();
  if (body.data.avatarObjectPath) {
    await db.delete(profileImageUploadsTable).where(and(
      eq(profileImageUploadsTable.objectPath, body.data.avatarObjectPath),
      eq(profileImageUploadsTable.userId, userId),
    ));
    if (
      existing.avatarObjectPath &&
      existing.avatarObjectPath !== body.data.avatarObjectPath
    ) {
      try {
        await objectStorage.deleteObject(existing.avatarObjectPath);
      } catch (error) {
        req.log.warn({ err: error }, "Could not remove replaced account headshot");
      }
    }
  }
  const rows = (await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.authorId, founder.id))
    .orderBy(desc(postsTable.createdAt)))
    .filter((post) => post.transcriptionStatus === "ready");
  res.json(
    UpdateProfileResponse.parse({
      founder: founderJson(founder),
      followerCount: founder.followerCount,
      followingCount: founder.followingCount,
      postCount: rows.length,
      posts: await hydratePosts(rows, founder.id),
      suggestedQuestions: [
        `What is ${founder.name.split(" ")[0]} learning right now?`,
        `What does ${founder.name.split(" ")[0]} believe about building teams?`,
        `What recent idea keeps coming up?`,
      ],
    }),
  );
});

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = RequestUploadUrlBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose a supported image or audio file under 15MB" });
    return;
  }
  try {
    await cleanupExpiredProfileUploads();
    const upload = await objectStorage.createUpload(body.data.size, body.data.contentType);
    await db.insert(profileImageUploadsTable).values({
      objectPath: upload.objectPath,
      userId,
    });
    res.json(RequestUploadUrlResponse.parse(upload));
  } catch (error) {
    req.log.error({ err: error }, "Failed to create upload");
    res.status(500).json({ error: "Could not start the upload" });
  }
});

router.get("/posts/:postId/audio", async (req, res): Promise<void> => {
  const params = GetPostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [post] = await db.select({ audioUrl: postsTable.audioUrl })
    .from(postsTable)
    .where(eq(postsTable.id, params.data.postId))
    .limit(1);
  if (!post?.audioUrl?.startsWith("/objects/uploads/")) {
    await auditSecurityEvent(req, "audio_denial", getAuthenticatedUserId(req));
    res.status(404).json({ error: "Audio not found" });
    return;
  }
  try {
    const metadata = await objectStorage.streamPrivate(post.audioUrl);
    const rangeHeader = req.headers.range;
    let range: { start: number; end: number } | undefined;
    if (rangeHeader && metadata.size > 0) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match) {
        res.setHeader("Content-Range", `bytes */${metadata.size}`);
        res.sendStatus(416);
        return;
      }
      const requestedStart = match[1] ? Number(match[1]) : undefined;
      const requestedEnd = match[2] ? Number(match[2]) : undefined;
      const start = requestedStart ?? Math.max(0, metadata.size - (requestedEnd ?? 0));
      const end = Math.min(requestedEnd ?? metadata.size - 1, metadata.size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= metadata.size) {
        res.setHeader("Content-Range", `bytes */${metadata.size}`);
        res.sendStatus(416);
        return;
      }
      range = { start, end };
    }
    const object = range
      ? await objectStorage.streamPrivate(post.audioUrl, range)
      : metadata;
    res.setHeader("Content-Type", object.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Accept-Ranges", "bytes");
    if (range) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
      res.setHeader("Content-Length", range.end - range.start + 1);
    } else if (object.size) {
      res.setHeader("Content-Length", object.size);
    }
    Readable.fromWeb(object.body as ReadableStream<Uint8Array>).pipe(res);
  } catch {
    await auditSecurityEvent(req, "audio_denial", getAuthenticatedUserId(req), { postId: params.data.postId });
    res.status(404).json({ error: "Audio not found" });
  }
});

router.post("/transcriptions", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  const body = TranscribeAudioBody.safeParse(req.body);
  if (!userId || !body.success) {
    res.status(userId ? 400 : 401).json({ error: userId ? "Invalid voice recording" : "Unauthorized" });
    return;
  }

  const [pendingUpload] = await db
    .select()
    .from(profileImageUploadsTable)
    .where(and(
      eq(profileImageUploadsTable.objectPath, body.data.audioObjectPath),
      eq(profileImageUploadsTable.userId, userId),
    ))
    .limit(1);
  if (!pendingUpload) {
    await auditSecurityEvent(req, "audio_denial", userId);
    res.status(403).json({ error: "This voice recording does not belong to you" });
    return;
  }

  try {
    const transcript = await transcribeRecording(body.data.audioObjectPath);
    res.json(TranscribeAudioResponse.parse({ transcript }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to transcribe voice recording");
    res.status(502).json({ error: "We could not transcribe this recording. Please try again." });
  }
});

async function transcribeRecording(audioObjectPath: string): Promise<string> {
    const audio = await objectStorage.readAudio(audioObjectPath);
    const form = new FormData();
    form.append("model_id", "scribe_v1");
    form.append("language_code", "eng");
    form.append(
      "file",
      new Blob([Uint8Array.from(audio.data)], { type: audio.contentType }),
      "shuut-recording",
    );
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`ElevenLabs rejected transcription (${response.status})`);
    }
    const result = await response.json() as { text?: string };
    const transcript = result.text?.trim() ?? "";
    if (!transcript) throw new Error("Transcription was empty");
    return transcript;
}

router.get("/storage/objects/*path", async (req, res): Promise<void> => {
  try {
    const raw = req.params.path;
    const path = Array.isArray(raw) ? raw.join("/") : raw;
    const metadata = await objectStorage.stream(`/objects/${path}`);
    const rangeHeader = req.headers.range;
    let range: { start: number; end: number } | undefined;
    if (rangeHeader && metadata.size > 0) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match) {
        res.setHeader("Content-Range", `bytes */${metadata.size}`);
        res.sendStatus(416);
        return;
      }
      const requestedStart = match[1] ? Number(match[1]) : undefined;
      const requestedEnd = match[2] ? Number(match[2]) : undefined;
      const start = requestedStart ?? Math.max(0, metadata.size - (requestedEnd ?? 0));
      const end = Math.min(requestedEnd ?? metadata.size - 1, metadata.size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= metadata.size) {
        res.setHeader("Content-Range", `bytes */${metadata.size}`);
        res.sendStatus(416);
        return;
      }
      range = { start, end };
    }
    const object = range ? await objectStorage.stream(`/objects/${path}`, range) : metadata;
    res.setHeader("Content-Type", object.contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Accept-Ranges", "bytes");
    if (range) {
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${object.size}`);
      res.setHeader("Content-Length", range.end - range.start + 1);
    } else if (object.size) {
      res.setHeader("Content-Length", object.size);
    }
    Readable.fromWeb(object.body as ReadableStream<Uint8Array>).pipe(res);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

router.post("/posts", async (req, res): Promise<void> => {
  await ensureSeeded();
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const body = CreatePostBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const author = await currentFounder(userId);
  if (!author) {
    res.status(404).json({ error: "Founder not found" });
    return;
  }
  let audioObjectPath: string | null = null;
  if (body.data.audioObjectPath) {
    const [pendingUpload] = await db
      .select()
      .from(profileImageUploadsTable)
      .where(and(
        eq(profileImageUploadsTable.objectPath, body.data.audioObjectPath),
        eq(profileImageUploadsTable.userId, userId),
      ))
      .limit(1);
    if (!pendingUpload) {
      await auditSecurityEvent(req, "audio_denial", userId, { reason: "upload_not_owned" });
      res.status(403).json({ error: "This voice recording does not belong to you" });
      return;
    }
    try {
      await objectStorage.publishAudio(body.data.audioObjectPath, userId);
      audioObjectPath = body.data.audioObjectPath;
    } catch {
      res.status(400).json({ error: "The voice recording could not be verified" });
      return;
    }
  }
  if (!body.data.audioObjectPath) {
    await auditSecurityEvent(req, "publish_denied", userId, { reason: "missing_audio" });
    res.status(400).json({ error: "An audio recording is required to publish." });
    return;
  }
  const [created] = await db
    .insert(postsTable)
    .values({
      authorId: author.id,
      transcript: body.data.transcript ?? "",
      transcriptionStatus: body.data.transcript ? "ready" : "processing",
      durationSeconds: body.data.durationSeconds,
      audioUrl: audioObjectPath,
    })
    .returning();
  if (audioObjectPath) {
    await db.delete(profileImageUploadsTable).where(and(
      eq(profileImageUploadsTable.objectPath, audioObjectPath),
      eq(profileImageUploadsTable.userId, userId),
    ));
  }
  await auditSecurityEvent(req, "publish", userId, { postId: created.id });
  res.status(201).json(CreatePostResponse.parse(postJson(created, author, author.id)));
  if (!body.data.transcript && audioObjectPath) {
    void transcribeRecording(audioObjectPath)
      .then(async (transcript) => {
        await db.update(postsTable)
          .set({ transcript, transcriptionStatus: "ready" })
          .where(eq(postsTable.id, created.id));
      })
      .catch(async (error) => {
        req.log.error({ err: error, postId: created.id }, "Background transcription failed");
        await db.update(postsTable)
          .set({ transcriptionStatus: "failed" })
          .where(eq(postsTable.id, created.id));
      });
  }
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
  const viewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  res.json(GetPostResponse.parse(postJson(post, author, viewer?.id)));
});

router.get("/posts/:postId/comments", async (req, res): Promise<void> => {
  const params = GetPostCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db.select().from(commentsTable)
    .where(and(
      eq(commentsTable.postId, params.data.postId),
      eq(commentsTable.transcriptionStatus, "ready"),
    ))
    .orderBy(asc(commentsTable.createdAt));
  const authors = rows.length
    ? await db.select().from(foundersTable)
      .where(inArray(foundersTable.id, [...new Set(rows.map((row) => row.authorId))]))
    : [];
  const byId = new Map(authors.map((author) => [author.id, author]));
  res.json(GetPostCommentsResponse.parse(
    rows.flatMap((row) => {
      const author = byId.get(row.authorId);
      return author ? [commentJson(row, author)] : [];
    }),
  ));
});

router.post("/posts/:postId/comments", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  const params = CreatePostCommentParams.safeParse(req.params);
  const body = CreatePostCommentBody.safeParse(req.body);
  if (!userId || !params.success || !body.success) {
    res.status(userId ? 400 : 401).json({ error: userId ? "Invalid voice comment" : "Unauthorized" });
    return;
  }
  const limit = await consumeRateLimit(
    `voice-comment:${privacyHash(userId)}`,
    20,
    60 * 60 * 1000,
  );
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    res.status(429).json({ error: "Too many voice comments. Please try again later." });
    return;
  }
  const author = await currentFounder(userId);
  const [post] = await db.select().from(postsTable)
    .where(and(eq(postsTable.id, params.data.postId), eq(postsTable.transcriptionStatus, "ready")))
    .limit(1);
  if (!author || !post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const [pendingUpload] = await db.select().from(profileImageUploadsTable)
    .where(and(
      eq(profileImageUploadsTable.objectPath, body.data.audioObjectPath),
      eq(profileImageUploadsTable.userId, userId),
    ))
    .limit(1);
  if (!pendingUpload) {
    await auditSecurityEvent(req, "audio_denial", userId, { reason: "comment_upload_not_owned" });
    res.status(403).json({ error: "This voice recording does not belong to you" });
    return;
  }
  try {
    await objectStorage.publishAudio(body.data.audioObjectPath, userId);
  } catch {
    res.status(400).json({ error: "The voice recording could not be verified" });
    return;
  }
  let created: CommentRow;
  try {
    [created] = await db.insert(commentsTable).values({
      postId: post.id,
      authorId: author.id,
      audioUrl: body.data.audioObjectPath,
      durationSeconds: body.data.durationSeconds,
    }).returning();
  } catch (error) {
    await objectStorage.deleteObject(body.data.audioObjectPath).catch((storageError) => {
      req.log.error({ err: storageError }, "Could not roll back unpublished comment recording");
    });
    throw error;
  }
  await db.delete(profileImageUploadsTable).where(and(
    eq(profileImageUploadsTable.objectPath, body.data.audioObjectPath),
    eq(profileImageUploadsTable.userId, userId),
  ));
  await auditSecurityEvent(req, "voice_comment_created", userId, {
    postId: post.id,
    commentId: created.id,
  });
  res.status(202).json(CreatePostCommentResponse.parse({ id: created.id, status: "processing" }));
  void transcribeRecording(created.audioUrl)
    .then(async (transcript) => {
      await db.update(commentsTable)
        .set({ transcript, transcriptionStatus: "ready" })
        .where(eq(commentsTable.id, created.id));
    })
    .catch(async (error) => {
      req.log.error({ err: error, commentId: created.id }, "Background comment transcription failed");
      try {
        await objectStorage.deleteObject(created.audioUrl);
      } catch (storageError) {
        req.log.warn({ err: storageError, commentId: created.id }, "Could not remove failed comment recording");
      }
      await db.delete(commentsTable).where(eq(commentsTable.id, created.id));
    });
});

router.get("/comments/:commentId/audio", async (req, res): Promise<void> => {
  const params = GetCommentAudioParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [comment] = await db.select().from(commentsTable)
    .where(and(
      eq(commentsTable.id, params.data.commentId),
      eq(commentsTable.transcriptionStatus, "ready"),
    ))
    .limit(1);
  if (!comment) {
    res.status(404).json({ error: "Audio not found" });
    return;
  }
  try {
    const metadata = await objectStorage.streamPrivate(comment.audioUrl);
    res.setHeader("Content-Type", metadata.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Accept-Ranges", "bytes");
    if (metadata.size) res.setHeader("Content-Length", metadata.size);
    Readable.fromWeb(metadata.body as ReadableStream<Uint8Array>).pipe(res);
  } catch {
    res.status(404).json({ error: "Audio not found" });
  }
});

router.post("/posts/:postId/share-link", async (req, res): Promise<void> => {
  const params = CreatePostShareLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [post] = await db
    .select({ id: postsTable.id, transcriptionStatus: postsTable.transcriptionStatus })
    .from(postsTable)
    .where(eq(postsTable.id, params.data.postId))
    .limit(1);
  if (!post || post.transcriptionStatus !== "ready") {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  const token = createPostShareToken(post.id);
  res.json(
    CreatePostShareLinkResponse.parse({
      url: `https://shuut.me/p/${post.id}?t=${encodeURIComponent(token)}`,
    }),
  );
});

router.patch("/posts/:postId", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  const params = UpdatePostParams.safeParse(req.params);
  const body = UpdatePostBody.safeParse(req.body);
  if (!userId || !params.success || !body.success) {
    res.status(userId ? 400 : 401).json({ error: userId ? "Invalid post edit" : "Unauthorized" });
    return;
  }
  const founder = await currentFounder(userId);
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (!founder || post.authorId !== founder.id) {
    res.status(403).json({ error: "You can only edit your own posts" });
    return;
  }
  if (Date.now() > post.createdAt.getTime() + POST_EDIT_WINDOW_MS) {
    res.status(409).json({ error: "The 30-second editing window has closed" });
    return;
  }
  const [updated] = await db.update(postsTable)
    .set({ transcript: body.data.transcript.trim() })
    .where(eq(postsTable.id, post.id))
    .returning();
  res.json(UpdatePostResponse.parse(postJson(updated, founder, founder.id)));
});

router.delete("/posts/:postId", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = DeletePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const founder = await currentFounder(userId);
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, params.data.postId));
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  if (!founder || post.authorId !== founder.id) {
    res.status(403).json({ error: "You can only delete your own posts" });
    return;
  }
  const commentRecordings = await db.select({ objectPath: commentsTable.audioUrl })
    .from(commentsTable)
    .where(eq(commentsTable.postId, post.id));
  if (post.audioUrl?.startsWith("/objects/uploads/")) {
    try {
      await objectStorage.deleteObject(post.audioUrl);
    } catch (error) {
      req.log.error({ err: error, postId: post.id }, "Could not remove post recording");
      res.status(500).json({ error: "The post recording could not be removed" });
      return;
    }
  }
  for (const recording of commentRecordings) {
    try {
      await objectStorage.deleteObject(recording.objectPath);
    } catch (error) {
      req.log.error({ err: error, postId: post.id }, "Could not remove post comment recording");
      res.status(500).json({ error: "A comment recording could not be removed" });
      return;
    }
  }
  await db.delete(postsTable).where(eq(postsTable.id, post.id));
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
    rocket: current.rocket,
    laughing: current.laughing,
    thumbsDown: current.thumbsDown,
  };
  const key = body.data.emojiType;
  const old = current.viewerReaction && current.viewerReaction in counts
    ? current.viewerReaction as keyof typeof counts
    : null;
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
  const viewer = await currentFounder(getAuthenticatedUserId(req) ?? "");
  if (!viewer) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [updated] = await db
    .update(postsTable)
    .set({ isReshuuted: true, reshuutedBy: viewer.name })
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

router.delete("/account", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const founder = await currentFounder(userId);
  const posts = founder
    ? await db
        .select({ id: postsTable.id, objectPath: postsTable.audioUrl })
        .from(postsTable)
        .where(eq(postsTable.authorId, founder.id))
    : [];
  const commentRecordings = founder
    ? await db
        .select({ objectPath: commentsTable.audioUrl })
        .from(commentsTable)
        .where(or(
          eq(commentsTable.authorId, founder.id),
          ...(posts.length ? [inArray(commentsTable.postId, posts.map((post) => post.id))] : []),
        ))
    : [];
  const pendingUploads = await db
    .select({ objectPath: profileImageUploadsTable.objectPath })
    .from(profileImageUploadsTable)
    .where(eq(profileImageUploadsTable.userId, userId));
  const accountObjects = [
    ...(founder?.avatarObjectPath ? [founder.avatarObjectPath] : []),
    ...[...posts, ...commentRecordings].flatMap((recording) =>
      recording.objectPath?.startsWith("/objects/uploads/") ? [recording.objectPath] : [],
    ),
    ...pendingUploads.map((upload) => upload.objectPath),
  ];
  for (const objectPath of accountObjects) {
    try {
      await objectStorage.deleteObject(objectPath);
    } catch (error) {
      req.log.error({ err: error, objectPath }, "Could not remove account object");
      res.status(500).json({ error: "An account recording or image could not be removed" });
      return;
    }
  }
  if (founder) {
    await db.delete(foundersTable).where(eq(foundersTable.id, founder.id));
  }
  await db
    .delete(profileImageUploadsTable)
    .where(eq(profileImageUploadsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  clearSessionCookie(res);
  res.status(204).send();
});

export default router;
