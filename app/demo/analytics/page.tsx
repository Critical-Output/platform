import { getClickHouseConfigFromEnv, queryJson } from "@/lib/clickhouse/http";
import {
  sampleOverview,
  sampleCrossBrand,
  sampleFunnel,
  sampleHighIntent,
  sampleDaily,
  sampleJourneys,
  sampleRevenueByBrand,
  sampleRevenueByCourse,
  sampleRevenueByInstructor,
  sampleMrr,
  sampleRecommendations,
  sampleInstructors,
} from "./sample-data";
import LiveEventStream from "./live-stream";

export const dynamic = "force-dynamic";

// --- Query helpers ---

type OverviewRow = {
  total_events: string;
  unique_users: string;
  identified_users: string;
};

type CrossBrandRow = {
  user_key: string;
  brands: string;
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
  brands_visited: string;
};

type DailyRow = {
  day: string;
  events: string;
  page_views: string;
  video_plays: string;
  enrollments: string;
  bookings: string;
};

async function runQuery<T>(query: string): Promise<T[]> {
  const config = getClickHouseConfigFromEnv();
  if (!config) throw new Error("CLICKHOUSE_URL not configured");
  return queryJson<T>({ config, query });
}

// --- Component ---

export default async function AnalyticsDemoPage() {
  const isLive = getClickHouseConfigFromEnv() !== null;

  const [overview, crossBrand, funnel, highIntent, daily] = isLive
    ? await Promise.all([
        runQuery<OverviewRow>(`
          SELECT
            count() AS total_events,
            uniqExact(if(user_id != '', user_id, anonymous_id)) AS unique_users,
            uniqExactIf(user_id, user_id != '') AS identified_users
          FROM analytics.events
        `),
        runQuery<CrossBrandRow>(`
          SELECT
            if(user_id != '', user_id, anonymous_id) AS user_key,
            groupUniqArrayArray(
              arrayMap(x -> x, [JSONExtractString(properties, 'brand_id')])
            ) AS brands,
            length(brands) AS brand_count,
            count() AS total_events,
            countIf(event_name = 'booking_created') > 0 AS has_booking
          FROM analytics.events
          WHERE JSONExtractString(properties, 'brand_id') != ''
          GROUP BY user_key
          HAVING brand_count >= 2
          ORDER BY total_events DESC
          LIMIT 20
        `),
        runQuery<FunnelRow>(`
          SELECT
            JSONExtractString(properties, 'brand_id') AS brand_id,
            countIf(event_name = 'page_view') AS page_views,
            countIf(event_name = 'video_play') AS video_plays,
            countIf(event_name = 'course_enrolled') AS enrollments,
            countIf(event_name = 'booking_created') AS bookings
          FROM analytics.events
          WHERE brand_id != ''
          GROUP BY brand_id
          ORDER BY page_views DESC
        `),
        runQuery<HighIntentRow>(`
          SELECT
            if(user_id != '', user_id, anonymous_id) AS user_key,
            countIf(event_name = 'video_play') AS video_plays,
            groupUniqArray(JSONExtractString(properties, 'brand_id')) AS brands_visited
          FROM analytics.events
          GROUP BY user_key
          HAVING video_plays >= 5
            AND countIf(event_name = 'booking_created') = 0
          ORDER BY video_plays DESC
          LIMIT 15
        `),
        runQuery<DailyRow>(`
          SELECT
            toDate(timestamp) AS day,
            count() AS events,
            countIf(event_name = 'page_view') AS page_views,
            countIf(event_name = 'video_play') AS video_plays,
            countIf(event_name = 'course_enrolled') AS enrollments,
            countIf(event_name = 'booking_created') AS bookings
          FROM analytics.events
          WHERE timestamp >= now() - INTERVAL 30 DAY
          GROUP BY day
          ORDER BY day ASC
        `),
      ])
    : [sampleOverview, sampleCrossBrand, sampleFunnel, sampleHighIntent, sampleDaily];

  const ov = overview[0] ?? { total_events: "0", unique_users: "0", identified_users: "0" };
  const conversionRate =
    Number(ov.unique_users) > 0
      ? ((Number(ov.identified_users) / Number(ov.unique_users)) * 100).toFixed(1)
      : "0";

  // Find max page_views for funnel bar scaling
  const maxPageViews = Math.max(...funnel.map((r) => Number(r.page_views)), 1);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 md:p-10">
      {/* Mode banner */}
      {isLive ? (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-950/60 border border-emerald-800/40 px-3 py-1 text-xs text-emerald-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live &mdash; Connected to ClickHouse
        </div>
      ) : (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-950/60 border border-amber-800/40 px-3 py-1 text-xs text-amber-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          Demo Mode &mdash; Showing sample data
        </div>
      )}

      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          PursuitsHQ Analytics Demo
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          {isLive
            ? <>Powered by ClickHouse &#9889; &middot; Live data &middot; 90-day window</>
            : <>Powered by ClickHouse &#9889; &middot; Synthetic sample data</>}
        </p>
      </header>

      {/* Section 1: Overview Cards */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-4">Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card label="Total Events" value={Number(ov.total_events).toLocaleString()} />
          <Card label="Unique Users" value={Number(ov.unique_users).toLocaleString()} />
          <Card label="Identified Users" value={Number(ov.identified_users).toLocaleString()} />
          <Card label="Conversion Rate" value={`${conversionRate}%`} />
        </div>
      </section>

      {/* Section 2: Cross-Brand Journey */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-4">Cross-Brand Journeys</h2>
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Brands</th>
                <th className="text-right px-4 py-3 font-medium">Events</th>
                <th className="text-left px-4 py-3 font-medium">Stage</th>
              </tr>
            </thead>
            <tbody>
              {crossBrand.map((row) => {
                const brands = Array.isArray(row.brands)
                  ? (row.brands as string[])
                  : [];
                return (
                  <tr key={row.user_key} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-300">
                      {row.user_key}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {brands.map((b) => (
                          <span
                            key={b}
                            className="inline-block rounded-full bg-indigo-950 px-2 py-0.5 text-xs text-indigo-300"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Number(row.total_events).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.has_booking === "1" || row.has_booking === "true"
                            ? "bg-emerald-950 text-emerald-300"
                            : "bg-amber-950 text-amber-300"
                        }`}
                      >
                        {row.has_booking === "1" || row.has_booking === "true"
                          ? "Booked"
                          : "Exploring"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {crossBrand.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    No cross-brand journeys found. Run the seed script first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Funnel by Brand */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-4">Funnel by Brand</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {funnel.map((row) => (
            <div key={row.brand_id} className="bg-gray-900 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">{row.brand_id}</h3>
              <FunnelBar label="Page Views" value={Number(row.page_views)} max={maxPageViews} color="bg-blue-500" />
              <FunnelBar label="Video Plays" value={Number(row.video_plays)} max={maxPageViews} color="bg-violet-500" />
              <FunnelBar label="Enrollments" value={Number(row.enrollments)} max={maxPageViews} color="bg-amber-500" />
              <FunnelBar label="Bookings" value={Number(row.bookings)} max={maxPageViews} color="bg-emerald-500" />
            </div>
          ))}
        </div>
      </section>

      {/* Section 4: High-Intent Users */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-4">
          High-Intent Users
          <span className="ml-2 text-xs font-normal text-gray-500">5+ video plays, no booking</span>
        </h2>
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-right px-4 py-3 font-medium">Video Plays</th>
                <th className="text-left px-4 py-3 font-medium">Brands</th>
              </tr>
            </thead>
            <tbody>
              {highIntent.map((row) => {
                const brands = Array.isArray(row.brands_visited)
                  ? (row.brands_visited as string[])
                  : [];
                return (
                  <tr key={row.user_key} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-300">
                      {row.user_key}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-violet-300 font-semibold">
                      {row.video_plays}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {brands.map((b) => (
                          <span
                            key={b}
                            className="inline-block rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {highIntent.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                    No high-intent users found. Run the seed script first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 5: Daily Activity */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-4">Daily Activity (Last 30 Days)</h2>
        <div className="bg-gray-900 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Events</th>
                <th className="text-right px-4 py-3 font-medium">Page Views</th>
                <th className="text-right px-4 py-3 font-medium">Video Plays</th>
                <th className="text-right px-4 py-3 font-medium">Enrollments</th>
                <th className="text-right px-4 py-3 font-medium">Bookings</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((row) => (
                <tr key={row.day} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-300">{row.day}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(row.events).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-blue-400">{row.page_views}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-violet-400">{row.video_plays}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-400">{row.enrollments}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-400">{row.bookings}</td>
                </tr>
              ))}
              {daily.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    No data for the last 30 days. Run the seed script first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 6: Customer 360 Journey Timeline */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Customer 360 &mdash; Journey Timeline</h2>
        <p className="text-xs text-gray-500 mb-6">Track individual users as they discover, explore, and purchase across the entire brand ecosystem.</p>
        <div className="space-y-8">
          {sampleJourneys.map((journey) => (
            <div key={journey.userId} className="bg-gray-900 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
                  {journey.displayName.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{journey.displayName}</h3>
                  <p className="text-xs text-gray-500 font-mono">{journey.userId}</p>
                </div>
                <div className="ml-auto flex gap-1.5">
                  {Array.from(new Set(journey.journeySteps.map((s) => s.brand))).map((b) => (
                    <span key={b} className={`inline-block h-2 w-2 rounded-full ${brandDotColor(b)}`} />
                  ))}
                </div>
              </div>
              {/* Vertical timeline */}
              <div className="relative ml-4 border-l border-gray-700/50 pl-6 space-y-0">
                {journey.journeySteps.map((step, i) => (
                  <div key={i} className="relative pb-4 last:pb-0">
                    {/* Dot */}
                    <div className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-gray-900 ${brandDotColor(step.brand)}`} />
                    <div className="flex items-start gap-3">
                      <span className="text-base leading-none shrink-0">{eventIcon(step.eventType)}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${brandBadgeClasses(step.brand)}`}>
                            {step.brand}
                          </span>
                          <span className="text-[10px] text-gray-500">{step.timestamp}</span>
                        </div>
                        <p className="text-xs text-gray-300 mt-0.5">{step.details}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 7: Revenue Attribution Dashboard */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Revenue Attribution</h2>
        <p className="text-xs text-gray-500 mb-6">Full revenue breakdown across brands, courses, and instructors.</p>

        {/* Revenue overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 rounded-xl p-5 border border-emerald-900/30">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Revenue</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400 tabular-nums">
              ${sampleRevenueByBrand.reduce((s, r) => s + r.revenue, 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-5 border border-emerald-900/30">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Total Orders</p>
            <p className="mt-1 text-2xl font-bold text-white tabular-nums">
              {sampleRevenueByBrand.reduce((s, r) => s + r.orders, 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-5 border border-emerald-900/30">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Avg Order Value</p>
            <p className="mt-1 text-2xl font-bold text-white tabular-nums">
              ${(sampleRevenueByBrand.reduce((s, r) => s + r.revenue, 0) / sampleRevenueByBrand.reduce((s, r) => s + r.orders, 0)).toFixed(0)}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl p-5 border border-emerald-900/30">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Current MRR</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400 tabular-nums">
              ${sampleMrr[sampleMrr.length - 1].mrr.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Revenue by Brand */}
          <div className="bg-gray-900 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Revenue by Brand</h3>
            {(() => {
              const maxRev = Math.max(...sampleRevenueByBrand.map((r) => r.revenue));
              return sampleRevenueByBrand.map((row) => (
                <div key={row.brand} className="mb-3 last:mb-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{row.brand}</span>
                    <span className="text-emerald-400 font-semibold tabular-nums">${row.revenue.toLocaleString()}</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                      style={{ width: `${(row.revenue / maxRev) * 100}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>

          {/* Revenue by Course (Top 5) */}
          <div className="bg-gray-900 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Top Courses by Revenue</h3>
            {(() => {
              const maxRev = Math.max(...sampleRevenueByCourse.map((r) => r.revenue));
              return sampleRevenueByCourse.map((row) => (
                <div key={row.course} className="mb-3 last:mb-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-400">{row.course} <span className="text-gray-600">({row.enrollments} enrolled)</span></span>
                    <span className="text-emerald-400 font-semibold tabular-nums">${row.revenue.toLocaleString()}</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400"
                      style={{ width: `${(row.revenue / maxRev) * 100}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>

          {/* Revenue by Instructor */}
          <div className="bg-gray-900 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Revenue by Instructor</h3>
            <div className="space-y-3">
              {sampleRevenueByInstructor.map((row) => (
                <div key={row.instructor} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {row.instructor.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-medium truncate">{row.instructor}</p>
                    <p className="text-[10px] text-gray-500">{row.brand} &middot; {row.sessions} sessions</p>
                  </div>
                  <span className="text-sm text-emerald-400 font-semibold tabular-nums">${row.revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* MRR Trend */}
          <div className="bg-gray-900 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Monthly Recurring Revenue</h3>
            <div className="flex items-end gap-3 h-32">
              {(() => {
                const maxMrr = Math.max(...sampleMrr.map((m) => m.mrr));
                return sampleMrr.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-emerald-400 tabular-nums">${(m.mrr / 1000).toFixed(1)}k</span>
                    <div className="w-full rounded-t-md bg-gradient-to-t from-emerald-700 to-emerald-400" style={{ height: `${(m.mrr / maxMrr) * 100}%` }} />
                    <span className="text-[10px] text-gray-500">{m.month}</span>
                  </div>
                ));
              })()}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
              <span>&#9650;</span>
              <span className="font-semibold">+247%</span>
              <span className="text-gray-500">over 6 months</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 8: Live Event Stream */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Live Event Stream</h2>
        <p className="text-xs text-gray-500 mb-4">Real-time events flowing through the PursuitsHQ analytics pipeline.</p>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <LiveEventStream />
        </div>
      </section>

      {/* Section 9: Cross-Sell Recommendation Engine */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Cross-Sell Recommendation Engine</h2>
        <p className="text-xs text-gray-500 mb-6">AI-powered recommendations based on cross-brand behavior patterns.</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sampleRecommendations.map((rec, i) => (
            <div
              key={i}
              className="relative rounded-xl bg-gray-900 p-5 overflow-hidden"
              style={{
                backgroundImage: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(168,85,247,0.08) 100%)",
              }}
            >
              {/* Gradient border effect */}
              <div className="absolute inset-0 rounded-xl border border-indigo-500/20" />
              <div className="relative">
                {/* Source */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${brandBadgeClasses(rec.sourceBrand)}`}>
                    {rec.sourceBrand}
                  </span>
                  <span className="text-xs text-gray-300">{rec.sourceAction}</span>
                </div>
                {/* Arrow */}
                <div className="flex items-center gap-2 mb-3 pl-2">
                  <span className="text-indigo-400">&#8595;</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">recommends</span>
                </div>
                {/* Target */}
                <div className="flex items-center gap-2 mb-4">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${brandBadgeClasses(rec.recommendedBrand)}`}>
                    {rec.recommendedBrand}
                  </span>
                  <span className="text-xs text-white font-medium">{rec.recommendedAction}</span>
                </div>
                {/* Stats */}
                <div className="flex items-center gap-4 pt-3 border-t border-gray-800">
                  <div>
                    <p className="text-lg font-bold text-indigo-400 tabular-nums">{rec.conversionPct}%</p>
                    <p className="text-[10px] text-gray-500">conversion</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-purple-400 tabular-nums">{rec.confidence}%</p>
                    <p className="text-[10px] text-gray-500">confidence</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-400 tabular-nums">{rec.sampleSize}</p>
                    <p className="text-[10px] text-gray-500">sample size</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 10: Instructor Leaderboard */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-300 mb-2">Instructor Leaderboard</h2>
        <p className="text-xs text-gray-500 mb-4">Performance rankings across the PursuitsHQ instructor network.</p>
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left px-4 py-3 font-medium w-12">#</th>
                <th className="text-left px-4 py-3 font-medium">Instructor</th>
                <th className="text-left px-4 py-3 font-medium">Brand</th>
                <th className="text-right px-4 py-3 font-medium">Students</th>
                <th className="text-left px-4 py-3 font-medium">Rating</th>
                <th className="text-right px-4 py-3 font-medium">Views</th>
                <th className="text-right px-4 py-3 font-medium">Bookings</th>
                <th className="text-right px-4 py-3 font-medium">Revenue</th>
                <th className="text-right px-4 py-3 font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {sampleInstructors.map((row) => {
                const medal = row.rank === 1 ? "\ud83e\udd47" : row.rank === 2 ? "\ud83e\udd48" : row.rank === 3 ? "\ud83e\udd49" : "";
                const isTop = row.rank === 1;
                return (
                  <tr
                    key={row.name}
                    className={`border-b border-gray-800/50 ${isTop ? "bg-amber-950/20" : "hover:bg-gray-800/30"}`}
                  >
                    <td className="px-4 py-3 text-center">
                      {medal ? <span className="text-base">{medal}</span> : <span className="text-gray-500">{row.rank}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${isTop ? "text-amber-200" : "text-white"}`}>{row.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${brandBadgeClasses(row.brand)}`}>
                        {row.brand}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.students}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-amber-400 text-xs">{"★".repeat(Math.floor(row.avgRating))}{row.avgRating % 1 >= 0.5 ? "½" : ""}</span>
                        <span className="text-xs text-gray-400 tabular-nums">{row.avgRating}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-400">{row.videoViews.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-violet-400">{row.bookings}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-400">${row.revenue.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                        row.engagementScore >= 90
                          ? "bg-emerald-950 text-emerald-300"
                          : row.engagementScore >= 75
                          ? "bg-blue-950 text-blue-300"
                          : "bg-gray-800 text-gray-300"
                      }`}>
                        {row.engagementScore}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// --- Sub-components ---

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 rounded-xl p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, 0.5) : 0;
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span>
        <span className="tabular-nums">{value.toLocaleString()}</span>
      </div>
      <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Brand color helpers used across sections 6-10
function brandDotColor(brand: string): string {
  switch (brand) {
    case "cti": return "bg-blue-400";
    case "karen-miles": return "bg-pink-400";
    case "gebben-miles": return "bg-green-400";
    case "sporting-clays-academy": return "bg-amber-400";
    default: return "bg-gray-400";
  }
}

function brandBadgeClasses(brand: string): string {
  switch (brand) {
    case "cti": return "bg-blue-950/60 text-blue-300";
    case "karen-miles": return "bg-pink-950/60 text-pink-300";
    case "gebben-miles": return "bg-green-950/60 text-green-300";
    case "sporting-clays-academy": return "bg-amber-950/60 text-amber-300";
    default: return "bg-gray-800 text-gray-300";
  }
}

function eventIcon(eventType: string): string {
  switch (eventType) {
    case "page_view": return "\ud83d\udd0d";
    case "video_play": return "\u25b6\ufe0f";
    case "course_enrolled": return "\ud83d\udcda";
    case "booking_created": return "\ud83d\udcc5";
    case "lesson_completed": return "\u2705";
    case "identify": return "\ud83d\udd11";
    default: return "\u26aa";
  }
}
