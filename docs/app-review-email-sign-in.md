# App Review email sign-in handoff

SHÜÜT signs in with a six-digit, one-use code sent to the account email. The code expires after 15 minutes. **Do not hard-code a code, approve an email address without verification, or enter a current code as the App Store Connect password.**

## Before completing App Review Information

- [ ] `appstore@shuut.me` has a **dedicated, isolated inbox** with an HTTPS webmail address that Apple can open without the account owner's participation. A forwarding-only alias to a personal inbox does not meet this requirement. Keep unrelated and sensitive mail out of this inbox.
- [ ] The release owner has registered `appstore@shuut.me` using the normal production flow, verified its email with a fresh code, and completed the app's required onboarding. Do not seed a verified account or bypass the code flow.
- [ ] On the **same build selected for App Review**, sign out, request a *new* code, retrieve it from that inbox, and sign in again. Confirm the account reaches the feed. Do not assume that source-code checks prove the uploaded build works.
- [ ] Confirm the published API and email delivery are working throughout review. The reviewer must be able to request another code independently if the first expires.
- [ ] The release owner has chosen the intended App Store version release option and supplied a human review contact who can respond during review.

## App Store Connect fields

Keep **Sign-in required** checked. Enter `appstore@shuut.me` as **User name**. If App Store Connect requires a **Password**, enter the *dedicated reviewer inbox* password there, **not** a SHÜÜT code or a personal mailbox password. Enter mailbox access details only in App Store Connect, never in this repository, a screenshot, or chat. Use an account limited to reviewer mail and rotate/revoke its access after review is truly complete; be prepared to restore review access for a later submission.

Enter the actual review contact's name, reachable phone number, and email in **Contact Information**. The **Attachment** is optional. If the release owner wants to choose when the app goes live after approval, select **Manually release this version**; the automatic option publishes after approval.

Paste this in **Notes** after replacing the bracketed webmail address and confirming every step on the selected build:

> SHÜÜT uses passwordless email sign-in. The app account for review is `appstore@shuut.me` and has completed onboarding.
>
> The Password field above is for the dedicated review **email inbox**, not a password for the SHÜÜT app. To sign in, open [HTTPS REVIEWER WEBMAIL URL], log in to that inbox with `appstore@shuut.me` and the Password field, then open SHÜÜT and enter `appstore@shuut.me`. Tap Continue, open the latest SHÜÜT sign-in email in the inbox, and enter its six-digit code in the app. Codes are single-use and expire after 15 minutes; request a new one in the app if needed.
>
> Please use the review contact information above if you encounter an access issue.

**Do not submit this text as-is** if the address only forwards to the owner or the reviewer cannot reach the inbox independently. Do not put a real one-time code in Notes; it will expire before review.

## When a new iPhone build is needed

Setting up the mailbox, registering the review account, and completing App Store Connect fields do not change the installed app and do not require a new TestFlight upload. If the selected iPhone build cannot complete this sign-in flow and the fix changes native code or bundled configuration, upload a new signed build and select it for App Review. A working public API alone does not prove the uploaded iPhone build works.