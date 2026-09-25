# Task 64 — App Store reviewer notes

**Prepared:** 20 September 2026  
**App:** SHÜÜT (canonical spelling includes ÜÜ)  
**Purpose:** reviewer-facing instructions and product disclosures. Do not put
credentials in this document or in public metadata.

## Secure review access

The release owner must enter the following in App Store Connect’s secure
reviewer-information fields, not here:

- Reviewer email: `appstore@shuut.me` (enter in the secure User name field)
- Review password: **[RELEASE OWNER: ENTER ONLY IN ASC'S SECURE PASSWORD FIELD]**

The owner must first email-verify and onboard this account through the real
one-use email-code flow. On the new iPhone build, entering this email reveals
the review password field. The supplied password signs the reviewer into the
existing account; it does not create or verify one. Ordinary accounts continue
to use emailed codes. The reviewer can choose **Use an email code instead** if
they can access a fresh code delivered to this address. See the
[App Review sign-in handoff](app-review-email-sign-in.md) before submission.

## One-minute walkthrough

1. Sign in with the supplied reviewer email and password. The owner should
   already have completed account setup and accepted the current Terms and
   Community Guidelines.
2. Open the recorder, grant microphone permission only when prompted by the
   user action, record a short voice post, and stop.
3. Review the recording and transcript state. Choose whether to publish; the
   recording limit is 90 seconds. Transcription and automated moderation are
   asynchronous, so a pending state may remain briefly after leaving the screen.
4. Open the feed and post menu. Demonstrate report and block; from settings or
   the relevant profile, demonstrate unblock. Support can be reached at
   **https://shuut.me/contact**.
5. To demonstrate moderation remedies, use the in-app appeal flow when a case
   exists. To demonstrate privacy controls, open account/privacy settings,
   revoke voice-AI consent, and show account-deletion states without confirming
   deletion unless the release owner intends to remove the account.

## Voice consent, microphone, review, and publish

The versioned voice-AI consent prompt appears before a protected voice-AI
operation when consent is missing or revoked. Consent is an affirmative action;
continued use is not consent to a policy or voice-AI change. Microphone capture
starts only after the user starts recording and separately grants OS/browser
permission. The user can review the recording, and publishing/sending requires
an explicit action. These details and the processing sequence are documented
in [`reviewer-voice-ai-disclosure.md`](reviewer-voice-ai-disclosure.md).

Submitted private audio may be sent to ElevenLabs for speech-to-text after
consent; generated text may be sent to OpenAI models through Replit-managed AI
integrations for safety classification. Both operations are asynchronous.
Revoking consent stops future voice processing and sends no new audio, but does
not retract audio or processing already submitted.

## Safety, appeals, and deletion

Members can report content or behavior, block another member, and later
unblock them. SHÜÜT reviews reports case by case; enforcement can include
removal, feature restrictions, suspension, or termination. Appeals are
submitted through support/the appeal flow and reviewed case by case.

Account deletion has visible queued/cleanup and completed states. Cleanup
removes the profile, posts, comments, transcripts, current automated
moderation jobs, and consent records after cleanup succeeds; private audio and
avatars are queued for cleanup. Unlinked uploads are cleaned after signed
upload expiry and retries. Moderation-removed source audio is retained for 30
days for appeal, while reports, moderation, security/audit, and legal records
may be retained or anonymized when needed. Current provider calls expose no
per-request deletion ID, so SHÜÜT cannot promise immediate provider-side
erasure; provider-held copies and backups follow applicable schedules.

## Source and release caveats

Product behavior is supported by `replit.md`, the public policy/contact pages,
`reviewer-voice-ai-disclosure.md`, and `privacy-label-inputs.md`. The physical
iPhone interruption matrix is in
[`task-63-interruption-policy-device-test-matrix.md`](task-63-interruption-policy-device-test-matrix.md)
and remains **NOT YET RUN**; it is not represented as completed evidence here.