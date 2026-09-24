const MAX_PHOTO_BYTES = 15_000_000
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"])

export async function preparePostPhoto(file: File): Promise<File> {
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    throw new Error("Choose a photo under 15MB.")
  }
  const isHeic = ["image/heic", "image/heif"].includes(file.type.toLowerCase())
    || /\.(heic|heif)$/i.test(file.name)
  if (!isHeic && supportedTypes.has(file.type.toLowerCase())) return file
  if (!isHeic) throw new Error("Choose a JPEG, PNG, WebP, or HEIC photo.")

  // Browsers that can decode iPhone photos can safely export actual JPEG bytes.
  // Never label the original HEIC bytes as JPEG: the upload server checks them.
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("This browser can't open this HEIC photo. Export it as a JPEG and try again."))
    })
    image.src = url
    await loaded
    const edge = Math.max(image.naturalWidth, image.naturalHeight)
    if (!edge) throw new Error("This photo could not be decoded. Export it as a JPEG and try again.")
    const scale = Math.min(1, 2048 / edge)
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Photo conversion isn't available in this browser. Export it as a JPEG and try again.")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85))
    if (!blob || !blob.size || blob.size > MAX_PHOTO_BYTES) {
      throw new Error("Photo conversion failed. Export a JPEG under 15MB and try again.")
    }
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, "") + ".jpg", { type: "image/jpeg" })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function postPhotoUploadError(status: number, responseText: string): Error {
  let message = ""
  try {
    const parsed: unknown = JSON.parse(responseText)
    if (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string") {
      message = parsed.error
    }
  } catch { /* Upload response was not JSON. */ }
  if (message === "Upload content does not match its declared type") {
    return new Error("This photo is not in a supported format. Export it as JPEG and try again.")
  }
  if (message === "Image could not be processed") {
    return new Error("This photo could not be processed. Export it as JPEG and try again.")
  }
  return new Error(message || `Photo upload failed (${status}). Please try again.`)
}