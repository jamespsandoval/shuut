function normalizeApiBaseUrl(value, allowDevelopmentHosts = false) {
  let parsed;
  try {
    parsed = new URL(String(value).trim());
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

if (require.main === module) {
  try {
    normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
    console.log('Release API URL is valid');
  } catch (error) {
    console.error(`Invalid release API URL: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { normalizeApiBaseUrl };