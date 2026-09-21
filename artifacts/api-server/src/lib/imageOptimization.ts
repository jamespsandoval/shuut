import sharp from "sharp";

const MAX_IMAGE_EDGE = 2048;
const LARGE_IMAGE_BYTES = 1_000_000;

export type OptimizedImage = {
  data: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  optimized: boolean;
};

export async function optimizeUploadedImage(
  data: Buffer,
  contentType: OptimizedImage["contentType"],
): Promise<OptimizedImage> {
  const source = sharp(data, {
    failOn: "warning",
    limitInputPixels: 80_000_000,
  });
  const metadata = await source.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("Image dimensions are unavailable");

  const needsOptimization =
    data.length > LARGE_IMAGE_BYTES ||
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE;
  if (!needsOptimization) return { data, contentType, optimized: false };

  const optimized = await source
    .rotate()
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();

  return {
    data: optimized,
    contentType: "image/webp",
    optimized: true,
  };
}