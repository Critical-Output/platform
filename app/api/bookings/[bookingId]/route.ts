import { createBookingPatchHandler } from "@/lib/bookings/route-handlers";

export const runtime = "nodejs";

export const PATCH = createBookingPatchHandler();
