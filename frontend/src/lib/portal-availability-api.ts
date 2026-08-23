const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim().replace(/\/+$/, '') || '';

export interface PortalAvailabilityEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

function getAccessToken(): string | null {
  return localStorage.getItem('accessToken');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!BACKEND_URL) {
    throw new Error('VITE_BACKEND_URL is required for Portal Availability Gateway requests.');
  }

  const token = getAccessToken();
  const hasBody = options.body !== undefined;
  const response = await fetch(`${BACKEND_URL}/api/portal-availability${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
