import { createBookingInstructorsGetHandler } from "@/lib/bookings/route-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createBookingInstructorsGetHandler();
