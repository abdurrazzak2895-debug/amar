# SVP Centre-Locked Opaque Session Contract

## Purpose

SVP `exam_session_id` values are opaque encrypted identifiers. Amar must **never decode, rewrite, or city-group** them. The identifier is usable only together with the centre binding returned by the strict centre-scoped session route.

## Read path

The frontend requests the selected centre explicitly:

```http
GET /functions/v1/svp-proxy/exam-sessions?category_id=159&city=Dhaka&exam_date=2026-08-20&test_center_id=220
Authorization: Bearer <current Amar access token>
X-Access-Token: <same current token, if the proxy requires it>
```

The proxy forwards the request to SVP with the stored SVP token, applies `available_seats=greater_than::0`, filters explicit upstream centre IDs, and enriches every returned row. A representative response row is:

```json
{
  "id": "<opaque-svp-session-id>",
  "encrypted_session_id": "<opaque-svp-session-id>",
  "session_binding": {
    "source": "svp-center-scoped-exam-sessions",
    "exam_session_id": "<opaque-svp-session-id>",
    "test_center_id": "220",
    "test_center_name": "Kishoreganj Technical Training Centre",
    "city": "Dhaka"
  },
  "site_id": "220",
  "test_center_id": "220",
  "test_center_name": "Kishoreganj Technical Training Centre",
  "site_city": "Dhaka"
}
```

The UI displays each row as a distinct **First shift**, **Second shift**, **Third shift**, or **Fourth shift** entry. The label is presentation-only; the original opaque ID remains the `<option>` value and is the only session identifier sent to SVP.

## Centre-lock rules

A session is selectable only when its explicit `site_id`, `test_center_id`, or `session_binding.test_center_id` equals the currently selected centre. A city or centre-name match alone is not sufficient. If a session detail response contains an explicit different centre, the session is blocked. If detail contains only a city-level centre, the previously returned same-session binding is used; this is safe because it came from the centre-scoped query.

The following checks run before booking operations:

1. Verify the opaque session ID belongs to the selected-centre row.
2. Fetch session detail and reject any explicit conflicting centre.
3. POST only that opaque `exam_session_id` and the selected `test_center_id` to the temporary-seat route.
4. Reject any hold, reschedule, or reservation response that reports another centre.
5. Never fall back to another centre when the selected centre has no session.

## Hold path

```http
POST /functions/v1/svp-proxy/temporary-seats
Authorization: Bearer <current Amar access token>
Content-Type: application/json

{
  "exam_session_id": "<same-opaque-session-id>",
  "test_center_id": "220"
}
```

The proxy forwards exactly these two fields to SVP. It does not substitute a city-level session or attach a stale centre override.

## Duplicate-labor recovery

SVP may return HTTP 422 with:

```json
{
  "errors": {
    "temporaryseat": {
      "labor_id": ["has already been taken"]
    }
  }
}
```

This means the SVP labor already owns an active temporary seat; it is not evidence that another centre should be selected. Amar therefore makes no second POST. It performs only a read-only lookup:

```http
GET /functions/v1/svp-proxy/temporary-seats?exam_session_id=<opaque-session-id>&test_center_id=220
Authorization: Bearer <current Amar access token>
```

The returned hold is reused only if it has a hold ID and passes the same centre-response guard. If the lookup is unavailable, empty, or reports another centre, Amar clears the local hold state and tells the user to wait for or use the existing hold. No other centre is substituted.

## Laravel implementation guidance

A Laravel route should preserve the opaque value as a string and persist the centre binding alongside it, for example:

```php
$sessionId = (string) $request->string('exam_session_id');
$centerId = (string) $request->string('test_center_id');

if ($sessionId === '' || $centerId === '') {
    abort(422, 'exam_session_id and test_center_id are required');
}

$session = $request->user()->selectedSessions()
    ->where('opaque_session_id', $sessionId)
    ->where('test_center_id', $centerId)
    ->where('exam_date', $request->string('exam_date'))
    ->firstOrFail();

// Forward the exact opaque ID only after the persisted centre binding matches.
```

For every subsequent GET detail, POST hold, and POST reservation request, compare the SVP response centre ID with the persisted `test_center_id`. Treat a missing detail centre as unknown—not as permission to choose another centre—and use the original centre-scoped binding as the fallback.

No SVP access token, Amar access token, or OTP is stored in this document.
