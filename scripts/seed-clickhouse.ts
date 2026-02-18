/**
 * Seed ClickHouse with 90 days of realistic synthetic event data.
 * Run: npx tsx scripts/seed-clickhouse.ts
 */

const CH_URL = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
const CH_DATABASE = process.env.CLICKHOUSE_DATABASE ?? "analytics";
const CH_USER = process.env.CLICKHOUSE_USER;
const CH_PASSWORD = process.env.CLICKHOUSE_PASSWORD;

// --- Config ---

const BRANDS = ["cti", "karen-miles", "gebben-miles", "sporting-clays-academy"] as const;
type Brand = (typeof BRANDS)[number];

const COURSES: Record<Brand, string[]> = {
  cti: ["cti-beginner", "cti-advanced"],
  "karen-miles": ["karen-fundamentals"],
  "gebben-miles": ["gebben-masterclass"],
  "sporting-clays-academy": ["sca-intro"],
};

const INSTRUCTORS: Record<Brand, string[]> = {
  cti: ["instr-cti-01", "instr-cti-02"],
  "karen-miles": ["instr-karen-01"],
  "gebben-miles": ["instr-gebben-01"],
  "sporting-clays-academy": ["instr-sca-01"],
};

const LESSONS_PER_COURSE = 6;
const TOTAL_ANONYMOUS_USERS = 50;
const IDENTIFIED_USERS = 30;
const DAYS = 90;

const EVENT_TYPES = [
  "page_view",
  "video_play",
  "course_enrolled",
  "booking_created",
  "lesson_completed",
  "identify",
] as const;

// --- Helpers ---

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function pick<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fmtTimestamp(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
}

function randomTimestampInRange(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// --- User generation ---

type UserProfile = {
  anonymousId: string;
  userId: string | null;
  email: string | null;
  primaryBrand: Brand;
  secondaryBrands: Brand[];
  sessionId: string;
};

function generateUsers(): UserProfile[] {
  const users: UserProfile[] = [];
  for (let i = 0; i < TOTAL_ANONYMOUS_USERS; i++) {
    const anonId = `anon-${uuid().slice(0, 8)}`;
    const isIdentified = i < IDENTIFIED_USERS;
    const primaryBrand = BRANDS[i % BRANDS.length];

    // ~30% of users visit a second brand
    const secondaryBrands: Brand[] = [];
    if (Math.random() < 0.3) {
      const other = pick(BRANDS.filter((b) => b !== primaryBrand));
      secondaryBrands.push(other);
    }

    users.push({
      anonymousId: anonId,
      userId: isIdentified ? `user-${String(i + 1).padStart(3, "0")}` : null,
      email: isIdentified ? `user${i + 1}@pursuitshq.test` : null,
      primaryBrand,
      secondaryBrands,
      sessionId: `sess-${uuid().slice(0, 8)}`,
    });
  }
  return users;
}

// --- Event generation ---

type EventRow = {
  event_id: string;
  anonymous_id: string;
  user_id: string;
  session_id: string;
  event_name: string;
  properties: string;
  context: string;
  timestamp: string;
};

type IdentityRow = {
  anonymous_id: string;
  user_id: string;
  email: string | null;
  confidence: number;
  method: string;
  first_seen: string;
  last_seen: string;
  last_event_id: string;
  metadata: string;
};

function generateEventsForUser(
  user: UserProfile,
  windowStart: Date,
  windowEnd: Date,
): { events: EventRow[]; identityRows: IdentityRow[] } {
  const events: EventRow[] = [];
  const identityRows: IdentityRow[] = [];
  const allBrands = [user.primaryBrand, ...user.secondaryBrands];

  // Funnel probabilities (cumulative journey)
  const pageViewCount = 8 + Math.floor(Math.random() * 25); // 8-32 page views
  const videoPlayProb = 0.55;
  const enrollProb = 0.35;
  const bookingProb = 0.15;
  const lessonProb = 0.25;

  // User "arrives" at some point in the window, then is active for a sub-range
  const userStart = randomTimestampInRange(
    windowStart,
    new Date(windowEnd.getTime() - 7 * 86400000),
  );
  const userEnd = randomTimestampInRange(
    new Date(userStart.getTime() + 3 * 86400000),
    windowEnd,
  );

  const makeEvent = (
    eventName: string,
    brand: Brand,
    props: Record<string, unknown>,
    ts: Date,
  ): EventRow => {
    const eid = uuid();
    const isAfterIdentify = user.userId && ts > identifyTime;
    return {
      event_id: eid,
      anonymous_id: user.anonymousId,
      user_id: isAfterIdentify ? user.userId! : "",
      session_id: user.sessionId,
      event_name: eventName,
      properties: JSON.stringify({ brand_id: brand, ...props }),
      context: JSON.stringify({ library: "seed-script", brand_id: brand }),
      timestamp: fmtTimestamp(ts),
    };
  };

  // Identify time: ~40% through the user's active window
  const identifyTime = new Date(
    userStart.getTime() + (userEnd.getTime() - userStart.getTime()) * 0.4,
  );

  // Page views across brands
  for (let i = 0; i < pageViewCount; i++) {
    const brand = pick(allBrands);
    const ts = randomTimestampInRange(userStart, userEnd);
    const pages = ["/", "/courses", "/about", "/schedule", "/instructors", "/pricing"];
    events.push(makeEvent("page_view", brand, { page: pick(pages) }, ts));
  }

  // Video plays
  if (Math.random() < videoPlayProb) {
    const count = 1 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const brand = pick(allBrands);
      const course = pick(COURSES[brand]);
      const ts = randomTimestampInRange(userStart, userEnd);
      events.push(
        makeEvent(
          "video_play",
          brand,
          {
            course_id: course,
            lesson_id: `${course}-L${Math.floor(Math.random() * LESSONS_PER_COURSE) + 1}`,
            instructor_id: pick(INSTRUCTORS[brand]),
            duration_seconds: 30 + Math.floor(Math.random() * 600),
          },
          ts,
        ),
      );
    }
  }

  // Course enrollment
  if (Math.random() < enrollProb) {
    const brand = pick(allBrands);
    const course = pick(COURSES[brand]);
    const ts = randomTimestampInRange(
      new Date(userStart.getTime() + (userEnd.getTime() - userStart.getTime()) * 0.3),
      userEnd,
    );
    events.push(
      makeEvent(
        "course_enrolled",
        brand,
        { course_id: course, instructor_id: pick(INSTRUCTORS[brand]) },
        ts,
      ),
    );

    // Some enrolled users complete lessons
    if (Math.random() < lessonProb) {
      const lessonCount = 1 + Math.floor(Math.random() * LESSONS_PER_COURSE);
      for (let l = 0; l < lessonCount; l++) {
        const lts = randomTimestampInRange(ts, userEnd);
        events.push(
          makeEvent(
            "lesson_completed",
            brand,
            {
              course_id: course,
              lesson_id: `${course}-L${l + 1}`,
              instructor_id: pick(INSTRUCTORS[brand]),
            },
            lts,
          ),
        );
      }
    }
  }

  // Booking
  if (Math.random() < bookingProb) {
    const brand = pick(allBrands);
    const ts = randomTimestampInRange(
      new Date(userStart.getTime() + (userEnd.getTime() - userStart.getTime()) * 0.6),
      userEnd,
    );
    events.push(
      makeEvent(
        "booking_created",
        brand,
        {
          course_id: pick(COURSES[brand]),
          instructor_id: pick(INSTRUCTORS[brand]),
          amount_cents: pick([4900, 9900, 14900, 19900]),
        },
        ts,
      ),
    );
  }

  // Identify event + identity row
  if (user.userId) {
    const eid = uuid();
    events.push({
      event_id: eid,
      anonymous_id: user.anonymousId,
      user_id: user.userId,
      session_id: user.sessionId,
      event_name: "identify",
      properties: JSON.stringify({
        email: user.email,
        brand_id: user.primaryBrand,
      }),
      context: JSON.stringify({ library: "seed-script" }),
      timestamp: fmtTimestamp(identifyTime),
    });

    identityRows.push({
      anonymous_id: user.anonymousId,
      user_id: user.userId,
      email: user.email,
      confidence: 1.0,
      method: "identify",
      first_seen: fmtTimestamp(userStart),
      last_seen: fmtTimestamp(userEnd),
      last_event_id: eid,
      metadata: JSON.stringify({ source: "seed-script" }),
    });
  }

  // Sort events by timestamp
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return { events, identityRows };
}

