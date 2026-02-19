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
  ccw_purchases: string;
  ccw_declines: string;
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
    const ccwPurchases = Math.round(events * 0.07 * (0.85 + progress * 0.3));
    const ccwDeclines = Math.round(ccwPurchases * (0.12 - progress * 0.04));

    rows.push({
      day,
      events: String(events + ccwPurchases + ccwDeclines),
      page_views: String(pageViews),
      video_plays: String(videoPlays),
      enrollments: String(enrollments),
      bookings: String(bookings),
      ccw_purchases: String(ccwPurchases),
      ccw_declines: String(ccwDeclines),
    });
  }
  return rows;
}

// --- Exported sample datasets ---

export const sampleOverview: OverviewRow[] = [
  {
    total_events: "18634",
    unique_users: "1247",
    identified_users: "512",
  },
];

export const sampleCrossBrand: CrossBrandRow[] = [
  {
    user_key: "user-maria-chen",
    brands: ["cti", "karen-miles", "gebben-miles"],
    brand_count: "3",
    total_events: "142",
    has_booking: "1",
  },
  {
    user_key: "user-james-okafor",
    brands: ["cti", "sporting-clays-academy"],
    brand_count: "2",
    total_events: "118",
    has_booking: "1",
  },
  {
    user_key: "user-sarah-martinez",
    brands: ["karen-miles", "gebben-miles", "sporting-clays-academy"],
    brand_count: "3",
    total_events: "97",
    has_booking: "1",
  },
  {
    user_key: "user-alex-nguyen",
    brands: ["cti", "karen-miles"],
    brand_count: "2",
    total_events: "84",
    has_booking: "0",
  },
  {
    user_key: "user-priya-patel",
    brands: ["gebben-miles", "cti"],
    brand_count: "2",
    total_events: "76",
    has_booking: "1",
  },
  {
    user_key: "user-david-kim",
    brands: ["sporting-clays-academy", "cti", "karen-miles"],
    brand_count: "3",
    total_events: "63",
    has_booking: "0",
  },
  {
    user_key: "user-rachel-thompson",
    brands: ["karen-miles", "gebben-miles"],
    brand_count: "2",
    total_events: "51",
    has_booking: "0",
  },
  {
    user_key: "user-carlos-rivera",
    brands: ["cti", "sporting-clays-academy"],
    brand_count: "2",
    total_events: "44",
    has_booking: "1",
  },
];

export const sampleFunnel: FunnelRow[] = [
  {
    brand_id: "cti",
    page_views: "3248",
    video_plays: "1134",
    enrollments: "287",
    bookings: "96",
  },
  {
    brand_id: "karen-miles",
    page_views: "2107",
    video_plays: "683",
    enrollments: "148",
    bookings: "43",
  },
  {
    brand_id: "gebben-miles",
    page_views: "1632",
    video_plays: "524",
    enrollments: "101",
    bookings: "32",
  },
  {
    brand_id: "sporting-clays-academy",
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
    brands_visited: ["cti", "karen-miles"],
  },
  {
    user_key: "user-linda-foster",
    video_plays: "11",
    brands_visited: ["gebben-miles", "sporting-clays-academy", "cti"],
  },
  {
    user_key: "user-tom-baker",
    video_plays: "9",
    brands_visited: ["cti"],
  },
  {
    user_key: "user-aisha-johnson",
    video_plays: "8",
    brands_visited: ["karen-miles", "gebben-miles"],
  },
  {
    user_key: "user-diego-morales",
    video_plays: "7",
    brands_visited: ["sporting-clays-academy"],
  },
  {
    user_key: "user-emma-clark",
    video_plays: "5",
    brands_visited: ["cti", "karen-miles", "gebben-miles"],
  },
];

export const sampleDaily: DailyRow[] = generateDailyData();

// --- Section 6: Customer 360 Journey Timeline ---

export type JourneyStep = {
  timestamp: string;
  brand: "cti" | "karen-miles" | "gebben-miles" | "sporting-clays-academy";
  eventType: string;
  details: string;
};

export type CustomerJourney = {
  userId: string;
  displayName: string;
  journeySteps: JourneyStep[];
};

