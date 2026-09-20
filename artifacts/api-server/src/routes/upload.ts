import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, profileImageUploadsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { digestUploadToken, verifyUploadToken } from "../lib/uploadToken";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const audioTypes = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"]);
const maxSize = 15_000_000;

function magicMatches(type: string, data: Buffer) {
  if (type === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (type === "image/png") return data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/webp") return data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  if (type === "audio/mp4") return data.length >= 8 && data.toString("ascii", 4, 8) === "ftyp";
  if (type === "audio/webm") return data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (type === "audio/mpeg") return data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0;
  if (type === "audio/ogg") return data.toString("ascii", 0, 4) === "OggS";
  return false;
}

router.put("/uploads/put", async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const claims = verifyUploadToken(token);
  const contentType = req.header("content-type")?.split(";", 1)[0] ?? "";
  const declaredLength = Number(req.header("content-length"));
  if (!claims || contentType !== claims.contentType || !Number.isSafeInteger(declaredLength)
    || declaredLength !== claims.size || declaredLength < 1 || declaredLength > maxSize
    || (!imageTypes.has(contentType) && !audioTypes.has(contentType))) {
    res.status(400).json({ error: "Invalid upload authorization or content" });
    return;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += part.length;
    if (total > claims.size || total > maxSize) {
      res.status(413).json({ error: "Upload is too large" });
      return;
    }
    chunks.push(part);
  }
  const data = Buffer.concat(chunks);
  if (data.length !== claims.size || !magicMatches(contentType, data)) {
    res.status(400).json({ error: "Upload content does not match its declared type" });
    return;
  }
  try {
    // Claim the token exactly once. The conditional UPDATE is the concurrency
    // boundary: only one simultaneous PUT can proceed for a given token.
    const [claimed] = await db.update(profileImageUploadsTable)
      .set({ uploadTokenConsumedAt: new Date() })
      .where(and(
        eq(profileImageUploadsTable.objectPath, claims.objectPath),
        eq(profileImageUploadsTable.uploadTokenDigest, digestUploadToken(token)),
        isNull(profileImageUploadsTable.uploadTokenConsumedAt),
      ))
      .returning({ objectPath: profileImageUploadsTable.objectPath });
    if (!claimed) {
      res.status(409).json({ error: "Upload authorization has already been used or is invalid", code: "UPLOAD_TOKEN_USED" });
      return;
    }
    await storage.saveUpload(claims.objectPath, data, contentType);
    res.status(200).json({ objectPath: claims.objectPath });
  } catch {
    // The token is deliberately consumed before storage I/O. A failed write
    // must not make a signed authorization replayable; callers must request a
    // fresh URL. The pending row remains available to cleanup reconciliation.
    res.status(502).json({
      error: "Could not save upload; request a new upload authorization and retry",
      code: "UPLOAD_STORAGE_FAILED_RETRY_AUTH",
    });
  }
});

export default router;