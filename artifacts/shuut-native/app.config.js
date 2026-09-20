const { validateReleaseConfig } = require('./scripts/release-config');

module.exports = ({ config }) => {
  validateReleaseConfig({
    appConfig: { expo: config },
    configuredApiBaseUrl:
      process.env.NODE_ENV === 'production'
        ? process.env.EXPO_PUBLIC_API_BASE_URL
        : undefined,
    releaseChannel: process.env.EXPO_PUBLIC_RELEASE_CHANNEL,
    crashProbe: process.env.EXPO_PUBLIC_CRASH_PROBE,
    buildProfile:
      process.env.EAS_BUILD_PROFILE ||
      (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
  });
  return config;
};