export const sampleJourneys: CustomerJourney[] = [
  {
    userId: "user-maria-chen",
    displayName: "Maria Chen",
    journeySteps: [
      { timestamp: "Jan 4, 10:12 AM", brand: "cti", eventType: "page_view", details: "Browsed CTI homepage (anonymous)" },
      { timestamp: "Jan 4, 10:18 AM", brand: "cti", eventType: "video_play", details: "Watched CTI Beginner Lesson 1 preview" },
      { timestamp: "Jan 6, 2:45 PM", brand: "cti", eventType: "identify", details: "Created account \u2014 maria.chen@email.com" },
      { timestamp: "Jan 6, 2:51 PM", brand: "cti", eventType: "course_enrolled", details: "Enrolled in CTI Beginner course" },
      { timestamp: "Jan 8, 9:30 AM", brand: "cti", eventType: "lesson_completed", details: "Completed CTI Beginner Lesson 3: Stance & Mount" },
      { timestamp: "Jan 12, 4:15 PM", brand: "karen-miles", eventType: "page_view", details: "Discovered Karen Miles via cross-sell banner" },
      { timestamp: "Jan 12, 4:22 PM", brand: "karen-miles", eventType: "video_play", details: "Watched Karen Miles: Eye Dominance Workshop" },
      { timestamp: "Jan 14, 11:00 AM", brand: "karen-miles", eventType: "course_enrolled", details: "Enrolled in Karen Miles Fundamentals" },
      { timestamp: "Jan 18, 3:30 PM", brand: "gebben-miles", eventType: "page_view", details: "Explored Gebben Miles Masterclass page" },
      { timestamp: "Jan 18, 3:45 PM", brand: "gebben-miles", eventType: "video_play", details: "Watched Gebben Miles: Station Breakdown" },
      { timestamp: "Jan 22, 10:00 AM", brand: "karen-miles", eventType: "booking_created", details: "Booked 1:1 session with Karen Miles ($150)" },
      { timestamp: "Jan 28, 2:00 PM", brand: "gebben-miles", eventType: "course_enrolled", details: "Enrolled in Gebben Miles Masterclass ($299)" },
    ],
  },
  {
    userId: "user-james-okafor",
    displayName: "James Okafor",
    journeySteps: [
      { timestamp: "Jan 10, 8:45 AM", brand: "sporting-clays-academy", eventType: "page_view", details: "Landed on SCA Intro from Google search" },
      { timestamp: "Jan 10, 8:52 AM", brand: "sporting-clays-academy", eventType: "video_play", details: "Watched SCA: Safety & Etiquette" },
      { timestamp: "Jan 10, 9:15 AM", brand: "sporting-clays-academy", eventType: "identify", details: "Signed up \u2014 james.okafor@email.com" },
      { timestamp: "Jan 11, 7:30 PM", brand: "sporting-clays-academy", eventType: "course_enrolled", details: "Enrolled in SCA Intro ($79)" },
      { timestamp: "Jan 15, 10:00 AM", brand: "sporting-clays-academy", eventType: "lesson_completed", details: "Completed SCA Intro: Choke Selection" },
      { timestamp: "Jan 17, 6:20 PM", brand: "cti", eventType: "page_view", details: "Clicked \u201cLevel Up with CTI\u201d recommendation" },
      { timestamp: "Jan 17, 6:35 PM", brand: "cti", eventType: "video_play", details: "Watched CTI Advanced: Reading Targets" },
      { timestamp: "Jan 19, 9:00 AM", brand: "cti", eventType: "course_enrolled", details: "Enrolled in CTI Advanced ($199)" },
      { timestamp: "Jan 24, 11:30 AM", brand: "cti", eventType: "lesson_completed", details: "Completed CTI Advanced Lesson 2" },
      { timestamp: "Jan 28, 4:00 PM", brand: "cti", eventType: "booking_created", details: "Booked 1:1 with Anthony Matarese Jr ($250)" },
    ],
  },
  {
    userId: "user-sarah-martinez",
    displayName: "Sarah Martinez",
    journeySteps: [
      { timestamp: "Jan 8, 12:30 PM", brand: "karen-miles", eventType: "page_view", details: "Visited Karen Miles page from Instagram ad" },
      { timestamp: "Jan 8, 12:42 PM", brand: "karen-miles", eventType: "video_play", details: "Watched Karen Miles: Mental Game preview" },
      { timestamp: "Jan 9, 8:00 AM", brand: "karen-miles", eventType: "identify", details: "Created account \u2014 sarah.m@email.com" },
      { timestamp: "Jan 9, 8:10 AM", brand: "karen-miles", eventType: "course_enrolled", details: "Enrolled in Karen Miles Fundamentals ($129)" },
      { timestamp: "Jan 13, 3:15 PM", brand: "karen-miles", eventType: "lesson_completed", details: "Completed Fundamentals: Lead & Follow-Through" },
      { timestamp: "Jan 16, 5:00 PM", brand: "gebben-miles", eventType: "page_view", details: "Browsed Gebben Miles via \u201cStudents Also Tried\u201d" },
      { timestamp: "Jan 16, 5:15 PM", brand: "gebben-miles", eventType: "video_play", details: "Watched Gebben Miles: Tournament Recap" },
      { timestamp: "Jan 20, 9:45 AM", brand: "gebben-miles", eventType: "booking_created", details: "Booked 1:1 coaching with Gebben Miles ($200)" },
      { timestamp: "Jan 25, 2:30 PM", brand: "sporting-clays-academy", eventType: "page_view", details: "Explored SCA Course Walk-Through page" },
      { timestamp: "Jan 27, 10:00 AM", brand: "sporting-clays-academy", eventType: "course_enrolled", details: "Enrolled in SCA Intro ($79)" },
      { timestamp: "Feb 1, 11:00 AM", brand: "sporting-clays-academy", eventType: "lesson_completed", details: "Completed SCA Intro: Field Safety" },
    ],
  },
];

