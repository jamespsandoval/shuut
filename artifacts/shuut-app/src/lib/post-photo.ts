const MAX_PHOTO_BYTES = 15_000_000
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"])

export async function preparePostPhoto(file: File, options: { optimize?: boolean } = {}): Promise<File> {
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) {
    throw new Error("Choose a photo under 15MB.")
  }
  const isHeic = ["image/heic", "image/heif"].includes(file.type.toLowerCase())
    || /\.(heic|heif)$/i.test(file.name)
  const type = file.type.toLowerCase()
  if (!isHeic && !supportedTypes.has(type)) throw new Error("Choose a JPEG, PNG, WebP, or HEIC photo.")
  if (!isHeic && !options.optimize) return file

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
    if (!isHeic && scale === 1 && (type !== "image/jpeg" || file.size <= 750_000)) return file
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Photo conversion isn't available in this browser. Export it as a JPEG and try again.")
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const outputType = isHeic ? "image/jpeg" : type
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, 0.82))
    if (!blob || !blob.size || blob.size > MAX_PHOTO_BYTES || blob.type !== outputType) {
      throw new Error("Photo conversion failed. Export a JPEG under 15MB and try again.")
    }
    if (!isHeic && blob.size >= file.size) return file
    const name = isHeic ? file.name.replace(/\.(heic|heif)$/i, "") + ".jpg" : file.name
    return new File([blob], name, { type: outputType })
  } catch (error) {
    if (isHeic) throw error
    console.warn("Could not optimize photo before upload", error)
    return file
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