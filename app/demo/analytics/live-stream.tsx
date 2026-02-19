"use client";

import { useEffect, useState, useRef } from "react";

const BRAND_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  cti: { bg: "bg-blue-950/60", text: "text-blue-300", dot: "bg-blue-400" },
  "karen-miles": { bg: "bg-pink-950/60", text: "text-pink-300", dot: "bg-pink-400" },
  "gebben-miles": { bg: "bg-green-950/60", text: "text-green-300", dot: "bg-green-400" },
  "sporting-clays-academy": { bg: "bg-amber-950/60", text: "text-amber-300", dot: "bg-amber-400" },
};

const EVENT_TYPES = [
  { name: "page_view", icon: "\ud83d\udd0d", label: "Page View" },
  { name: "video_play", icon: "\u25b6\ufe0f", label: "Video Play" },
  { name: "course_enrolled", icon: "\ud83d\udcda", label: "Enrolled" },
  { name: "booking_created", icon: "\ud83d\udcc5", label: "Booking" },
  { name: "lesson_completed", icon: "\u2705", label: "Completed" },
];

const BRANDS = ["cti", "karen-miles", "gebben-miles", "sporting-clays-academy"];

const PAGES: Record<string, string[]> = {
  cti: ["/cti/courses", "/cti/beginner/lesson-3", "/cti/advanced/overview", "/cti/instructors/anthony-matarese"],
  "karen-miles": ["/karen-miles/fundamentals", "/karen-miles/about", "/karen-miles/book-session", "/karen-miles/testimonials"],
  "gebben-miles": ["/gebben-miles/masterclass", "/gebben-miles/videos", "/gebben-miles/1-on-1-coaching", "/gebben-miles/schedule"],
  "sporting-clays-academy": ["/sca/intro-course", "/sca/schedule", "/sca/instructors", "/sca/field-guide"],
};

const VIDEOS: Record<string, string[]> = {
  cti: ["CTI Beginner Lesson 3: Stance & Mount", "CTI Advanced: Reading Targets", "Anthony Matarese: Competition Prep"],
  "karen-miles": ["Karen Miles: Fundamentals of Lead", "Karen Miles: Eye Dominance Workshop", "Karen Miles: Mental Game"],
  "gebben-miles": ["Gebben Miles: Masterclass Ep. 7", "Gebben Miles: Station Breakdown", "Gebben Miles: Tournament Recap"],
  "sporting-clays-academy": ["SCA Intro: Safety & Etiquette", "SCA: Course Walk-Through", "SCA: Choke Selection Guide"],
};

const COURSES: Record<string, string[]> = {
  cti: ["cti-beginner", "cti-advanced"],
  "karen-miles": ["karen-fundamentals"],
  "gebben-miles": ["gebben-masterclass"],
  "sporting-clays-academy": ["sca-intro"],
};

const USERS = [
  "user-4a8f", "user-9c2d", "user-e71b", "user-3f5a", "user-b82c",
  "user-6d1e", "user-a47f", "user-c93b", "user-1e8d", "user-7b4a",
  "anon-x8k2", "anon-m3p7", "anon-q5n1", "anon-j9r4", "anon-w2t6",
];

type LiveEvent = {
  id: string;
  timestamp: Date;
  brand: string;
  eventType: (typeof EVENT_TYPES)[number];
  user: string;
  details: string;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateEvent(): LiveEvent {
  const brand = pick(BRANDS);
  const eventType = pick(EVENT_TYPES);
  const user = pick(USERS);

  let details = "";
  switch (eventType.name) {
    case "page_view":
      details = pick(PAGES[brand]);
      break;
    case "video_play":
      details = pick(VIDEOS[brand]);
      break;
    case "course_enrolled":
      details = `Enrolled in ${pick(COURSES[brand])}`;
      break;
    case "booking_created":
      details = `Booked 1:1 session \u2014 ${brand === "cti" ? "Anthony Matarese Jr" : brand === "karen-miles" ? "Karen Miles" : brand === "gebben-miles" ? "Gebben Miles" : "SCA Instructor"}`;
      break;
    case "lesson_completed":
      details = `Completed: ${pick(VIDEOS[brand]).split(":").slice(-1)[0].trim()}`;
      break;
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date(),
    brand,
    eventType,
    user,
    details,
  };
}

export default function LiveEventStream() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [count, setCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Seed with 8 initial events
    const initial: LiveEvent[] = [];
    for (let i = 0; i < 8; i++) {
      const e = generateEvent();
      e.timestamp = new Date(Date.now() - (8 - i) * 2000);
      initial.push(e);
    }
    setEvents(initial);
    setCount(initial.length);

    const interval = setInterval(() => {
      const delay = 1000 + Math.random() * 2000;
      setTimeout(() => {
        setEvents((prev) => {
          const next = [generateEvent(), ...prev];
          return next.slice(0, 15);
        });
        setCount((c) => c + 1);
      }, delay - 1000);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-400 font-medium uppercase tracking-wider">Live</span>
        </div>
        <span className="text-xs text-gray-500 tabular-nums">{count} events processed</span>
      </div>

      <div ref={containerRef} className="space-y-1.5 overflow-hidden">
        {events.map((event, i) => {
          const colors = BRAND_COLORS[event.brand] ?? BRAND_COLORS.cti;
          return (
            <div
              key={event.id}
              className="flex items-start gap-3 rounded-lg bg-gray-800/40 px-3 py-2.5 transition-all duration-500"
              style={{
                animation: i === 0 ? "slideIn 0.4s ease-out" : undefined,
                opacity: 1 - i * 0.04,
              }}
            >
              <span className="text-base leading-none mt-0.5 shrink-0">{event.eventType.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>
                    <span className={`inline-block h-1 w-1 rounded-full ${colors.dot}`} />
                    {event.brand}
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">{event.user}</span>
                  <span className="text-[10px] text-gray-600 ml-auto tabular-nums">
                    {event.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-gray-300 mt-0.5 truncate">{event.details}</p>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