// --- Section 7: Revenue Attribution ---

export type RevenueByBrand = {
  brand: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
};

export type RevenueByCourse = {
  course: string;
  brand: string;
  revenue: number;
  enrollments: number;
};

export type RevenueByInstructor = {
  instructor: string;
  brand: string;
  revenue: number;
  sessions: number;
};

export type MrrMonth = {
  month: string;
  mrr: number;
};

export const sampleRevenueByBrand: RevenueByBrand[] = [
  { brand: "CCW", revenue: 229675, orders: 1928, avgOrderValue: 119.13 },
  { brand: "cti", revenue: 48750, orders: 287, avgOrderValue: 169.86 },
  { brand: "karen-miles", revenue: 28920, orders: 191, avgOrderValue: 151.41 },
  { brand: "gebben-miles", revenue: 21450, orders: 133, avgOrderValue: 161.28 },
  { brand: "sporting-clays-academy", revenue: 8640, orders: 69, avgOrderValue: 125.22 },
];

export const sampleRevenueByCourse: RevenueByCourse[] = [
  { course: "CTI Advanced", brand: "cti", revenue: 22610, enrollments: 114 },
  { course: "Gebben Masterclass", brand: "gebben-miles", revenue: 17670, enrollments: 59 },
  { course: "Karen Fundamentals", brand: "karen-miles", revenue: 16125, enrollments: 125 },
  { course: "CTI Beginner", brand: "cti", revenue: 14350, enrollments: 205 },
  { course: "SCA Intro", brand: "sporting-clays-academy", revenue: 6241, enrollments: 79 },
];

export const sampleRevenueByInstructor: RevenueByInstructor[] = [
  { instructor: "Anthony Matarese Jr", brand: "cti", revenue: 48750, sessions: 96 },
  { instructor: "Karen Miles", brand: "karen-miles", revenue: 28920, sessions: 43 },
  { instructor: "Gebben Miles", brand: "gebben-miles", revenue: 21450, sessions: 32 },
  { instructor: "Mike Torres", brand: "sporting-clays-academy", revenue: 5120, sessions: 9 },
  { instructor: "Lisa Chen", brand: "sporting-clays-academy", revenue: 3520, sessions: 6 },
];

export const sampleMrr: MrrMonth[] = [
  { month: "Aug", mrr: 6200 },
  { month: "Sep", mrr: 8400 },
  { month: "Oct", mrr: 11800 },
  { month: "Nov", mrr: 14200 },
  { month: "Dec", mrr: 16900 },
  { month: "Jan", mrr: 21500 },
];

// --- Section 9: Cross-Sell Recommendations ---

export type Recommendation = {
  sourceAction: string;
  sourceBrand: string;
  recommendedAction: string;
  recommendedBrand: string;
  conversionPct: number;
  confidence: number;
  sampleSize: number;
};

