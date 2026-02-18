"use client";

import { analytics } from "@/lib/rudderstack/client";

export default function EventDemo() {
  return (
    <section className="w-full max-w-xl rounded-xl border border-black/10 p-4 sm:p-6">
      <h2 className="text-base font-semibold">Analytics Event Demo</h2>
      <p className="mt-1 text-sm text-black/70">
        Click to emit client-side events via RudderStack.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-black/90"
          onClick={() =>
            analytics.videoPlay({
              video_id: crypto.randomUUID(),
              course_id: "course_demo_001",
              position_seconds: 0,
            })
          }
        >
          video_play
        </button>
        <button
          type="button"
          className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
          onClick={() =>
            analytics.courseEnrolled({
              course_id: "course_demo_001",
              price_cents: 9900,
              currency: "USD",
            })
          }
        >
          course_enrolled
        </button>
        <button
          type="button"
          className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
          onClick={() =>
            analytics.bookingCreated({
              booking_id: crypto.randomUUID(),
              service: "1:1 coaching",
              start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            })
          }
        >
          booking_created
        </button>
      </div>
    </section>
  );
}

