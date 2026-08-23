# Portal Availability Gateway Integration

## Scope

Amar now contains server-side consumer implementations for the documented Portal Availability Gateway in both the existing Express backend and a Supabase Edge Function. The Supabase function is the preferred production path for the Amar frontend. This integration is intentionally limited to read-only availability discovery. It does not replace the centre-locked SVP booking proxy and it does not expose a booking, hold, reservation, payment, OTP, or account-edit route.

The source contract is `PortalAvailabilityGateway—ConsumerSamples.md`. Its gateway base URL is `https://takamol.choice-pc-sv.xyz`. The consumer backend sends only `X-Portal-API-Key`; portal cookies, portal `account_id`, and Amar `credential_id` are not forwarded.

## Repository implementation

The repo-native backend is Express under `frontend/backend`; no Laravel or PHP application exists in this repository. The equivalent server routes are available through Express for local/Railway fallback and through the deployed Supabase function for production:

| Amar route | Upstream method | Upstream path | Purpose |
|---|---:|---|---|
| `/api/portal-availability/occupations` or Supabase `/functions/v1/portal-availability-proxy/occupations` | GET | `/api/external/portal-availability/v1/occupations` | Occupation and language metadata |
| `/api/portal-availability/search_dates` or Supabase `/functions/v1/portal-availability-proxy/search_dates` | POST | `/api/external/portal-availability/v1/search_dates` | Available dates and districts |
| `/api/portal-availability/centers` or Supabase `/functions/v1/portal-availability-proxy/centers` | POST | `/api/external/portal-availability/v1/centers` | Date/city centre availability |

The caller must authenticate to Amar with its normal access JWT. The server reads `PORTAL_AVAILABILITY_API_KEY` from its environment and never accepts an API key from request headers or bodies. The upstream gateway receives only the server key and the whitelisted request body.

## Environment configuration

Set these variables as server-side secrets in either the Express/Railway backend or the Supabase project’s Edge Function secrets. Do not place them in Vite or browser environment variables:

```bash
PORTAL_AVAILABILITY_GATEWAY_URL=https://takamol.choice-pc-sv.xyz
PORTAL_AVAILABILITY_API_KEY=pav_live_REPLACE_WITH_KEY
```

For Supabase: Dashboard → Project `xklwzkraobxetxdcysun` → Edge Functions → Secrets. The key must be added as `PORTAL_AVAILABILITY_API_KEY`; the URL has a safe code default but may also be set as `PORTAL_AVAILABILITY_GATEWAY_URL`.

The key is deliberately not added to Git, `.env` files, frontend bundles, URLs, or logs. If it is exposed, revoke and replace it.

## Payload contracts

`search_dates` accepts only:

```json
{
  "category_id": 159,
  "start_from": "2026-08-24"
}
```

`centers` accepts only:

```json
{
  "category_id": 159,
  "city": "Dhaka",
  "date": "2026-08-24",
  "occupation_id": 2061,
  "language_code": "LOABB"
}
```

The backend rejects malformed dates, non-positive IDs, missing city values, and ISO language codes such as `en`. The language field must use the Prometric code supplied by the occupation metadata, such as `LOABB`.

## Centre and booking boundary

The gateway’s selected centre is a local availability value. The gateway does not promise an SVP booking binding and does not expose a booking API. Therefore, its centre response must not be used to construct a temporary-seat or reservation payload directly.

The active Amar SVP booking page continues to use the separate centre-scoped SVP proxy. Its booking flow must retain the selected `test_center_id`, preserve the original opaque exam-session ID, and reject any response-level centre mismatch. A gateway availability result may inform a user-facing availability view, but only the strict SVP centre-scoped session route can authorize an Amar booking.

## Frontend client

`frontend/src/lib/portal-availability-api.ts` provides browser-safe wrappers for the three Amar routes. When `VITE_SUPABASE_URL` is present, it calls the deployed Supabase function; otherwise it falls back to `VITE_BACKEND_URL`. `BookingPage.tsx` now uses the gateway-first occupation → date/city → centre/seat cascade for display, while it still requests the selected centre’s opaque SVP sessions separately before any hold or reservation. It sends Amar access credentials only to the server-side route and does not know or accept `PORTAL_AVAILABILITY_API_KEY`.

The wrappers are:

```ts
getPortalOccupations()
getPortalSearchDates({ category_id, start_from })
getPortalCenters({ category_id, city, date, occupation_id, language_code })
```

## Error handling

The backend preserves the upstream status and message in the normal Express error envelope. In particular:

| Status | Meaning | Action |
|---:|---|---|
| `401` | Missing/invalid Amar access token or gateway key rejected upstream | Reauthenticate or rotate the server key |
| `422` | Invalid payload | Correct IDs, date, city, or Prometric language code |
| `429` | Gateway rate limit | Back off; do not tight-loop |
| `502` | Upstream unavailable | Retry with backoff after checking gateway health |

## Verification performed

Backend contract tests cover default gateway configuration, whitelist payload normalization, Prometric language-code enforcement, server-only API-key forwarding, successful `{ success: true, data }` envelopes, and upstream error propagation. The Supabase function `portal-availability-proxy` was deployed to project `xklwzkraobxetxdcysun` as version 1. Authenticated live checks returned HTTP 200 for occupations, search dates, and centres; the centre response correctly returned the gateway’s availability-only centre names, times, and seat counts. No live gateway key is stored in this repository, and no booking operation is part of this integration.
