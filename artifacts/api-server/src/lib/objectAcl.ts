import type { File } from "@google-cloud/storage";

const ACL_KEY = "custom:aclPolicy";

export type ObjectAclPolicy = {
  owner: string;
  visibility: "public" | "private";
};

export async function setObjectAclPolicy(file: File, policy: ObjectAclPolicy) {
  const [exists] = await file.exists();
  if (!exists) throw new Error("Object not found");
  await file.setMetadata({ metadata: { [ACL_KEY]: JSON.stringify(policy) } });
}

export async function getObjectAclPolicy(file: File): Promise<ObjectAclPolicy | null> {
  const [metadata] = await file.getMetadata();
  const value = metadata.metadata?.[ACL_KEY];
  return value ? JSON.parse(String(value)) : null;
}