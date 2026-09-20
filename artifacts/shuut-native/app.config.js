const { validateReleaseConfig } = require('./scripts/release-config');

module.exports = ({ config }) => {
  validateReleaseConfig({
    appConfig: { expo: config },
    configuredApiBaseUrl:
      process.env.NODE_ENV === 'production'
        ? process.env.EXPO_PUBLIC_API_BASE_URL
        : undefined,
  });
  return config;
};