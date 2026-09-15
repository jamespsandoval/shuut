export function resolveApiUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;

  const domain = process.env.EXPO_PUBLIC_DOMAIN || 'localhost:80';
  return `https://${domain}${url.startsWith('/') ? url : `/${url}`}`;
}

export function authenticatedImageSource(
  url: string,
  token: string | null,
): { uri: string; headers?: Record<string, string> } {
  const uri = resolveApiUrl(url)!;
  return token && /^https?:/i.test(uri)
    ? { uri, headers: { Authorization: `Bearer ${token}` } }
    : { uri };
}