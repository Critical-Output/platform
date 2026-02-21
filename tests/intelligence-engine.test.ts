import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildOfferPerformanceRecord,
  calculateAffiliateRevenueShareCents,
  getFunnelStageForEvents,
  getJourneyStageForEvents,
  selectBestOffer,
} from "../lib/intelligence/engine";

const at = (iso: string) => new Date(iso);

test("selectBestOffer applies CTI beginner cross-sell rule within 24h completion window", () => {
  const now = at("2026-02-21T12:00:00.000Z");

  const result = selectBestOffer({
    customerId: "cust_1",
    channel: "email",
    now,
    events: [
      {
        event: "course_completed",
        occurredAt: "2026-02-21T03:00:00.000Z",
        properties: {
          course_title: "CTI Beginner Course",
          course_slug: "cti-beginner-course",
        },
      },
    ],
  });

  assert.equal(result.journeyStage, "customer");
  assert.equal(result.funnelStage, "paid_course");
  assert.equal(result.offer?.id, "cti-beginner-to-karen-advanced-coaching");
  assert.equal(result.offer?.deliveryProvider, "resend");
  assert.equal(result.offer?.triggerEvent, "course_completed");
});

test("selectBestOffer follows funnel progression offers", () => {
  const now = at("2026-02-21T12:00:00.000Z");

  const freeToPaid = selectBestOffer({
    customerId: "cust_2",
    channel: "in_app",
    now,
    events: [{ event: "free_content_viewed", occurredAt: "2026-02-21T10:00:00.000Z" }],
  });
  assert.equal(freeToPaid.offer?.id, "free-content-to-paid-course");

  const paidToGroup = selectBestOffer({
    customerId: "cust_3",
    channel: "sms",
    now,
    events: [{ event: "purchase", occurredAt: "2026-02-21T09:00:00.000Z" }],
  });
  assert.equal(paidToGroup.offer?.id, "paid-course-to-group-coaching");

  const groupToOneOnOne = selectBestOffer({
    customerId: "cust_4",
    channel: "push",
    now,
    events: [{ event: "group_coaching_completed", occurredAt: "2026-02-21T08:00:00.000Z" }],
  });
  assert.equal(groupToOneOnOne.offer?.id, "group-coaching-to-one-on-one");

  const oneOnOneToEquipment = selectBestOffer({
    customerId: "cust_5",
    channel: "qr",
    now,
    events: [{ event: "one_on_one_completed", occurredAt: "2026-02-21T07:00:00.000Z" }],
  });
  assert.equal(oneOnOneToEquipment.offer?.id, "one-on-one-to-equipment");
});

test("selectBestOffer allows advocate users to match customer-segment funnel offers", () => {
  const now = at("2026-02-21T12:00:00.000Z");

  const result = selectBestOffer({
    customerId: "cust_advocate_customer_segment",
    channel: "email",
    now,
    events: [
      { event: "purchase", occurredAt: "2026-02-21T09:00:00.000Z" },
      { event: "referral_made", occurredAt: "2026-02-21T10:00:00.000Z" },
    ],
  });

  assert.equal(result.journeyStage, "advocate");
  assert.equal(result.offer?.id, "paid-course-to-group-coaching");
});

test("selectBestOffer triggers inactivity win-back sequence after 14 days", () => {
  const now = at("2026-02-21T12:00:00.000Z");

  const result = selectBestOffer({
    customerId: "cust_6",
    channel: "email",
    now,
    events: [{ event: "page_view", occurredAt: "2026-01-31T12:00:00.000Z" }],
  });

  assert.equal(result.activeTriggers.includes("inactivity_14_days"), true);
  assert.equal(result.offer?.id, "win-back-14-day-sequence");
});

test("journey and funnel stage detectors identify advocate + equipment levels", () => {
  const events = [
    { event: "purchase", occurredAt: "2026-02-01T00:00:00.000Z" },
    { event: "equipment_purchased", occurredAt: "2026-02-02T00:00:00.000Z" },
    { event: "referral_made", occurredAt: "2026-02-03T00:00:00.000Z" },
  ];

  assert.equal(getJourneyStageForEvents(events, { referralCount: 1 }), "advocate");
  assert.equal(getFunnelStageForEvents(events), "equipment");
});

test("simple A/B assignment is deterministic per customer and offer", () => {
  const now = at("2026-02-21T12:00:00.000Z");
  const events = [
    {
      event: "course_completed",
      occurredAt: "2026-02-21T03:00:00.000Z",
      properties: {
        course_title: "CTI Beginner Course",
      },
    },
  ];

  const first = selectBestOffer({ customerId: "cust_ab", channel: "email", now, events });
  const second = selectBestOffer({ customerId: "cust_ab", channel: "email", now, events });

  assert.equal(first.offer?.id, "cti-beginner-to-karen-advanced-coaching");
  assert.equal(first.offer?.variant.id, second.offer?.variant.id);
});

test("performance record tracks conversion revenue + affiliate attribution", () => {
  const record = buildOfferPerformanceRecord({
    customerId: "cust_7",
    offerId: "cti-beginner-to-karen-advanced-coaching",
    variantId: "karen-advanced-a",
    channel: "email",
    eventType: "conversion",
    revenueCents: 40000,
    affiliateRateBps: 2500,
    attributedInstructorId: "inst_12",
    attributionChannel: "karen-miles",
  });

  assert.equal(record.revenueAttributedCents, 40000);
  assert.equal(record.affiliateRevenueShareCents, 10000);
  assert.equal(calculateAffiliateRevenueShareCents(40000, 2500), 10000);
});
