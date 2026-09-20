# Task #63: Interruption policy and physical-device test matrix

## Interruption policy

The recorder must treat an interruption as a safety boundary:

1. **Permission prompt, denied, or later revoked:** do not start capture without
   current microphone permission. Explain the blocked action and offer retry after
   permission is restored; never record silently or request permission in the
   background.
2. **Pending start:** cancel the pending start when an interruption, backgrounding,
   lock, or route transition makes capture unavailable. Do not create a
   publishable recording.
3. **Actively recording:** stop capture promptly on an interruption. Preserve a
   voice-post recording as unfinished/reviewable audio. Voice comments do not
   have a review screen, so discard an interrupted comment with explicit
   guidance to record again. Never resume or publish either automatically.
4. **Review playback:** pause playback on interruption and retain the completed
   recording and its review state. Playback may be resumed explicitly after
   recovery.
5. **Upload, transcription, or publish retry:** preserve the local recording and
   review data when work is interrupted or the network fails. Retry is always
   explicit. A retry may not publish without the user’s explicit publish action.
6. **Recovery:** after foregrounding, unlocking, restoring a route, restoring
   permission, or relaunching, show the preserved item and its current state.
   A completed review must survive recoverably; an interruption must never
   result in an implicit publish.

## Verification status

No physical iPhone or interruption harness was available for this work. The
results below are a release-review worksheet: **Actual result is intentionally
`NOT YET RUN`**, and no scenario should be marked pass until it is exercised on a
physical iPhone. Simulator/static verification is also **NOT YET RUN** unless a
reviewer records evidence in the table.

**Pass criteria:** expected behavior occurs, the preserved recording remains
recoverable after relaunch, and no automatic publish occurs. **Fail** means the
observed behavior violates policy. **Blocking** means the test cannot be
completed or release confidence cannot be established.

| Verification | State / scenario | Expected result | Actual result | Pass / fail | Blocking note |
|---|---|---|---|---|---|
| Simulator/static verification | Permission prompt; start requested | Permission is requested only in response to the user action; no audio starts before consent. | NOT YET RUN | NOT YET RUN | Need static review and simulator evidence. |
| Simulator/static verification | Permission denied | Start is blocked with a clear recovery path; no recording or publish is created. | NOT YET RUN | NOT YET RUN | Need denied-permission run. |
| Physical iPhone | Permission later revoked in Settings | Current capture is stopped safely; preserved audio remains reviewable; next start is blocked until permission is restored. | NOT YET RUN | NOT YET RUN | Requires iPhone Settings and app relaunch/return. |
| Physical iPhone | Pending start + incoming call (answered) | Pending start is canceled; no partial/publishable recording is created; call is unaffected. | NOT YET RUN | NOT YET RUN | Requires cellular/VoIP incoming call. |
| Physical iPhone | Pending start + incoming call (declined) | Pending start is canceled or remains safely unavailable; no recording starts without a new explicit action. | NOT YET RUN | NOT YET RUN | Requires physical incoming call. |
| Physical iPhone | Pending start + Siri | Start is canceled or remains pending safely; Siri interaction does not start capture. | NOT YET RUN | NOT YET RUN | Requires Siri enabled and invoked. |
| Physical iPhone | Actively recording + incoming call (answered) | Recording stops and preserves captured audio; no auto-resume or auto-publish after the call. | NOT YET RUN | NOT YET RUN | Critical data-loss test. |
| Physical iPhone | Actively recording + incoming call (declined) | Recording stops/preserves audio (or safely remains stopped); no auto-resume or auto-publish. | NOT YET RUN | NOT YET RUN | Requires physical incoming call. |
| Physical iPhone | Actively recording + Siri | Recording stops and preserves captured audio; Siri does not cause resume or publish. | NOT YET RUN | NOT YET RUN | Requires Siri enabled and invoked. |
| Physical iPhone | Actively recording + app background, then foreground | Recording stops and preserves audio; foreground shows recoverable review item; resume requires explicit user action. | NOT YET RUN | NOT YET RUN | Verify after app switch and return. |
| Physical iPhone | Actively recording + screen lock, then unlock | Recording stops and preserves audio; unlock does not auto-resume or publish. | NOT YET RUN | NOT YET RUN | Requires device passcode/lock. |
| Physical iPhone | Actively recording + AirPods connect, disconnect, or route change | If iOS interrupts capture, it stops and preserves audio; if iOS completes the route change without interruption, capture continues without corruption. It never auto-publishes. | NOT YET RUN | NOT YET RUN | Test connect, disconnect, and output/input route changes separately. |
| Physical iPhone | Actively recording + Control Center | Recording stops/preserves audio when audio-affecting controls or system interaction interrupts it; no auto-publish. | NOT YET RUN | NOT YET RUN | Test opening Control Center and relevant audio controls. |
| Physical iPhone | Review playback + call, Siri, background, lock, or route change | Playback pauses; completed recording and review state remain intact; playback resumes only explicitly. | NOT YET RUN | NOT YET RUN | Exercise at least one representative interruption per class. |
| Physical iPhone | Upload/transcription/publish retry + app background/foreground | In-progress work remains retryable and local audio/review data is preserved; foreground does not silently retry or publish. | NOT YET RUN | NOT YET RUN | Check visible state after return. |
| Physical iPhone | Upload/transcription/publish retry + network loss | Operation reports failure/pending state; local item remains recoverable; retry is explicit and publish still requires explicit action. | NOT YET RUN | NOT YET RUN | Disable Wi-Fi/cellular during upload and restore it. |
| Physical iPhone | Completed review + force quit/relaunch | Completed review survives recoverably after relaunch; no automatic upload or publish. | NOT YET RUN | NOT YET RUN | Verify item and review metadata after cold relaunch. |
| Physical iPhone | Recording/interruption + force quit/relaunch | Any preserved stopped recording is discoverable and reviewable; no data loss and no auto-publish. | NOT YET RUN | NOT YET RUN | Verify recovery for an interrupted item. |
| Physical iPhone | Publish retry after any interruption | Retry is user initiated; cancellation/failure leaves item recoverable; publish never occurs as a side effect of recovery. | NOT YET RUN | NOT YET RUN | Confirm server-side/user-visible publish state. |

### Release-review completion

For each row, the reviewer should replace `NOT YET RUN` with observed evidence,
mark **Pass** or **Fail**, and record the device model, iOS version, app build,
interruption type, and any blocking defect. A failed preservation, unexpected
resume, or automatic publish is release-blocking until resolved.