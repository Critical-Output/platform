import { createBookingRemindersPostHandler } from "@/lib/bookings/route-handlers";

export const runtime = "nodejs";

export const POST = createBookingRemindersPostHandler();
