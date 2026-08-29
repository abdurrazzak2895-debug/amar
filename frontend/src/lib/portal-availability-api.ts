const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, '') || '';
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim().replace(/\/+$/, '') || '';
// Portal Availability Gateway is intentionally disabled. Keep the endpoint
// configuration below for rollback, but do not issue availability requests.
const PORTAL_AVAILABILITY_DISABLED = true;
const GATEWAY_BASE = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/portal-availability-proxy`
  : BACKEND_URL
    ? `${BACKEND_URL}/api/portal-availability`
    : '';

export interface PortalAvailabilityEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

function getCandidateToken(): string | null {
  return localStorage.getItem('accessToken');
}

function getAccessPortalToken(): string | null {
  return localStorage.getItem('access_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (PORTAL_AVAILABILITY_DISABLED) {
    throw Object.assign(new Error('Portal Availability Gateway is disabled.'), { status: 410 });
  }
  if (!GATEWAY_BASE) {
    throw new Error('VITE_SUPABASE_URL or VITE_BACKEND_URL is required for Portal Availability Gateway requests.');
  }

  const candidateToken = getCandidateToken();
  const accessPortalToken = getAccessPortalToken();
  const hasBody = options.body !== undefined;
  const response = await fetch(`${GATEWAY_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(candidateToken ? { Authorization: `Bearer ${candidateToken}` } : {}),
      ...(accessPortalToken ? { 'X-Access-Token': accessPortalToken } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload: PortalAvailabilityEnvelope<T> | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { success: false, error: text || 'Gateway request failed.' };
  }

  if (!response.ok || payload?.success !== true) {
    throw Object.assign(
      new Error(payload?.message || payload?.error || `Portal availability request failed (${response.status})`),
      { status: response.status, data: payload },
    );
  }

  return payload.data as T;
}

export function getPortalOccupations<T = unknown>() {
  return request<T>('/occupations', { method: 'GET' });
}

export function getPortalSearchDates<T = unknown>(input: { category_id: number; start_from: string }) {
  return request<T>('/search_dates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getPortalCenters<T = unknown>(input: {
  category_id: number;
  city: string;
  date: string;
  occupation_id: number;
  language_code: string;
}) {
  return request<T>('/centers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
