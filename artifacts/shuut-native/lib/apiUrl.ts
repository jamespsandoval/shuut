import Constants from 'expo-constants';
import { resolveApiBaseUrl } from './apiUrlConfig';

function isDevelopmentRuntime(): boolean {
  return process.env.NODE_ENV !== 'production' &&
    (typeof __DEV__ === 'undefined' || __DEV__ === true);
}

const embeddedApiBaseUrl =
  typeof Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL === 'string'
    ? Constants.expoConfig.extra.EXPO_PUBLIC_API_BASE_URL
    : null;

export const API_BASE_URL = resolveApiBaseUrl({
  configured: process.env.EXPO_PUBLIC_API_BASE_URL,
  embedded: embeddedApiBaseUrl,
  developmentDomain: process.env.EXPO_PUBLIC_DOMAIN,
  development: isDevelopmentRuntime(),
});

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