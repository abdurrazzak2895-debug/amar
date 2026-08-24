export function getSessionCenterId(session: any): string {
  const center = session?.test_center || {};
  const site = session?.site || {};
  return String(
    session?.test_center_id ??
    session?.response_center_id ??
    session?.responseCenterId ??
    session?.center_id ??
    session?.centerId ??
    center?.test_center_id ??
    center?.response_center_id ??
    center?.responseCenterId ??
    center?.center_id ??
    center?.centerId ??
    center?.site_id ??
    center?.siteId ??
    center?.id ??
    session?.site_id ??
    session?.session_site_id ??
    site?.test_center_id ??
    site?.site_id ??
    site?.id ??
    ""
  ).trim();
}

export function sessionMatchesCenter(session: any, centerId: string | number): boolean {
  const expected = String(centerId || "").trim();
  const actual = getSessionCenterId(session);
  return Boolean(expected && actual && actual === expected);
}

export function filterSessionsForCenter<T>(sessions: T[], centerId: string | number): T[] {
  return sessions.filter((session) => sessionMatchesCenter(session, centerId));
}

export function isLiveSession(session: any): boolean {
  const status = String(session?.status || session?.state || "scheduled").toLowerCase();
  const seats = session?.available_seats ?? session?.seats_available ?? session?.remaining_seats;
  return ["scheduled", "active", "available", "open"].includes(status) &&
    (seats == null || Number(seats) > 0);
}

export function filterLiveSessionsForCenter<T>(sessions: T[], centerId: string | number): T[] {
  return filterSessionsForCenter(sessions, centerId).filter(isLiveSession);
}

export function countLiveSessionsForCenter(sessions: any[], centerId: string | number): number {
  return filterLiveSessionsForCenter(sessions, centerId).length;
}

export function visibleCenterIds(sessions: any[]): string[] {
  return Array.from(new Set(
    sessions.filter(isLiveSession).map(getSessionCenterId).filter(Boolean)
  ));
}
