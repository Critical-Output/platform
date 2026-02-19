/**
 * Static fallback data for the analytics demo dashboard.
 * Used when CLICKHOUSE_URL is not configured (e.g. Netlify preview deployments).
 *
 * The numbers tell a compelling story:
 * - CTI is the flagship brand with strong conversion
 * - Cross-brand journeys demonstrate platform value
 * - Growth trend visible in daily data
 */

// --- Types (must match page.tsx) ---

type OverviewRow = {
  total_events: string;
  unique_users: string;
  identified_users: string;
};

type CrossBrandRow = {
  user_key: string;
  brands: string[];
  brand_count: string;
  total_events: string;
  has_booking: string;
};

type FunnelRow = {
  brand_id: string;
  page_views: string;
  video_plays: string;
  enrollments: string;
  bookings: string;
};

type HighIntentRow = {
  user_key: string;
  video_plays: string;
  brands_visited: string[];
};

type DailyRow = {
  day: string;
  events: string;
  page_views: string;
  video_plays: string;
  enrollments: string;
  bookings: string;
};

// --- Helper: generate 30 days of daily data ending yesterday ---

function generateDailyData(): DailyRow[] {
  const rows: DailyRow[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i - 1); // yesterday back 30 days
    const day = d.toISOString().slice(0, 10);

    // Growth curve: events ramp from ~310 to ~520 over the month
    const progress = (29 - i) / 29; // 0 → 1
    const base = 310 + Math.round(progress * 210);
    // Add some weekday/weekend variance + noise
    const dayOfWeek = d.getDay();
    const weekendDip = dayOfWeek === 0 || dayOfWeek === 6 ? 0.72 : 1;
    const noise = 0.92 + Math.sin(i * 2.7) * 0.08 + Math.cos(i * 1.3) * 0.05;
    const events = Math.round(base * weekendDip * noise);

    // Breakdown ratios (approximate)
    const pageViews = Math.round(events * 0.52);
    const videoPlays = Math.round(events * 0.22);
    const enrollments = Math.round(events * 0.08);
    const bookings = Math.round(events * 0.03);

    rows.push({
      day,
      events: String(events),
      page_views: String(pageViews),
      video_plays: String(videoPlays),
      enrollments: String(enrollments),
      bookings: String(bookings),
    });
  }
  return rows;
}

// --- Exported sample datasets ---

export const sampleOverview: OverviewRow[] = [
  {
    total_events: "12847",
    unique_users: "863",
    identified_users: "347",
  },
];

export const sampleCrossBrand: CrossBrandRow[] = [
  {
    user_key: "user-maria-chen",
    brands: ["CTI", "Summit Academy", "Pacific Trades"],
    brand_count: "3",
    total_events: "142",
    has_booking: "1",
  },
  {
    user_key: "user-james-okafor",
    brands: ["CTI", "Heritage Craft"],
    brand_count: "2",
    total_events: "118",
    has_booking: "1",
  },
  {
    user_key: "user-sarah-martinez",
    brands: ["Summit Academy", "Pacific Trades", "Heritage Craft"],
    brand_count: "3",
    total_events: "97",
    has_booking: "1",
  },
  {
    user_key: "user-alex-nguyen",
    brands: ["CTI", "Summit Academy"],
    brand_count: "2",
    total_events: "84",
    has_booking: "0",
  },
  {
    user_key: "user-priya-patel",
    brands: ["Pacific Trades", "CTI"],
    brand_count: "2",
    total_events: "76",
    has_booking: "1",
  },
  {
    user_key: "user-david-kim",
    brands: ["Heritage Craft", "CTI", "Summit Academy"],
    brand_count: "3",
    total_events: "63",
    has_booking: "0",
  },
  {
    user_key: "user-rachel-thompson",
    brands: ["Summit Academy", "Pacific Trades"],
    brand_count: "2",
    total_events: "51",
    has_booking: "0",
  },
  {
    user_key: "user-carlos-rivera",
    brands: ["CTI", "Heritage Craft"],
    brand_count: "2",
    total_events: "44",
    has_booking: "1",
  },
];

export const sampleFunnel: FunnelRow[] = [
  {
    brand_id: "CTI",
    page_views: "3248",
    video_plays: "1134",
    enrollments: "287",
    bookings: "96",
  },
  {
    brand_id: "Summit Academy",
    page_views: "2107",
    video_plays: "683",
    enrollments: "148",
    bookings: "43",
  },
  {
    brand_id: "Pacific Trades",
    page_views: "1632",
    video_plays: "524",
    enrollments: "101",
    bookings: "32",
  },
  {
    brand_id: "Heritage Craft",
    page_views: "918",
    video_plays: "296",
    enrollments: "54",
    bookings: "15",
  },
];

export const sampleHighIntent: HighIntentRow[] = [
  {
    user_key: "user-kevin-wu",
    video_plays: "14",
    brands_visited: ["CTI", "Summit Academy"],
  },
  {
    user_key: "user-linda-foster",
    video_plays: "11",
    brands_visited: ["Pacific Trades", "Heritage Craft", "CTI"],
  },
  {
    user_key: "user-tom-baker",
    video_plays: "9",
    brands_visited: ["CTI"],
  },
  {
    user_key: "user-aisha-johnson",
    video_plays: "8",
    brands_visited: ["Summit Academy", "Pacific Trades"],
  },
  {
    user_key: "user-diego-morales",
    video_plays: "7",
    brands_visited: ["Heritage Craft"],
  },
  {
    user_key: "user-emma-clark",
    video_plays: "5",
    brands_visited: ["CTI", "Summit Academy", "Pacific Trades"],
  },
];

export const sampleDaily: DailyRow[] = generateDailyData();
