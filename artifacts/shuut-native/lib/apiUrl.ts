function isDevelopmentRuntime(): boolean {
  return process.env.NODE_ENV !== 'production' &&
    (typeof __DEV__ === 'undefined' || __DEV__ === true);
}

/**
 * Normalize and validate the API origin. Release builds deliberately do not
 * fall back to a development host: a misconfigured binary must fail closed.
 */
export function normalizeApiBaseUrl(value: string, allowDevelopmentHosts = false): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('API base URL must be an absolute HTTPS URL.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' ||
    hostname === '::1' || hostname.endsWith('.localhost');
  const isReplit = hostname === 'replit.dev' || hostname.endsWith('.replit.dev') ||
    hostname.includes('.replit.dev.');
  if (parsed.protocol !== 'https:' || (!allowDevelopmentHosts && (isLocal || isReplit))) {
    throw new Error('API base URL must use HTTPS and must not point to localhost or *.replit.dev.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('API base URL must not contain credentials, query parameters, or fragments.');
  }
  return parsed.toString().replace(/\/$/, '');
}

function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const development = isDevelopmentRuntime();
  if (configured) return normalizeApiBaseUrl(configured, development);
  if (!development) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required for release builds.');
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  return normalizeApiBaseUrl(domain ? `https://${domain}` : 'https://localhost:80', true);
}

export const API_BASE_URL = resolveBaseUrl();

export function resolveApiUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|blob:|file:)/i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
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