-- ClickHouse schema for RudderStack-style events + identity graph.
-- Intended for local dev (Docker) or ClickHouse Cloud (run manually).

CREATE DATABASE IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.events
(
  event_id UUID,
  anonymous_id String,
  user_id String,
  session_id String,
  event_name String,
  properties String,
  context String,
  timestamp DateTime64(3, 'UTC'),
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (event_name, timestamp, event_id);

CREATE TABLE IF NOT EXISTS analytics.identity_graph
(
  anonymous_id String,
  user_id String,
  email Nullable(String),
  phone Nullable(String),
  device_fingerprint Nullable(String),
  confidence Float32 DEFAULT 1.0,
  method LowCardinality(String) DEFAULT 'unknown',
  first_seen DateTime64(3, 'UTC'),
  last_seen DateTime64(3, 'UTC'),
  last_event_id UUID,
  metadata String DEFAULT '{}',
  ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(last_seen)
ORDER BY (anonymous_id, user_id, last_seen);

-- Basic materialized views for analytics.

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.user_activity_summary
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(activity_date)
ORDER BY (activity_date, user_key)
AS
SELECT
  toDate(timestamp) AS activity_date,
  if(user_id != '', user_id, anonymous_id) AS user_key,
  count() AS events,
  countIf(event_name = 'page_view') AS page_views,
  countIf(event_name = 'video_play') AS video_plays,
  countIf(event_name = 'course_enrolled') AS course_enrollments,
  countIf(event_name = 'booking_created') AS booking_creations
FROM analytics.events
GROUP BY
  activity_date,
  user_key;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.course_engagement_metrics
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(activity_date)
ORDER BY (activity_date, course_id)
AS
SELECT
  toDate(timestamp) AS activity_date,
  JSONExtractString(properties, 'course_id') AS course_id,
  countIf(event_name = 'video_play') AS video_plays,
  countIf(event_name = 'course_enrolled') AS enrollments
FROM analytics.events
WHERE JSONExtractString(properties, 'course_id') != ''
GROUP BY
  activity_date,
  course_id;

