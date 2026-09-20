const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EXPECTED_IOS_BUNDLE_IDENTIFIER,
  PRODUCTION_API_BASE_URL,
  validateReleaseConfig,
} = require('./release-config');

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