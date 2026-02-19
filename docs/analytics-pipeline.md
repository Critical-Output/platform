# Analytics Pipeline (RudderStack + ClickHouse)

This repo sends client-side clickstream events through RudderStack and into ClickHouse using a RudderStack ClickHouse warehouse destination.  
`POST /api/events` is the backend event ingestion route for server-side emissions.

## 1) Start ClickHouse (local dev)

```bash
docker compose -f docker-compose.analytics.yml up -d
```

This mounts `clickhouse/init/001_analytics_schema.sql` into the container for first-run schema creation.

ClickHouse endpoints:

- HTTP: `http://localhost:8123`
- Native: `localhost:9000`

## 2) Configure env vars

Set these in `.env.local`:

- `NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY`
- `NEXT_PUBLIC_RUDDERSTACK_DATA_PLANE_URL`
- `CLICKHOUSE_URL=http://localhost:8123`
- `CLICKHOUSE_DATABASE=analytics`

Required outside local development:

- `EVENTS_API_KEY=...` (required for `POST /api/events` when `NODE_ENV` is not `development`)

Optional:
- `NEXT_PUBLIC_CROSS_DOMAIN_TRACKING_DOMAINS=brand-a.com,brand-b.com` (hostnames only; no scheme/port; supports `*.example.com`)

## 3) RudderStack setup

Use either:

- RudderStack Cloud free tier (recommended for speed), or
- Self-hosted RudderStack (not included in this repo).

Create a JavaScript source and set:

- `NEXT_PUBLIC_RUDDERSTACK_WRITE_KEY` to the source write key
- `NEXT_PUBLIC_RUDDERSTACK_DATA_PLANE_URL` to the data plane URL

### Pipe events into ClickHouse

Configure a RudderStack **Warehouse destination: ClickHouse**:

1. In RudderStack, open the JavaScript source used by this app.
2. Add a destination of type `ClickHouse (Warehouse)`.
3. Configure ClickHouse connection settings to match your environment:
   - Host/URL: from `CLICKHOUSE_URL`
   - Database: `CLICKHOUSE_DATABASE` (default `analytics`)
   - User/password: `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` (if required)
4. Enable the destination and connect it to the JavaScript source.
5. Confirm sync is healthy in RudderStack destination status.

This is the accepted WO-2026-007 ingestion path:

`RudderStack source -> ClickHouse warehouse destination -> ClickHouse`

Separately, the `/api/events` route accepts Segment/RudderStack payloads and internal payloads for backend events, then inserts into:

- `analytics.events`
- `analytics.identity_graph` (only when both `anonymousId` + `userId` are present)

## 4) Server-side event emission (`POST /api/events`)

Validation behavior:

- Payload must be a JSON object or non-empty JSON array of objects.
- Invalid or empty event sets return `400` (no silent `inserted: 0` success).
- Missing/incorrect `x-events-api-key` returns `401` when `EVENTS_API_KEY` is configured.

Expected payload shapes:

- Segment/RudderStack-like:

```json
{
  "type": "track",
  "event": "booking_created",
  "messageId": "0a8db678-f73f-4636-a20d-23d4df011f57",
  "anonymousId": "anon_123",
  "userId": "user_42",
  "properties": { "booking_id": "bk_123", "service": "1:1 coaching" },
  "context": { "session_id": "sess_abc" },
  "timestamp": "2026-02-18T21:10:30.000Z"
}
```

- Internal normalized:

```json
{
  "event_name": "booking_created",
  "event_id": "0a8db678-f73f-4636-a20d-23d4df011f57",
  "anonymous_id": "anon_123",
  "user_id": "user_42",
  "session_id": "sess_abc",
  "properties": { "booking_id": "bk_123", "service": "1:1 coaching" },
  "context": { "source": "backend" },
  "timestamp": "2026-02-18T21:10:30.000Z"
}
```

Example `curl` (with optional API key header):

```bash
curl -X POST "http://localhost:3000/api/events" \
  -H "content-type: application/json" \
  -H "x-events-api-key: ${EVENTS_API_KEY}" \
  -d '{
    "type": "track",
    "event": "course_enrolled",
    "messageId": "82f74d6b-8f4f-45bc-81b6-84f43f6f0cf9",
    "anonymousId": "anon_123",
    "userId": "user_42",
    "properties": { "course_id": "course_demo_001", "price_cents": 9900 }
  }'
```

If `NODE_ENV=development` and `EVENTS_API_KEY` is unset, local calls can omit `x-events-api-key`.  
In non-development environments, `EVENTS_API_KEY` must be set and requests without a matching header are rejected.

## 5) Verify

1. Run the app: `npm run dev`
2. Open `http://localhost:3000`
3. Confirm events are firing in RudderStack (Live Events)
4. Query ClickHouse:

```sql
SELECT event_name, timestamp, anonymous_id, user_id
FROM analytics.events
ORDER BY timestamp DESC
LIMIT 20;
```
