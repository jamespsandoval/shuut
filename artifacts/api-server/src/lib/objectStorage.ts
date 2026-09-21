import { randomUUID } from "crypto";
import { Readable } from "stream";
import { Storage, type File } from "@google-cloud/storage";
import { getObjectAclPolicy, setObjectAclPolicy, type ObjectAclPolicy } from "./objectAcl";

const SIDECAR = "http://127.0.0.1:1106";
export const SIGNED_UPLOAD_TTL_MS = 15 * 60 * 1000;
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

export class ObjectStorageService {
  constructor(private readonly storageClient: Pick<Storage, "bucket"> = storage) {}

  privateDir() {
    const value = process.env.PRIVATE_OBJECT_DIR;
    if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return value.replace(/\/$/, "");
  }

  async createUpload(contentLength: number, contentType: string) {
    const fullPath = `${this.privateDir()}/uploads/${randomUUID()}`;
    const { objectName } = parsePath(fullPath);
    const objectPath = `/objects/uploads/${objectName.split("/").at(-1)}`;
    return { uploadURL: "", objectPath, contentLength, contentType };
  }

  async saveUpload(objectPath: string, data: Buffer, contentType: string) {
    if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) throw new Error("Invalid object path");
    const relative = objectPath.replace(/^\/objects\//, "");
    const { bucketName, objectName } = parsePath(`${this.privateDir()}/${relative}`);
    await this.storageClient.bucket(bucketName).file(objectName).save(data, {
      resumable: false,
      contentType,
      metadata: { contentType },
    });
  }

  async getFile(objectPath: string): Promise<File> {
    if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) throw new Error("Invalid object path");
    const relative = objectPath.replace(/^\/objects\//, "");
    const { bucketName, objectName } = parsePath(`${this.privateDir()}/${relative}`);
    const file = this.storageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new Error("Object not found");
    return file;
  }

  async copyToEvidence(objectPath: string): Promise<string> {
    if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) {
      throw new Error("Invalid source object path");
    }
    const sourceRelative = objectPath.replace(/^\/objects\//, "");
    const { bucketName, objectName } = parsePath(`${this.privateDir()}/${sourceRelative}`);
    const evidenceId = randomUUID();
    const evidencePath = `/objects/evidence/${evidenceId}`;
    const evidenceRelative = evidencePath.replace(/^\/objects\//, "");
    const destinationLocation = parsePath(`${this.privateDir()}/${evidenceRelative}`);
    if (destinationLocation.bucketName !== bucketName) {
      throw new Error("Evidence destination bucket does not match source bucket");
    }
    const destination = this.storageClient.bucket(bucketName).file(destinationLocation.objectName);
    await this.storageClient.bucket(bucketName).file(objectName).copy(destination);
    return evidencePath;
  }

  async deleteEvidence(objectPath: string): Promise<void> {
    if (!/^\/objects\/evidence\/[A-Za-z0-9-]+$/.test(objectPath)) return;
    const relative = objectPath.replace(/^\/objects\//, "");
    const { bucketName, objectName } = parsePath(`${this.privateDir()}/${relative}`);
    await this.storageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
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

  async publishImage(objectPath: string, owner: string) {
    const file = await this.getFile(objectPath);
    const [metadata] = await file.getMetadata();
    const contentType = String(metadata.contentType || "");
    const size = Number(metadata.size || 0);
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType) || size < 1 || size > 15_000_000) {
      throw new Error("Invalid post image");
    }
    await setObjectAclPolicy(file, { owner, visibility: "private" });
  }

  async deleteObject(objectPath: string) {
    if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) return;
    const relative = objectPath.replace(/^\/objects\//, "");
    const { bucketName, objectName } = parsePath(`${this.privateDir()}/${relative}`);
    await this.storageClient.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
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