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

  assert.deepEqual(result, {
    transcript: "I’m sitting at an ice café in Kaiserslautern. It’s Monday around midday, and it is quiet.",
    status: "cleaned",
  });
});

test("requires author approval before using raw text when polishing fails", async () => {
  setTranscriptPolishProviderForTests({
    polish: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.deepEqual(await polishTranscript("  Keep this transcript.  "), {
    transcript: "Keep this transcript.",
    status: "raw",
  });
});

test("rejects unexpectedly destructive rewrites", async () => {
  setTranscriptPolishProviderForTests({ polish: async () => "Summary." });
  const raw = "This is a complete transcript with important names, details, and context that should not be summarized.";
  assert.deepEqual(await polishTranscript(raw), { transcript: raw, status: "raw" });
});

test("requires approval when the provider returns empty text", async () => {
  setTranscriptPolishProviderForTests({ polish: async () => "   " });
  const raw = "I wanted to tell you something.";
  assert.deepEqual(await polishTranscript(raw), { transcript: raw, status: "raw" });
});

test("does not treat an unchanged filler-filled transcript as cleaned", async () => {
  const raw = "Hey, man, so I'm on this, uh, bus that's taking a long time to, um, get to a play.";
  setTranscriptPolishProviderForTests({ polish: async () => raw });
  assert.deepEqual(await polishTranscript(raw), { transcript: raw, status: "raw" });
});

test("does not require changes to text that already needs no cleanup", async () => {
  const raw = "I am on the bus, heading to a play.";
  setTranscriptPolishProviderForTests({ polish: async () => raw });
  assert.deepEqual(await polishTranscript(raw), { transcript: raw, status: "cleaned" });
});