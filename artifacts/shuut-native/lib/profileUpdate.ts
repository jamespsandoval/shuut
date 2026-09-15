export function createEditableProfileUpdate(name: string, handle: string, bio: string, location?: string, website?: string, previewTranscript?: boolean) {
  return { name, handle, bio, location, website, previewTranscript };
}