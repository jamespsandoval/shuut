export const PRODUCTION_API_BASE_URL = 'https://shuut.me';

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

type ApiBaseUrlInputs = {
  configured?: string | null;
  embedded?: string | null;
  developmentDomain?: string | null;
  development: boolean;
};

/**
 * Release archives carry the canonical API in the Expo manifest. Replit's
 * App Store build may not expose build-shell variables to the JS bundle, so a
 * missing process.env value must never terminate the app at module load.
 *
 * Invalid explicit release values also fall back to the audited canonical
 * origin. The release validation script still rejects them before upload.
 */
export function resolveApiBaseUrl({
  configured,
  embedded,
  developmentDomain,
  development,
}: ApiBaseUrlInputs): string {
  const candidates = [configured, embedded]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      return normalizeApiBaseUrl(candidate, development);
    } catch (error) {
      if (development) throw error;
    }
  }

  if (!development) return PRODUCTION_API_BASE_URL;

  return normalizeApiBaseUrl(
    developmentDomain?.trim() ? `https://${developmentDomain.trim()}` : 'https://localhost:80',
    true,
  );
}