import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { optimizeUploadedImage } from "../src/lib/imageOptimization";

test("keeps small images unchanged", async () => {
  const source = await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: "#4477aa",
    },
  }).jpeg({ quality: 85 }).toBuffer();

  const result = await optimizeUploadedImage(source, "image/jpeg");

  assert.equal(result.optimized, false);
  assert.equal(result.contentType, "image/jpeg");
  assert.equal(result.data, source);
});

test("resizes and compresses large images for feed delivery", async () => {
  const source = await sharp({
    create: {
      width: 4200,
      height: 3000,
      channels: 3,
      background: "#4477aa",
    },
  }).jpeg({ quality: 95 }).toBuffer();

  const result = await optimizeUploadedImage(source, "image/jpeg");
  const metadata = await sharp(result.data).metadata();

  assert.equal(result.optimized, true);
  assert.equal(result.contentType, "image/webp");
  assert.ok((metadata.width ?? Infinity) <= 2048);
  assert.ok((metadata.height ?? Infinity) <= 2048);
  assert.ok(result.data.length < source.length);
});