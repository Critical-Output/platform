# VideoNest Integration Reference

> PursuitsHQ credentials: API Key `BUmZnmsRARlMg6an`, Channel ID `440`

## SDK Installation

```bash
npm install videonest-sdk
```

## Authentication

```typescript
const config = {
  channelId: 440,        // number — PursuitsHQ channel
  apiKey: process.env.VIDEONEST_API_KEY  // 'BUmZnmsRARlMg6an'
};
```

All SDK functions take `config` as the last argument. SDK auto-attaches `Authorization: Bearer` headers.

## Core SDK Functions

### Upload Video

```typescript
import { uploadVideo } from 'videonest-sdk';

uploadVideo(file, {
  metadata: {
    title: 'My Video',
    channelId: 440,
    description: 'Optional',
    tags: ['tag1', 'tag2']
  },
  thumbnail: thumbnailFile, // required (File)
  onProgress: (progress, status) => {
    // status: 'uploading' | 'finalizing' | 'failed' | 'stalled'
    console.log(`${status}: ${progress}%`);
  }
}, config);
// Returns: { success, message?, video?: { id: string } }
```

### Get Video Status

```typescript
import { getVideoStatus } from 'videonest-sdk';

getVideoStatus(videoId, config);
// Returns: { success, status: 'uploading'|'reencoding'|'failed'|'completed'|'unknown', video: { id, title, description, tags, thumbnail, published_at } }
```

### List Videos

```typescript
import { listVideos } from 'videonest-sdk';

listVideos(config);
// Returns: { videos[], totalUploaded, failed, reencoding }
// Each video: { id, title, description, tags, thumbnail, duration, published_at, orientation, status, hosted_files[] }
```

## React Embed Components

```tsx
import { VideonestEmbed, VideonestPreview } from 'videonest-sdk';

// Full player with controls
<VideonestEmbed
  videoId={123456}
  config={config}
  style={{
    width: '100%',
    height: '400px',
    primaryColor: '#ff5500',
    secondaryColor: '#00aaff',
    darkMode: true,
    showTitle: true,
    showDescription: true
  }}
/>

// Lightweight preview/thumbnail player
<VideonestPreview videoId={123456} config={config} style={{ width: '100%', height: '400px' }} />
```

- `VideonestEmbed` — full player with controls
- `VideonestPreview` — lightweight preview/thumbnail player
- Both use identical props
- No built-in aspect ratio — fills container, maintains internal ratio with black bars

## REST API (direct calls)

Base URL: `https://api.videonest.io/v1`

All requests: `Authorization: Bearer YOUR_API_KEY`

### Key Endpoints

```
GET    /channels/{channelId}           # Get channel info
GET    /channels/{channelId}/videos    # List videos in channel
GET    /videos/{videoId}               # Get video + stats
PUT    /videos/{videoId}               # Update video metadata
DELETE /videos/{videoId}               # Delete video

GET    /analytics/channels/{channelId} # Channel analytics (views, watch time, engagement)
GET    /analytics/videos/{videoId}     # Video analytics + audience retention curve
```

### Analytics Query Params

```
GET /analytics/channels/{channelId}?start_date=2026-01-01&end_date=2026-02-01&metrics=views,watch_time,engagement
```

Returns: `{ total_views, total_watch_time, avg_view_duration, engagement_rate, daily_breakdown[] }`

## Webhooks

Configure endpoint URL in VideoNest admin dashboard. VideoNest POSTs on status changes:

```json
{ "id": 12345, "status": "success" }
```

Full webhook events available: `video.created`, `video.published`, `video.deleted`, `channel.created`, `channel.updated`, `analytics.updated`

Implement at `/api/webhooks/videonest` in Next.js app.

## TypeScript Types

```typescript
import { VideoMetadata, UploadOptions, VideonestConfig, UploadResult, VideoStatus } from 'videonest-sdk';
```

## Environment Variables

```bash
VIDEONEST_API_KEY=BUmZnmsRARlMg6an
VIDEONEST_CHANNEL_ID=440
```

## Rate Limits (Business plan)

- 1,000 requests/minute
- 50,000 requests/day

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## WO-004 Implementation Notes

- SCA has 240+ videos — bulk upload will use chunked `uploadVideo()` with progress tracking
- Use `VideonestEmbed` for member-only lesson playback (behind auth check)
- Use `VideonestPreview` for course library previews (public/teaser)
- Wire webhook at `/api/webhooks/videonest` to update video `status` in Supabase `lessons` table
- Video progress tracking: use `onProgress` callback + store in Supabase `progress` table
- Paywall: check `content_access` table before rendering `VideonestEmbed`
