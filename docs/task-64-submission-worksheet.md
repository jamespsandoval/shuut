# Task 64 — App Store submission worksheet

**As of:** 20 September 2026  
**Scope:** release-owner worksheet. Repository observations are evidence, not
confirmation that Apple’s forms, vendor contracts, TestFlight, or legal review
have been completed.

## Privacy label worksheet

Use the fuller source table in [`privacy-label-inputs.md`](privacy-label-inputs.md).
The following are proposed answers to transcribe into the current App Store
Connect form; every ASC checkbox remains manual:

| Data family | Collected | Linked | Tracking | Purpose(s) | Vendor | Retention/deletion evidence | Manual ASC/vendor/legal check |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Email/account/authentication | Yes | Yes | No | App functionality, authentication, support | SHÜÜT; Postmark | Account deletion cleanup; Postmark default 45-day message/activity retention, with suppression/aggregate and backup/legal exceptions | ☐ ASC ☐ capture Postmark account settings |
| Name/profile/avatar | Yes | Yes | No | App functionality, personalization, safety | SHÜÜT; Replit App Storage/Google Cloud | Avatar/profile cleanup queued on deletion; no public project-applicable backup purge or object-deletion SLA | ☐ ASC ☐ capture deployment/storage terms |
| Voice recordings and comments | Yes | Yes | No | App functionality; Other Purposes (provider model improvement unless opt-out evidenced); moderation and appeals | SHÜÜT storage; ElevenLabs after consent | Active-content lifecycle; 30-day SHÜÜT appeal hold; no self-serve inactivity deletion promise or public numeric backup purge period | ☐ ASC ☐ obtain applicable UK/EEA terms and account data-use setting |
| Transcript text | Yes | Yes | No | App functionality; safety; Other Purposes where provider terms permit model improvement | SHÜÜT; OpenAI via Replit-managed integrations; ElevenLabs transcript output | Removed from SHÜÜT after cleanup; default upstream abuse logs may retain content up to 30 days, but managed-integration controls are not publicly proven | ☐ ASC ☐ capture Replit AI terms/settings |
| Reports/moderation/security/legal records | Yes when generated | Usually yes | No | Safety, fraud prevention, legal compliance | SHÜÜT and relevant providers | May be retained/anonymized as needed | ☐ ASC ☐ legal review |
| Technical/usage data | Yes as generated | May be | No | App functionality, security | SHÜÜT infrastructure | Schedule requires operational confirmation | ☐ ASC ☐ hosting review |

SHÜÜT does not sell personal data, serve ads, or use tracking. Provider-held
copies and backups may not be immediately deleted: current provider calls
expose no per-request deletion ID. This limitation must be reflected in final
privacy/legal review rather than softened.

## Age rating recommendations

Recommended initial questionnaire answers: **18+ audience**; user-generated
content **Yes**; user-generated content with unrestricted web access **answer
according to the current Apple question and final access design**; frequent
or intense mature themes/profanity/sexual content/violence/drugs/gambling:
**No as a product feature**, while acknowledging that prohibited UGC can be
submitted and is subject to moderation. No gambling, purchases, ads, or
health/medical claims are evidenced here. The release owner must answer every
current Apple questionnaire manually based on the final build and policy:
**☐ unchecked**.

Evidence: community guidelines prohibit hate, harassment, child sexual abuse
material, terrorism promotion, non-consensual explicit media, illegal acts,
spam, and abuse; report/block, moderation, and appeals are described in the
policy and reviewer notes. This is a recommendation, not a completed rating.

## Build identity audit

| Item | Repository observation | Release-owner verification |
| --- | --- | --- |
| Display name | SHÜÜT in native Expo config and public UI | ☐ Confirm archived/TestFlight display name |
| Icon | `artifacts/shuut-native/assets/images/icon.png`; verified 1024×1024 RGB PNG with no alpha | ☐ Confirm packaged iOS icon in archive/ASC |
| Version | Native config version **1.0.0**; iOS build **1** | ☐ Confirm archived/TestFlight marketing version and build |
| Bundle ID | Native config target: **com.doubleportrait.shuut** | ☐ Confirm Apple Developer/ASC identifier |
| Permissions | Microphone rationale: record only when the user chooses a voice post/comment and review before publishing. Photo-library rationale: choose a profile image. | ☐ Test microphone/photo permission prompts on physical iPhone |
| Legal URLs | `https://shuut.me/terms`, `/privacy`, `/community`, `/contact` | ☐ Production/legal owner review |
| API | Centralized production API: **https://shuut.me** (EAS production/preview env configuration) | ☐ Confirm archived/TestFlight production endpoint; no dev bypass |
| EAS project/signing | EAS build configuration is present; project linking, Apple credentials, provisioning, and signing are not proven by repository files | ☐ Link project and verify signing in EAS/ASC |

The repository does not by itself prove the archived native build identity,
production endpoint configuration, EAS project linking/signing, or TestFlight
behavior. Every ASC/TestFlight, archive, EAS, vendor, legal, and device
verification cell above remains **unchecked** until manually evidenced.

## UGC, safety, and support gate

- ☐ Create account through real email OTP and secure reviewer inbox.
- ☐ Record, review, and explicitly publish a voice post; verify 90-second cap.
- ☐ Confirm consent prompt precedes protected voice-AI operation and microphone
  permission follows the user’s recording action.
- ☐ Observe asynchronous transcription and moderation pending/completed states.
- ☐ Report a post/comment; verify case/support response path.
- ☐ Block and unblock a profile; verify resulting visibility/action state.
- ☐ Open an appeal for an applicable moderation case and confirm support path.
- ☐ Revoke voice-AI consent; verify no future audio is sent.
- ☐ Exercise account deletion and record queued, cleanup, and completed states.
- ☐ Confirm support URL, privacy URL, and legal pages in production.
- ☐ Confirm the known provider deletion limitation is accurately disclosed.

## Final manual checklist

- ☐ App Store name availability, metadata, screenshots, rating, and privacy
  answers completed in ASC.
- ☐ Reviewer email and inbox access entered only in ASC secure fields; follow the [App Review email sign-in handoff](app-review-email-sign-in.md) and verify it on the selected build.
- ☐ TestFlight build installed on a physical iPhone; no development bypass.
- ☐ Production API, auth, email OTP, microphone permission, and legal URLs pass.
- ☐ Vendor contracts/retention/deletion and international processing reviewed.
- ☐ Account-level evidence in `provider-privacy-verification.md` captured; no
  optional DPA, region, deletion API, training opt-out, or zero-retention
  control inferred from public availability alone.
- ☐ ElevenLabs UK/EEA business terms, applicable DPA, plan, and Data use
  setting supplied; the uploaded non-EEA terms are not sufficient for a UK
  operator.
- ☐ Apple privacy label columns reconciled with current ASC UI.
- ☐ Accessibility, crash-free launch, and network/offline behavior reviewed.
- ☐ Physical-iPhone interruption matrix in
  `docs/task-63-interruption-policy-device-test-matrix.md` is explicitly
  acknowledged as **NOT YET RUN** until executed; do not mark it passed.
- ☐ Release owner signs off on unresolved evidence and provider limitations.