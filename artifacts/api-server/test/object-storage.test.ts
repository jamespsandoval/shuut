import assert from "node:assert/strict";
import test from "node:test";
import type { Storage } from "@google-cloud/storage";
import { ObjectStorageService } from "../src/lib/objectStorage";

test("evidence copy and cleanup resolve to the same private object key", async () => {
  const previousPrivateDir = process.env.PRIVATE_OBJECT_DIR;
  process.env.PRIVATE_OBJECT_DIR = "/test-bucket/private";

  const copied: Array<{ bucket: string; source: string; destination: string }> = [];
  const deleted: Array<{ bucket: string; objectName: string; ignoreNotFound: boolean }> = [];

  const fakeStorage = {
    bucket(bucketName: string) {
      return {
        file(objectName: string) {
          return {
            name: objectName,
            async copy(destination: { name: string }) {
              copied.push({ bucket: bucketName, source: objectName, destination: destination.name });
            },
            async delete(options: { ignoreNotFound: boolean }) {
              deleted.push({ bucket: bucketName, objectName, ignoreNotFound: options.ignoreNotFound });
            },
          };
        },
      };
    },
  } as unknown as Pick<Storage, "bucket">;

  try {
    const service = new ObjectStorageService(fakeStorage);
    const evidencePath = await service.copyToEvidence("/objects/uploads/source-recording");
    assert.match(evidencePath, /^\/objects\/evidence\/[A-Za-z0-9-]+$/);
    assert.equal(copied.length, 1);
    assert.deepEqual(
      { bucket: copied[0].bucket, source: copied[0].source },
      { bucket: "test-bucket", source: "private/uploads/source-recording" },
    );
    assert.match(copied[0].destination, /^private\/evidence\/[A-Za-z0-9-]+$/);

    await service.deleteEvidence(evidencePath);
    assert.deepEqual(deleted, [{
      bucket: "test-bucket",
      objectName: copied[0].destination,
      ignoreNotFound: true,
    }]);
  } finally {
    if (previousPrivateDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = previousPrivateDir;
  }
});