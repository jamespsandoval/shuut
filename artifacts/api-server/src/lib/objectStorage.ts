import { randomUUID } from "crypto";
import { Readable } from "stream";
import { Storage, type File } from "@google-cloud/storage";
import { getObjectAclPolicy, setObjectAclPolicy, type ObjectAclPolicy } from "./objectAcl";

const SIDECAR = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parsePath(path: string) {
  const parts = path.replace(/^\//, "").split("/");
  if (parts.length < 2) throw new Error("Invalid object path");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function signedPutUrl(bucketName: string, objectName: string): Promise<string> {
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Could not create upload URL (${response.status})`);
  }
  const payload = await response.json() as { signed_url?: string };
  if (!payload.signed_url) throw new Error("Upload URL was not returned");
  return payload.signed_url;
}

export class ObjectStorageService {
  privateDir() {
    const value = process.env.PRIVATE_OBJECT_DIR;
    if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return value.replace(/\/$/, "");
  }

  async createUpload(contentLength: number, contentType: string) {
    const fullPath = `${this.privateDir()}/uploads/${randomUUID()}`;
    const { bucketName, objectName } = parsePath(fullPath);
    void contentLength;
    void contentType;
    const uploadURL = await signedPutUrl(bucketName, objectName);
    return { uploadURL, objectPath: `/objects/uploads/${objectName.split("/").at(-1)}` };
  }

  async getFile(objectPath: string): Promise<File> {
    if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) throw new Error("Invalid object path");
    const relative = objectPath.replace(/^\/objects\//, "");
    const { bucketName, objectName } = parsePath(`${this.privateDir()}/${relative}`);
    const file = storage.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new Error("Object not found");
    return file;
  }

  async setAcl(objectPath: string, policy: ObjectAclPolicy) {
    const file = await this.getFile(objectPath);
    const [metadata] = await file.getMetadata();
    const contentType = String(metadata.contentType || "");
    const size = Number(metadata.size || 0);
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType) || size < 1 || size > 3_000_000) {
      await file.delete({ ignoreNotFound: true });
      throw new Error("Invalid profile image");
    }
    await setObjectAclPolicy(file, policy);
  }

  async readAudio(objectPath: string) {
    const file = await this.getFile(objectPath);
    const [metadata] = await file.getMetadata();
    const contentType = String(metadata.contentType || "");
    const size = Number(metadata.size || 0);
    if (
      !["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"].includes(contentType) ||
      size < 1 ||
      size > 15_000_000
    ) {
      throw new Error("Invalid voice recording");
    }
    const [data] = await file.download();
    return { data, contentType };
  }

  async publishAudio(objectPath: string, owner: string) {
    const file = await this.getFile(objectPath);
    await this.readAudio(objectPath);
    // Audio is always private. Playback is authorized by the post-scoped API
    // route rather than by exposing a public storage ACL.
    await setObjectAclPolicy(file, { owner, visibility: "private" });
  }

  async deleteObject(objectPath: string) {
    if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) return;
    const relative = objectPath.replace(/^\/objects\//, "");
    const { bucketName, objectName } = parsePath(`${this.privateDir()}/${relative}`);
    await storage.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
  }

  async stream(objectPath: string, range?: { start: number; end: number }) {
    const file = await this.getFile(objectPath);
    const policy = await getObjectAclPolicy(file);
    if (policy?.visibility !== "public") throw new Error("Object not found");
    return this.streamFile(file, range);
  }

  async streamPrivate(objectPath: string, range?: { start: number; end: number }) {
    const file = await this.getFile(objectPath);
    return this.streamFile(file, range);
  }

  private async streamFile(file: File, range?: { start: number; end: number }) {
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size || 0);
    return {
      body: Readable.toWeb(file.createReadStream(range)) as ReadableStream,
      contentType: String(metadata.contentType || "application/octet-stream"),
      size,
    };
  }
}