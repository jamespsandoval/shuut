import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_API_BASE_URL,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
} from './apiUrlConfig.ts';

test('release startup uses the embedded canonical API when process env is absent', () => {
  assert.equal(resolveApiBaseUrl({
    configured: undefined,
    embedded: PRODUCTION_API_BASE_URL,
    developmentDomain: undefined,
    development: false,
  }), PRODUCTION_API_BASE_URL);
});

test('release startup cannot crash when build variables and manifest extra are absent', () => {
  assert.equal(resolveApiBaseUrl({
    configured: undefined,
    embedded: undefined,
    developmentDomain: undefined,
    development: false,
  }), PRODUCTION_API_BASE_URL);
});

test('release startup falls back to canonical API for an invalid explicit value', () => {
  assert.equal(resolveApiBaseUrl({
    configured: 'https://example.replit.dev',
    embedded: undefined,
    developmentDomain: undefined,
    development: false,
  }), PRODUCTION_API_BASE_URL);
});

test('development still surfaces invalid explicit configuration', () => {
  assert.throws(() => resolveApiBaseUrl({
    configured: 'not-a-url',
    embedded: undefined,
    developmentDomain: undefined,
    development: true,
  }), /absolute HTTPS URL/);
});

test('development domain takes precedence over the embedded production API', () => {
  assert.equal(resolveApiBaseUrl({
    configured: undefined,
    embedded: PRODUCTION_API_BASE_URL,
    developmentDomain: 'workspace.example.replit.dev',
    development: true,
  }), 'https://workspace.example.replit.dev');
});

test('explicit development API configuration takes precedence over the development domain', () => {
  assert.equal(resolveApiBaseUrl({
    configured: 'https://api.example.test',
    embedded: PRODUCTION_API_BASE_URL,
    developmentDomain: 'workspace.example.replit.dev',
    development: true,
  }), 'https://api.example.test');
});

test('normalization rejects credentials, query parameters, and fragments', () => {
  assert.throws(() => normalizeApiBaseUrl('https://user:pass@shuut.me'), /credentials/);
  assert.throws(() => normalizeApiBaseUrl('https://shuut.me?x=1'), /query parameters/);
  assert.throws(() => normalizeApiBaseUrl('https://shuut.me#x'), /fragments/);
});