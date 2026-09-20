# SHÜÜT privacy-label inputs

**Purpose and status:** This is an input for downstream App Store privacy-label review, not a submitted label. Confirm the final answers against the current store forms and vendor agreements.

## Data categories

| Category | Linked to the user? | Use/purpose | Provider or processor |
| --- | --- | --- | --- |
| Account/contact data (email and authentication details) | Yes | Account creation, authentication, support, service communications | SHÜÜT infrastructure; Postmark for email processing |
| Profile data (name, biography, avatar, profile preferences) | Yes | Profiles, personalization, account management, safety | SHÜÜT infrastructure; Replit App Storage backed by Google Cloud infrastructure for stored assets |
| User content, including private voice recordings | Yes while associated with content/account | Voice posts/comments, delivery, moderation, appeals, account operation | SHÜÜT infrastructure; Replit App Storage backed by Google Cloud infrastructure; ElevenLabs for speech-to-text after voice-AI consent |
| Generated transcript text | Yes while associated with content/account | Displaying transcripts, voice features, moderation and safety classification | SHÜÜT infrastructure; OpenAI models through Replit-managed AI integrations for automated safety classification |
| Moderation, report, security, audit, and legal records | Usually linked to the relevant account/content or report | Safety enforcement, appeals, abuse prevention, security, and legal compliance | SHÜÜT infrastructure and relevant service providers |
| Technical/usage data needed to provide and secure the service | May be linked through account/session identifiers | Authentication, reliability, fraud/abuse prevention, security, and operations | SHÜÜT infrastructure |

SHÜÜT does **not** sell personal data, serve ads, or use tracking. These inputs should not be interpreted as a claim that every category is collected on every device or in every flow.

## Retention and deletion

Recordings and transcripts remain while the related content/account is active. Unlinked private uploads are cleaned up after signed-upload expiry and retries. Source audio removed by moderation is retained for 30 days for appeal. Reports, moderation actions/sanctions, and security/audit/legal records may be retained or anonymized for safety or legal needs.

Account deletion queues private audio and avatar cleanup, then removes the profile, posts, comments, transcripts, current automated moderation jobs, and consent records after cleanup succeeds. Backups and provider-held copies follow applicable processor or legal schedules. Provider calls currently expose no per-request deletion ID; SHÜÜT therefore cannot promise immediate provider-side erasure. Revocation stops future voice processing and no new audio is sent, but does not retract existing content.

## International processing and safeguards

The deployment uses North America infrastructure, including Replit App Storage backed by Google Cloud infrastructure. Providers may process information internationally. SHÜÜT uses reasonable technical and organizational safeguards and, where required, appropriate safeguards for international processing. No exact transfer mechanism or contractual retention period is asserted here without verification.

## Open items requiring vendor-contract confirmation

- Store-specific categories, purposes, and “linked to you” answers for each current SDK/service.
- Whether any provider uses a distinct retention period, deletion SLA, subprocessors, or regional routing beyond the behavior documented above.
- Current international-transfer mechanism and applicable adequacy/contractual safeguards for each provider.
- Final App Store and Google Play questionnaire wording and account-deletion disclosure.