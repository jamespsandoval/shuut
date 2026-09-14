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

export class ObjectStorageService {
  privateDir() {
    const value = process.env.PRIVATE_OBJECT_DIR;
    if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return value.replace(/\/$/, "");
  }

  async createUpload(contentLength: number, contentType: string) {
    const fullPath = `${this.privateDir()}/uploads/${randomUUID()}`;
    const { bucketName, objectName } = parsePath(fullPath);
    const file = storage.bucket(bucketName).file(objectName);
    const [uploadURL] = await file.createResumableUpload({
      metadata: {
        contentLength,
        contentType,
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
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

  async deleteObject(objectPath: string) {
    if (!/^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath)) return;
    const relative = objectPath.replace(/^\/objects\//, "");
    const { bucketName, objectName } = parsePath(`${this.privateDir()}/${relative}`);
    await storage.bucket(bucketName).file(objectName).delete({ ignoreNotFound: true });
  }

  async stream(objectPath: string) {
    const file = await this.getFile(objectPath);
    const policy = await getObjectAclPolicy(file);
    if (policy?.visibility !== "public") throw new Error("Object not found");
    const [metadata] = await file.getMetadata();
    return {
      body: Readable.toWeb(file.createReadStream()) as ReadableStream,
      contentType: String(metadata.contentType || "application/octet-stream"),
      size: metadata.size ? String(metadata.size) : undefined,
    };
  }
}