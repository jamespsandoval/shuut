import assert from "node:assert/strict";
import test from "node:test";
import { applyCommentConsentDecision, getCommentAutoStartAction } from "../src/lib/comment-consent-flow";

test("auto-start waits for consent instead of consuming its one-shot attempt", () => {
  assert.equal(getCommentAutoStartAction(true, false, true), "wait-for-consent");
  assert.equal(getCommentAutoStartAction(true, false, false), "start");
});

test("auto-start skips after the composer has already attempted to start", () => {
  assert.equal(getCommentAutoStartAction(true, true, false), "skip");
  assert.equal(getCommentAutoStartAction(false, false, false), "skip");
});

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