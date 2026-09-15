import {
  db,
  privateObjectCleanupTable,
  profileImageUploadsTable,
} from "@workspace/db";
import { asc, eq, lt, lte } from "drizzle-orm";
import { logger } from "./logger";
import { ObjectStorageService } from "./objectStorage";

const objectStorage = new ObjectStorageService();
const CLEANUP_INTERVAL_MS = 30_000;
const CLEANUP_BATCH_SIZE = 25;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const PENDING_UPLOAD_TTL_MS = 20 * 60 * 1000;
let cleanupRunning = false;

function retryDelay(attempts: number) {
  return Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** Math.min(attempts, 10));
}

export function privateUploadPaths(paths: Array<string | null | undefined>) {
  return [...new Set(paths.filter(
    (path): path is string => Boolean(path?.startsWith("/objects/uploads/")),
  ))];
}

export async function queueExpiredPrivateUploads() {
  const cutoff = new Date(Date.now() - PENDING_UPLOAD_TTL_MS);
  return db.transaction(async (tx) => {
    const expired = await tx
      .delete(profileImageUploadsTable)
      .where(lt(profileImageUploadsTable.createdAt, cutoff))
      .returning({ objectPath: profileImageUploadsTable.objectPath });
    if (!expired.length) return 0;
    await tx
      .insert(privateObjectCleanupTable)
      .values(expired)
      .onConflictDoNothing();
    return expired.length;
  });
}

export async function processPrivateObjectCleanup(): Promise<number> {
  if (cleanupRunning) return 0;
  cleanupRunning = true;
  try {
    const due = await db
      .select()
      .from(privateObjectCleanupTable)
      .where(lte(privateObjectCleanupTable.nextAttemptAt, new Date()))
      .orderBy(asc(privateObjectCleanupTable.createdAt))
      .limit(CLEANUP_BATCH_SIZE);

    let removed = 0;
    for (const item of due) {
      try {
        await objectStorage.deleteObject(item.objectPath);
        await db
          .delete(privateObjectCleanupTable)
          .where(eq(privateObjectCleanupTable.objectPath, item.objectPath));
        removed += 1;
      } catch (error) {
        const attempts = item.attempts + 1;
        await db
          .update(privateObjectCleanupTable)
          .set({
            attempts,
            lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown cleanup error",
            nextAttemptAt: new Date(Date.now() + retryDelay(attempts)),
            updatedAt: new Date(),
          })
          .where(eq(privateObjectCleanupTable.objectPath, item.objectPath));
        logger.warn(
          { err: error, objectPath: item.objectPath, attempts },
          "Private object cleanup will be retried",
        );
      }
    }
    return removed;
  } finally {
    cleanupRunning = false;
  }
}

export function startPrivateObjectCleanupWorker() {
  const runPass = async () => {
    await queueExpiredPrivateUploads();
    await processPrivateObjectCleanup();
  };
  void runPass().catch((error) => {
    logger.error({ err: error }, "Private object cleanup startup pass failed");
  });
  const timer = setInterval(() => {
    void runPass().catch((error) => {
      logger.error({ err: error }, "Private object cleanup pass failed");
    });
  }, CLEANUP_INTERVAL_MS);
  timer.unref();
}