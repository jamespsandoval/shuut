import { readFile } from "node:fs/promises";
import path from "node:path";
import { Router, type IRouter } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, foundersTable, postsTable, usersTable } from "@workspace/db";
import { verifyPostShareToken } from "../lib/postShareToken";

const router: IRouter = Router();
const SITE_URL = "https://shuut.me";
const SITE_NAME = "SHÜÜT";
const DEFAULT_TITLE = "SHÜÜT — Say it. Share it.";
const DEFAULT_DESCRIPTION =
  "Short voice notes, clean transcripts, and honest ideas from people building what comes next.";
const OG_IMAGE_URL = `${SITE_URL}/shuut-social-preview.png`;
const MAX_DESCRIPTION_LENGTH = 180;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function transcriptExcerpt(transcript: string): string {
  const singleLine = transcript.replace(/\s+/g, " ").trim();
  if (singleLine.length <= MAX_DESCRIPTION_LENGTH) return singleLine;
  const shortened = singleLine.slice(0, MAX_DESCRIPTION_LENGTH - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, Math.max(lastSpace, 120)).trimEnd()}…`;
}

async function readSpaShell(): Promise<string> {
  const appRoot = path.resolve(
    process.cwd(),
    process.cwd().endsWith("api-server") ? "../shuut-app" : "artifacts/shuut-app",
  );
  const filePath =
    process.env.NODE_ENV === "production"
      ? path.join(appRoot, "dist/public/index.html")
      : path.join(appRoot, "index.html");
  return readFile(filePath, "utf8");
}

function replaceHeadMetadata(
  html: string,
  metadata: {
    title: string;
    description: string;
    canonicalUrl: string;
    robots: string;
  },
): string {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonicalUrl = escapeHtml(metadata.canonicalUrl);
  const imageUrl = escapeHtml(OG_IMAGE_URL);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${metadata.robots}" />`,
    `<link rel="canonical" href="${canonicalUrl}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:image" content="${imageUrl}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="SHÜÜT — say it, share it" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${imageUrl}" />`,
  ].join("\n    ");

  return html.replace(
    /<title>[\s\S]*?<\/title>[\s\S]*?(?=<link rel="icon"|<link rel="preconnect"|<\/head>)/,
    `${tags}\n    `,
  );
}

router.get("/p/:postId", async (req, res): Promise<void> => {
  const postId = Number(req.params.postId);
  const token = typeof req.query.t === "string" ? req.query.t : "";
  const tokenQuery = token ? `?t=${encodeURIComponent(token)}` : "";
  const canonicalUrl = `${SITE_URL}/p/${encodeURIComponent(req.params.postId)}${tokenQuery}`;
  let metadata = {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonicalUrl,
    robots: "noindex, nofollow",
  };

  if (
    Number.isSafeInteger(postId) &&
    postId > 0 &&
    verifyPostShareToken(postId, token)
  ) {
    const [result] = await db
      .select({
        transcript: postsTable.transcript,
        authorName: foundersTable.name,
      })
      .from(postsTable)
      .innerJoin(foundersTable, eq(foundersTable.id, postsTable.authorId))
      .leftJoin(usersTable, eq(usersTable.id, foundersTable.userId))
      .where(
        and(
          eq(postsTable.id, postId),
          eq(postsTable.transcriptionStatus, "ready"),
          eq(postsTable.deletionStatus, "active"),
          eq(postsTable.moderationStatus, "approved"),
          or(
            isNull(foundersTable.userId),
            eq(usersTable.deletionStatus, "active"),
          ),
        ),
      )
      .limit(1);

    if (result?.transcript.trim()) {
      metadata = {
        title: `${result.authorName} on SHÜÜT`,
        description: transcriptExcerpt(result.transcript),
        canonicalUrl,
        robots: "noindex, nofollow",
      };
    }
  }

  try {
    const html = replaceHeadMetadata(await readSpaShell(), metadata);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(html);
  } catch (error) {
    req.log.error({ err: error }, "Could not render social preview");
    res.status(500).send("SHÜÜT is temporarily unavailable");
  }
});

export default router;