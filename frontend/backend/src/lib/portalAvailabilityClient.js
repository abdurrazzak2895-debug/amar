const DEFAULT_GATEWAY_URL = 'https://takamol-production.up.railway.app';

export function getPortalAvailabilityConfig(env = process.env) {
  const baseUrl = String(env.PORTAL_AVAILABILITY_GATEWAY_URL || DEFAULT_GATEWAY_URL).trim().replace(/\/+$/, '');
  const apiKey = String(env.PORTAL_AVAILABILITY_API_KEY || '').trim();
  return { baseUrl, apiKey };
}

function createHttpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function assertPositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw createHttpError(422, `${field} must be a positive integer`);
  }
  return number;
}

function assertDate(value, field) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createHttpError(422, `${field} must use YYYY-MM-DD format`);
  }
  return date;
}

function assertNonEmptyString(value, field, maxLength = 120) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength) {
    throw createHttpError(422, `${field} is required`);
  }
  return text;
}

export function normalizeSearchDatesPayload(input = {}) {
  return {
    category_id: assertPositiveInteger(input.category_id, 'category_id'),
    start_from: assertDate(input.start_from, 'start_from'),
  };
}

export function normalizeCentersPayload(input = {}) {
  const languageCode = assertNonEmptyString(input.language_code, 'language_code', 32);
  if (/^[a-z]{2,3}$/i.test(languageCode)) {
    throw createHttpError(422, 'language_code must be the Prometric code, not an ISO language code');
  }

  return {
    category_id: assertPositiveInteger(input.category_id, 'category_id'),
    city: assertNonEmptyString(input.city, 'city'),
    date: assertDate(input.date, 'date'),
    occupation_id: assertPositiveInteger(input.occupation_id, 'occupation_id'),
    language_code: languageCode,
  };
}

export function normalizeGatewayResponse(statusCode, payload) {
  if (statusCode < 200 || statusCode >= 300 || payload?.success !== true) {
    const message = String(payload?.message || payload?.error || 'Portal Availability Gateway request failed.');
    throw createHttpError(statusCode || 502, message, payload);
  }
  return payload;
}

export async function portalRequest(path, { method = 'GET', payload, env = process.env, fetchImpl = fetch } = {}) {
  const { baseUrl, apiKey } = getPortalAvailabilityConfig(env);
  if (!apiKey) {
    throw createHttpError(503, 'PORTAL_AVAILABILITY_API_KEY is not configured.');
  }

  const hasPayload = payload !== undefined;
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'X-Portal-API-Key': apiKey,
      ...(hasPayload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasPayload ? JSON.stringify(payload) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return normalizeGatewayResponse(response.status, data);
}
