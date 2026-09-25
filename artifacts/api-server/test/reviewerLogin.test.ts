import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewerPasswordMatches } from "../src/lib/reviewerLogin";

const password = "a-long-unique-review-password-for-testing";
const enabled = {
  secret: password,
  expiresAt: "2026-12-01T00:00:00Z",
  environment: "production",
  now: Date.parse("2026-10-01T00:00:00Z"),
};

test("reviewer password is restricted to the intended address and exact secret", () => {
  assert.equal(reviewerPasswordMatches(" appstore@shuut.me ", password, enabled), true);
  assert.equal(reviewerPasswordMatches("anyone@example.com", password, enabled), false);
  assert.equal(reviewerPasswordMatches("appstore@shuut.me", password + "!", enabled), false);
  assert.equal(reviewerPasswordMatches("appstore@shuut.me", password.toUpperCase(), enabled), false);
});

test("reviewer password fails closed when disabled, weak, or expired", () => {
  assert.equal(reviewerPasswordMatches("appstore@shuut.me", password, { ...enabled, environment: "development" }), false);
  assert.equal(reviewerPasswordMatches("appstore@shuut.me", password, { ...enabled, secret: "" }), false);
  assert.equal(reviewerPasswordMatches("appstore@shuut.me", password, { ...enabled, secret: "short-password" }), false);
  assert.equal(reviewerPasswordMatches("appstore@shuut.me", password, { ...enabled, expiresAt: "" }), false);
  assert.equal(reviewerPasswordMatches("appstore@shuut.me", password, { ...enabled, expiresAt: "December 1, 2026" }), false);
  assert.equal(reviewerPasswordMatches("appstore@shuut.me", password, { ...enabled, now: Date.parse(enabled.expiresAt) }), false);
});