export const sampleRecommendations: Recommendation[] = [
  {
    sourceAction: "Completed CTI Beginner",
    sourceBrand: "cti",
    recommendedAction: "Enroll in Karen Miles Fundamentals",
    recommendedBrand: "karen-miles",
    conversionPct: 67,
    confidence: 94,
    sampleSize: 205,
  },
  {
    sourceAction: "Watched 3+ Gebben Masterclass videos",
    sourceBrand: "gebben-miles",
    recommendedAction: "Book 1:1 coaching with Gebben Miles",
    recommendedBrand: "gebben-miles",
    conversionPct: 45,
    confidence: 88,
    sampleSize: 142,
  },
  {
    sourceAction: "Completed SCA Intro course",
    sourceBrand: "sporting-clays-academy",
    recommendedAction: "Enroll in CTI Advanced",
    recommendedBrand: "cti",
    conversionPct: 72,
    confidence: 91,
    sampleSize: 79,
  },
  {
    sourceAction: "Booked Karen Miles 1:1",
    sourceBrand: "karen-miles",
    recommendedAction: "Enroll in Gebben Miles Masterclass",
    recommendedBrand: "gebben-miles",
    conversionPct: 38,
    confidence: 82,
    sampleSize: 43,
  },
  {
    sourceAction: "Completed CTI Advanced",
    sourceBrand: "cti",
    recommendedAction: "Book 1:1 with Anthony Matarese Jr",
    recommendedBrand: "cti",
    conversionPct: 56,
    confidence: 96,
    sampleSize: 114,
  },
];

// --- Section 10: Instructor Leaderboard ---

export type InstructorRow = {
  rank: number;
  name: string;
  brand: string;
  students: number;
  avgRating: number;
  videoViews: number;
  bookings: number;
  revenue: number;
  engagementScore: number;
};

export const sampleInstructors: InstructorRow[] = [
  { rank: 1, name: "Anthony Matarese Jr", brand: "cti", students: 319, avgRating: 4.9, videoViews: 8420, bookings: 96, revenue: 48750, engagementScore: 98 },
  { rank: 2, name: "Karen Miles", brand: "karen-miles", students: 191, avgRating: 4.8, videoViews: 5130, bookings: 43, revenue: 28920, engagementScore: 94 },
  { rank: 3, name: "Gebben Miles", brand: "gebben-miles", students: 133, avgRating: 4.8, videoViews: 3940, bookings: 32, revenue: 21450, engagementScore: 89 },
  { rank: 4, name: "Mike Torres", brand: "sporting-clays-academy", students: 45, avgRating: 4.6, videoViews: 1820, bookings: 9, revenue: 5120, engagementScore: 76 },
  { rank: 5, name: "Lisa Chen", brand: "sporting-clays-academy", students: 24, avgRating: 4.7, videoViews: 980, bookings: 6, revenue: 3520, engagementScore: 71 },
];

// --- Section 11: CCW Product Funnel ---

export type CcwFunnelStep = {
  step: string;
  label: string;
  count: number;
};

export const sampleCcwFunnel: CcwFunnelStep[] = [
  { step: "ccw_eval_completed", label: "Eval Completed", count: 2847 },
  { step: "ccw_registration", label: "Registration", count: 1923 },
  { step: "ccw_purchase", label: "Purchase", count: 1241 },
  { step: "ccw_training_upsell", label: "Training Upsell", count: 687 },
];

// --- Section 12: CCW Subscription Health ---

export type CcwDeclineCode = {
  code: string;
  label: string;
  count: number;
  pct: number;
};

export type CcwDeclineTrend = {
  month: string;
  declineRate: number;
};

export type CcwSubscriptionHealth = {
  activeSubscribers: number;
  monthlyRebillRevenue: number;
  avgLifetimeMonths: number;
  churnRate: number;
  totalRebills: number;
  totalDeclines: number;
  recoveryRate: number;
  declineCodes: CcwDeclineCode[];
  declineTrend: CcwDeclineTrend[];
};

export const sampleCcwSubscription: CcwSubscriptionHealth = {
  activeSubscribers: 847,
  monthlyRebillRevenue: 12692,
  avgLifetimeMonths: 14.3,
  churnRate: 6.2,
  totalRebills: 9418,
  totalDeclines: 823,
  recoveryRate: 23,
  declineCodes: [
    { code: "card_declined", label: "Generic Decline", count: 247, pct: 30.0 },
    { code: "insufficient_funds", label: "Insufficient Funds", count: 189, pct: 23.0 },
    { code: "expired_card", label: "Expired Card", count: 148, pct: 18.0 },
    { code: "do_not_honor", label: "Do Not Honor", count: 99, pct: 12.0 },
    { code: "incorrect_cvc", label: "CVC Mismatch", count: 74, pct: 9.0 },
    { code: "processing_error", label: "Processing Error", count: 41, pct: 5.0 },
    { code: "lost_card", label: "Lost Card", count: 25, pct: 3.0 },
  ],
  declineTrend: [
    { month: "Aug", declineRate: 12.4 },
    { month: "Sep", declineRate: 11.1 },
    { month: "Oct", declineRate: 10.3 },
    { month: "Nov", declineRate: 9.6 },
    { month: "Dec", declineRate: 8.8 },
    { month: "Jan", declineRate: 8.0 },
  ],
};
