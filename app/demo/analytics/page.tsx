import { getClickHouseConfigFromEnv, queryJson } from "@/lib/clickhouse/http";
import {
  sampleOverview,
  sampleCrossBrand,
  sampleFunnel,
  sampleHighIntent,
  sampleDaily,
} from "./sample-data";

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
