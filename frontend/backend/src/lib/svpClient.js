function getUpstreamMessage(data) {
  const direct = data?.message || data?.error;
  if (direct) return String(direct);
  const nested = data?.errors?.temporaryseat?.labor_id;
  if (Array.isArray(nested) && nested[0]) return String(nested[0]);
  const firstError = Object.values(data?.errors || {}).flatMap((value) =>
    Array.isArray(value) ? value : Object.values(value || {}).flatMap((item) => Array.isArray(item) ? item : [])
  )[0];
  return firstError ? String(firstError) : '';
}

export async function svpRequest(path, { method='GET', token, body } = {}) {
  const base = process.env.SVP_BASE_URL;
  const locale = process.env.SVP_LOCALE || 'en';
  const svpOrigin = process.env.SVP_WEB_ORIGIN || 'https://svp-international.pacc.sa';
  const svpReferer = process.env.SVP_WEB_REFERER || `${svpOrigin}/`;
  const svpUserAgent =
    process.env.SVP_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

  if (!base) {
    const err = new Error('Missing required environment variable: SVP_BASE_URL');
    err.statusCode = 500;
    throw err;
  }

  const url = `${base}${path}${path.includes('?') ? '&' : '?'}locale=${encodeURIComponent(locale)}`;

  const headers = {
    'Accept': 'application/json',
    'Origin': svpOrigin,
    'Referer': svpReferer,
    'User-Agent': svpUserAgent,
    'X-Tenant-Name': 'svp-international',
  };
  if (body) headers['Content-Type'] = 'application/json;charset=UTF-8';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) {
    const upstreamMessage = getUpstreamMessage(data);
    const err = new Error(
      upstreamMessage ? `SVP request failed: ${res.status}: ${upstreamMessage}` : `SVP request failed: ${res.status}`
    );
    err.statusCode = res.status;
    err.details = data;
    err.upstreamMessage = upstreamMessage || undefined;
    throw err;
  }
  return data;
}

export async function svpMultipartRequest(path, { contentType, body } = {}) {
  const base = process.env.SVP_BASE_URL;
  const locale = process.env.SVP_LOCALE || 'en';
  const svpOrigin = process.env.SVP_WEB_ORIGIN || 'https://svp-international.pacc.sa';
  const svpReferer = process.env.SVP_WEB_REFERER || `${svpOrigin}/`;
  const svpUserAgent =
    process.env.SVP_USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

  if (!base) {
    const err = new Error('Missing required environment variable: SVP_BASE_URL');
    err.statusCode = 500;
    throw err;
  }
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) {
    const err = new Error('multipart/form-data required');
    err.statusCode = 415;
    throw err;
  }

  const url = `${base}${path}${path.includes('?') ? '&' : '?'}locale=${encodeURIComponent(locale)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Origin: svpOrigin,
      Referer: svpReferer,
      'User-Agent': svpUserAgent,
      'Content-Type': contentType,
    },
    body,
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!res.ok) {
    const upstreamMessage = getUpstreamMessage(data);
    const err = new Error(
      upstreamMessage ? `SVP request failed: ${res.status}: ${upstreamMessage}` : `SVP request failed: ${res.status}`
    );
    err.statusCode = res.status;
    err.details = data;
    err.upstreamMessage = upstreamMessage || undefined;
    throw err;
  }
  return data;
}
