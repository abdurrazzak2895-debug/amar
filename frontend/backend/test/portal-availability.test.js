import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPortalAvailabilityConfig,
  normalizeCentersPayload,
  normalizeGatewayResponse,
  normalizeSearchDatesPayload,
  portalRequest,
} from '../src/lib/portalAvailabilityClient.js';

test('uses the documented gateway default and never reads a frontend key', () => {
  assert.deepEqual(getPortalAvailabilityConfig({}), {
    baseUrl: 'https://takamol-production.up.railway.app',
    apiKey: '',
  });
});

test('normalizes the search_dates payload to the documented fields', () => {
  assert.deepEqual(normalizeSearchDatesPayload({
    category_id: '159',
    start_from: '2026-08-24',
    account_id: 'must-not-forward',
  }), {
    category_id: 159,
    start_from: '2026-08-24',
  });
});

test('normalizes centers with a Prometric language code', () => {
  assert.deepEqual(normalizeCentersPayload({
    category_id: '159',
    city: 'Dhaka',
    date: '2026-08-24',
    occupation_id: '2061',
    language_code: 'LOABB',
  }), {
    category_id: 159,
    city: 'Dhaka',
    date: '2026-08-24',
    occupation_id: 2061,
    language_code: 'LOABB',
  });
});

test('rejects ISO language codes and malformed date fields', () => {
  assert.throws(() => normalizeCentersPayload({
    category_id: 159,
    city: 'Dhaka',
    date: '2026-08-24',
    occupation_id: 2061,
    language_code: 'en',
  }), /Prometric code/);

  assert.throws(() => normalizeSearchDatesPayload({
    category_id: 159,
    start_from: '24-08-2026',
  }), /YYYY-MM-DD/);
});

test('forwards only the server-side API key and returns a successful envelope', async () => {
  let observed;
  const payload = await portalRequest('/api/external/portal-availability/v1/occupations', {
    env: {
      PORTAL_AVAILABILITY_GATEWAY_URL: 'https://gateway.example.test/',
      PORTAL_AVAILABILITY_API_KEY: 'pav_test_server_only',
    },
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return new Response(JSON.stringify({ success: true, data: { occupations: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.deepEqual(payload, { success: true, data: { occupations: [] } });
  assert.equal(observed.url, 'https://gateway.example.test/api/external/portal-availability/v1/occupations');
  assert.equal(observed.options.method, 'GET');
  assert.equal(observed.options.headers['X-Portal-API-Key'], 'pav_test_server_only');
  assert.equal(observed.options.headers.Authorization, undefined);
  assert.equal(observed.options.body, undefined);
});

test('rejects non-success envelopes with the upstream status and message', () => {
  assert.throws(
    () => normalizeGatewayResponse(422, { success: false, message: 'Invalid request body' }),
    (error) => error.statusCode === 422 && error.message === 'Invalid request body',
  );
});
