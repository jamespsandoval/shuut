const path = require('node:path');

const EXPECTED_IOS_BUNDLE_IDENTIFIER = 'app.replit.shuut';
const PRODUCTION_API_BASE_URL = 'https://shuut.me';

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

function resolveStaticBuildApiBaseUrl({
  configuredApiBaseUrl,
  deploymentDomain,
  production,
}) {
  if (configuredApiBaseUrl?.trim()) {
    return normalizeApiBaseUrl(configuredApiBaseUrl, !production);
  }

  // The deployment domain hosts Expo Go bundles and manifests. It is not the
  // app's production API origin.
  if (production) {
    return PRODUCTION_API_BASE_URL;
  }

  return normalizeApiBaseUrl(`https://${deploymentDomain}`, true);
}

function isProductionStaticBuild({
  nodeEnv,
  internalAppDomain,
}) {
  return nodeEnv === 'production' || Boolean(internalAppDomain?.trim());
}

function validateReleaseConfig({
  appConfig,
  configuredApiBaseUrl,
  releaseChannel,
  crashProbe,
  buildProfile = 'production',
}) {
  const bundleIdentifier = appConfig?.expo?.ios?.bundleIdentifier;
  if (bundleIdentifier !== EXPECTED_IOS_BUNDLE_IDENTIFIER) {
    throw new Error(
      `iOS bundle identifier must remain ${EXPECTED_IOS_BUNDLE_IDENTIFIER}; received ${bundleIdentifier || 'missing'}.`,
    );
  }

  const embeddedApiBaseUrl = appConfig?.expo?.extra?.EXPO_PUBLIC_API_BASE_URL;
  const embedded = normalizeApiBaseUrl(embeddedApiBaseUrl);
  if (embedded !== PRODUCTION_API_BASE_URL) {
    throw new Error(
      `Embedded release API URL must be ${PRODUCTION_API_BASE_URL}; received ${embedded}.`,
    );
  }

  if (configuredApiBaseUrl?.trim()) {
    const configured = normalizeApiBaseUrl(configuredApiBaseUrl);
    if (configured !== embedded) {
      throw new Error(
        `Build API URL ${configured} does not match embedded release API URL ${embedded}.`,
      );
    }
  }

  const hasDiagnosticsFlag =
    releaseChannel === 'diagnostics' || Boolean(crashProbe?.trim());
  if (buildProfile === 'production' && hasDiagnosticsFlag) {
    throw new Error(
      'Production releases must not include the diagnostics channel or crash probe.',
    );
  }
  if (
    hasDiagnosticsFlag &&
    (buildProfile !== 'diagnostics' ||
      releaseChannel !== 'diagnostics' ||
      crashProbe !== 'startup')
  ) {
    throw new Error(
      'The startup crash probe requires the diagnostics build profile and both exact diagnostics flags.',
    );
  }

  return { bundleIdentifier, apiBaseUrl: embedded };
}

if (require.main === module) {
  try {
    const appConfig = require(path.join('..', 'app.json'));
    const validated = validateReleaseConfig({
      appConfig,
      configuredApiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
      releaseChannel: process.env.EXPO_PUBLIC_RELEASE_CHANNEL,
      crashProbe: process.env.EXPO_PUBLIC_CRASH_PROBE,
      buildProfile: process.env.EAS_BUILD_PROFILE || 'production',
    });
    console.log(
      `Release config is valid (${validated.bundleIdentifier}, ${validated.apiBaseUrl})`,
    );
  } catch (error) {
    console.error(`Invalid release config: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED_IOS_BUNDLE_IDENTIFIER,
  PRODUCTION_API_BASE_URL,
  isProductionStaticBuild,
  normalizeApiBaseUrl,
  resolveStaticBuildApiBaseUrl,
  validateReleaseConfig,
};