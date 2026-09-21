import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  polishTranscript,
  setTranscriptPolishProviderForTests,
  type TranscriptPolishProvider,
} from "../src/lib/transcriptPolish";

const originalProvider: TranscriptPolishProvider = {
  polish: async (transcript) => transcript,
};

afterEach(() => {
  setTranscriptPolishProviderForTests(originalProvider);
});

test("returns a conservatively polished transcript", async () => {
  setTranscriptPolishProviderForTests({
    polish: async () => "I’m sitting at an ice café in Kaiserslautern. It’s Monday around midday, and it is quiet.",
  });

  const result = await polishTranscript(
    "Okay, so I'm sitting here at a, an ice cafe in Kaiserslautern. It's, uh, Monday around midday, and it is quiet.",
  );

  assert.equal(
    result,
    "I’m sitting at an ice café in Kaiserslautern. It’s Monday around midday, and it is quiet.",
  );
});

test("keeps the raw transcript when polishing fails", async () => {
  setTranscriptPolishProviderForTests({
    polish: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.equal(await polishTranscript("  Keep this transcript.  "), "Keep this transcript.");
});

test("rejects unexpectedly destructive rewrites", async () => {
  setTranscriptPolishProviderForTests({ polish: async () => "Summary." });
  const raw = "This is a complete transcript with important names, details, and context that should not be summarized.";
  assert.equal(await polishTranscript(raw), raw);
});