// --- ClickHouse HTTP insert ---

async function insertRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;

  const endpoint = new URL(CH_URL);
  endpoint.searchParams.set("query", `INSERT INTO ${CH_DATABASE}.${table} FORMAT JSONEachRow`);

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (CH_USER) {
    headers.authorization = `Basic ${Buffer.from(`${CH_USER}:${CH_PASSWORD ?? ""}`).toString("base64")}`;
  }

  const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const res = await fetch(endpoint.toString(), { method: "POST", headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ClickHouse insert into ${table} failed (${res.status}): ${text}`);
  }
}

// --- Main ---

async function main() {
  const now = new Date();
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - DAYS * 86400000);

  console.log("=== PursuitsHQ ClickHouse Seed ===");
  console.log(`  Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);
  console.log(`  ClickHouse: ${CH_URL} / ${CH_DATABASE}`);
  console.log(`  Users: ${TOTAL_ANONYMOUS_USERS} anonymous, ${IDENTIFIED_USERS} identified`);
  console.log(`  Brands: ${BRANDS.join(", ")}`);
  console.log();

  const users = generateUsers();
  let totalEvents = 0;
  let totalIdentity = 0;

  const BATCH_SIZE = 500;
  let eventBatch: EventRow[] = [];
  let identityBatch: IdentityRow[] = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const { events, identityRows } = generateEventsForUser(user, windowStart, windowEnd);

    eventBatch.push(...events);
    identityBatch.push(...identityRows);

    // Flush in batches
    if (eventBatch.length >= BATCH_SIZE) {
      await insertRows("events", eventBatch);
      totalEvents += eventBatch.length;
      eventBatch = [];
    }
    if (identityBatch.length >= BATCH_SIZE) {
      await insertRows("identity_graph", identityBatch);
      totalIdentity += identityBatch.length;
      identityBatch = [];
    }

    if ((i + 1) % 10 === 0 || i === users.length - 1) {
      console.log(
        `  [${i + 1}/${users.length}] users processed — ${totalEvents + eventBatch.length} events, ${totalIdentity + identityBatch.length} identity rows buffered`,
      );
    }
  }

  // Flush remaining
  if (eventBatch.length > 0) {
    await insertRows("events", eventBatch);
    totalEvents += eventBatch.length;
  }
  if (identityBatch.length > 0) {
    await insertRows("identity_graph", identityBatch);
    totalIdentity += identityBatch.length;
  }

  console.log();
  console.log(`Done! Inserted ${totalEvents} events and ${totalIdentity} identity rows.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
