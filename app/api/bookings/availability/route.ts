import {
  createBookingAvailabilityGetHandler,
  createBookingAvailabilityPutHandler,
} from "@/lib/bookings/route-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createBookingAvailabilityGetHandler();
export const PUT = createBookingAvailabilityPutHandler();
