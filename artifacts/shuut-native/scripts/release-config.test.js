const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_IOS_BUNDLE_IDENTIFIER,
  PRODUCTION_API_BASE_URL,
  isProductionStaticBuild,
  resolveStaticBuildApiBaseUrl,
  validateReleaseConfig,
} = require('./release-config');
const configureApp = require('../app.config');

function appConfig(bundleIdentifier = EXPECTED_IOS_BUNDLE_IDENTIFIER, apiBaseUrl = PRODUCTION_API_BASE_URL) {
  return {
    expo: {
      ios: { bundleIdentifier },
      extra: { EXPO_PUBLIC_API_BASE_URL: apiBaseUrl },
    },
  };
}

test('accepts the immutable Replit App Store identity and embedded API', () => {
  assert.deepEqual(validateReleaseConfig({
    appConfig: appConfig(),
    configuredApiBaseUrl: undefined,
  }), {
    bundleIdentifier: EXPECTED_IOS_BUNDLE_IDENTIFIER,
    apiBaseUrl: PRODUCTION_API_BASE_URL,
  });
});

test('rejects the bundle identifier that cannot update the existing listing', () => {
  assert.throws(() => validateReleaseConfig({
    appConfig: appConfig('com.doubleportrait.shuut'),
    configuredApiBaseUrl: PRODUCTION_API_BASE_URL,
  }), /app\.replit\.shuut/);
});

test('rejects an absent or mismatched embedded production API', () => {
  assert.throws(() => validateReleaseConfig({
    appConfig: appConfig(EXPECTED_IOS_BUNDLE_IDENTIFIER, null),
    configuredApiBaseUrl: PRODUCTION_API_BASE_URL,
  }), /absolute HTTPS URL/);
  assert.throws(() => validateReleaseConfig({
    appConfig: appConfig(EXPECTED_IOS_BUNDLE_IDENTIFIER, 'https://example.com'),
    configuredApiBaseUrl: PRODUCTION_API_BASE_URL,
  }), /Embedded release API URL/);
});

test('rejects a build variable that disagrees with the embedded API', () => {
  assert.throws(() => validateReleaseConfig({
    appConfig: appConfig(),
    configuredApiBaseUrl: 'https://example.com',
  }), /does not match/);
});

test('production static deployment keeps the canonical API origin', () => {
  assert.equal(resolveStaticBuildApiBaseUrl({
    configuredApiBaseUrl: undefined,
    deploymentDomain: 'shuut-me.replit.app',
    production: true,
  }), PRODUCTION_API_BASE_URL);
});

test('Replit deployment is production even before NODE_ENV is set', () => {
  assert.equal(isProductionStaticBuild({
    nodeEnv: undefined,
    internalAppDomain: 'shuut-me.replit.app',
  }), true);
  assert.equal(isProductionStaticBuild({
    nodeEnv: undefined,
    internalAppDomain: undefined,
  }), false);
});

test('development static deployment can use its deployment domain', () => {
  assert.equal(resolveStaticBuildApiBaseUrl({
    configuredApiBaseUrl: undefined,
    deploymentDomain: 'example.replit.dev',
    production: false,
  }), 'https://example.replit.dev');
});

test('rejects diagnostics crash flags in a production release', () => {
  assert.throws(() => validateReleaseConfig({
    appConfig: appConfig(),
    releaseChannel: 'diagnostics',
  }), /must not include/);
  assert.throws(() => validateReleaseConfig({
    appConfig: appConfig(),
    crashProbe: 'startup',
  }), /must not include/);
});

test('actual Expo config rejects probe flags for production and permits diagnostics', () => {
  const original = {
    EAS_BUILD_PROFILE: process.env.EAS_BUILD_PROFILE,
    NODE_ENV: process.env.NODE_ENV,
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_RELEASE_CHANNEL: process.env.EXPO_PUBLIC_RELEASE_CHANNEL,
    EXPO_PUBLIC_CRASH_PROBE: process.env.EXPO_PUBLIC_CRASH_PROBE,
  };
  const config = appConfig().expo;

  try {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = PRODUCTION_API_BASE_URL;
    process.env.EXPO_PUBLIC_RELEASE_CHANNEL = 'diagnostics';
    process.env.EXPO_PUBLIC_CRASH_PROBE = 'startup';
    process.env.EAS_BUILD_PROFILE = 'production';
    assert.throws(() => configureApp({ config }), /must not include/);

    process.env.EAS_BUILD_PROFILE = 'diagnostics';
    assert.equal(configureApp({ config }), config);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});