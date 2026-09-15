export function createEditableProfileUpdate(name: string, handle: string, bio: string, location?: string, website?: string) {
  return { name, handle, bio, location, website };
}