# App Review sign-in handoff

SHÜÜT normally signs in with a six-digit, one-use email code. For the pre-verified `appstore@shuut.me` account only, the iPhone app also offers a time-limited review password. **A password must never be placed in source code, chat, screenshots, or this document.** Enter it via the secure Replit Secrets form and copy it separately into App Store Connect.

## Before submitting for review

- [ ] Register `appstore@shuut.me` through the real production email-code flow. The current forwarding alias can deliver that initial code to its owner. Complete the account's onboarding and required policy consent; do not seed a verified account or fake public activity.
- [ ] Set a new, unique password of at least 24 characters as the `APP_REVIEW_LOGIN_PASSWORD` secret. Do **not** use any password previously pasted into chat.
- [ ] Set `APP_REVIEW_LOGIN_EXPIRES_AT` to a UTC date-time in `YYYY-MM-DDTHH:mm:ssZ` format after the anticipated review period. Missing, malformed, or past expiry disables password sign-in.
- [ ] Publish the updated backend and upload a **new signed iPhone build** with the reviewer password screen. The old TestFlight build cannot show or submit a password. Confirm the new build is selected for App Review.
- [ ] On that build, sign out and sign in to `appstore@shuut.me` using the password; confirm it reaches the feed. Also confirm ordinary emails still use email-code sign-in and that the review account can choose **Use an email code instead**.
- [ ] Confirm the published API stays reachable during review and provide a real person who can respond to Apple about access issues.

The password endpoint never registers or verifies an account. It accepts only the review address with a verified, active account and completed onboarding; it shares the normal authentication rate limits and returns the usual mobile bearer session. In production, the secret and production expiry are both required. A separate short-lived `APP_REVIEW_LOGIN_DEV_EXPIRES_AT` setting can enable a test on the **native development preview** against the development account; it does not verify or onboard the separate production account. The web app does not offer password sign-in. A forwarded-only mailbox is sufficient for the *owner's* initial account setup, but does not let Apple independently retrieve email codes; the review password is their primary access method.

## App Store Connect fields

Keep **Sign-in required** checked. Enter `appstore@shuut.me` as **User name** and the *new review password* as **Password** directly in App Store Connect. Provide the actual review contact's name, reachable phone number, and email. The **Attachment** is optional. If the release owner wants to decide when the app goes live after approval, select **Manually release this version**.

Paste this in **Notes** after checking it against the selected build:

> SHÜÜT uses email-code sign-in for ordinary accounts. For App Review, the pre-verified account `appstore@shuut.me` also supports the password supplied in the Password field above. Enter that email on the first sign-in screen; a Review password field appears. Enter the supplied password and tap Sign in. The account has completed onboarding, so it opens the main feed.
>
> The account also offers **Use an email code instead** if you can obtain a current code delivered to that address. Codes expire after 15 minutes and are not needed to use the review password. Please contact the person listed above if you encounter an access issue.

## Revoke access after review

Remove the `APP_REVIEW_LOGIN_PASSWORD` secret or set `APP_REVIEW_LOGIN_EXPIRES_AT` to a past time, and apply the change to the published backend. That blocks **new** password sign-ins but does not by itself revoke an already-issued 30-day bearer session. To end existing reviewer sessions as well, the account owner must sign in to `appstore@shuut.me` with a fresh emailed code: the current sign-in flow replaces all sessions for that account. Verify the old password no longer works. Normal email-code sign-in remains available.

Do not revoke while Apple may still be testing or responding to an appeal. Re-enable only for a future submission with a new unique password and an updated expiry. Revocation and expiry changes on the server do not require another iPhone build.