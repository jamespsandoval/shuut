import assert from "node:assert/strict";
import test from "node:test";
import { applyCommentConsentDecision } from "../src/lib/comment-consent-flow";

test("accept closes only the disclosure and starts the pending recording", () => {
  const calls: string[] = [];
  applyCommentConsentDecision("accepted", {
    closeDisclosure: () => calls.push("close-disclosure"),
    dismissComposer: () => calls.push("dismiss-composer"),
    startRecording: () => calls.push("start-recording"),
  });

  assert.deepEqual(calls, ["close-disclosure", "start-recording"]);
});

test("Not now closes and dismisses without microphone access", () => {
  const calls: string[] = [];
  applyCommentConsentDecision("declined", {
    closeDisclosure: () => calls.push("close-disclosure"),
    dismissComposer: () => calls.push("dismiss-composer"),
    startRecording: () => calls.push("start-recording"),
  });

  assert.deepEqual(calls, ["close-disclosure", "dismiss-composer"]);
});