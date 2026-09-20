import { desc, eq } from "drizzle-orm";
import { db, legalPolicyAcceptancesTable } from "@workspace/db";
import type { Request, Response } from "express";
import { getAuthenticatedUserId } from "../middlewares/sessionAuth";

export const CURRENT_LEGAL_POLICY_VERSIONS = {
  terms: "2026-09-20",
  communityGuidelines: "2026-09-20",
} as const;
export const CURRENT_LEGAL_POLICY_CONTENT_HASHES = {
  terms: "sha256:94d4b3c13c4ae1b8ad25f72ad956da9f8c6e0423b31eff560162238c8653ce93",
  communityGuidelines: "sha256:ba8c263b3d84df6a8a9b1173c46fd4db0d2fe183c29c4fe2bc4ed61897ca8a0a",
} as const;

export type LegalPolicyKey = keyof typeof CURRENT_LEGAL_POLICY_VERSIONS;
export type LegalPolicySource = "web" | "native" | "ios" | "android";

export async function getLegalPolicyStatus(userId: string) {
  const accepted = await db
    .select({
      policyKey: legalPolicyAcceptancesTable.policyKey,
      policyVersion: legalPolicyAcceptancesTable.policyVersion,
      acceptedAt: legalPolicyAcceptancesTable.acceptedAt,
    })
    .from(legalPolicyAcceptancesTable)
    .where(eq(legalPolicyAcceptancesTable.userId, userId))
    .orderBy(desc(legalPolicyAcceptancesTable.acceptedAt));

  const latest = new Map<string, (typeof accepted)[number]>();
  for (const record of accepted) {
    if (!latest.has(record.policyKey)) latest.set(record.policyKey, record);
  }

  const policyStatus = (policyKey: LegalPolicyKey) => {
    const record = latest.get(policyKey);
    const currentVersion = CURRENT_LEGAL_POLICY_VERSIONS[policyKey];
    const currentRecord = accepted.find(
      (candidate) => candidate.policyKey === policyKey && candidate.policyVersion === currentVersion,
    );
    return {
      currentVersion,
      acceptedVersion: currentRecord?.policyVersion ?? record?.policyVersion ?? null,
      acceptedAt: currentRecord?.acceptedAt?.toISOString() ?? record?.acceptedAt?.toISOString() ?? null,
      current: Boolean(currentRecord),
    };
  };

  const terms = policyStatus("terms");
  const communityGuidelines = policyStatus("communityGuidelines");
  return {
    required: !(terms.current && communityGuidelines.current),
    terms,
    communityGuidelines,
  };
}

export async function hasCurrentLegalPolicyConsent(userId: string) {
  const status = await getLegalPolicyStatus(userId);
  return !status.required;
}

export async function requireCurrentLegalPolicyConsent(req: Request, res: Response) {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!(await hasCurrentLegalPolicyConsent(userId))) {
    res.status(403).json({
      error: "Accept the current Terms of Service and Community Guidelines to continue.",
      code: "LEGAL_POLICY_CONSENT_REQUIRED",
    });
    return false;
  }
  return true;
}
