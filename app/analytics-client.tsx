"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { analytics } from "@/lib/rudderstack/client";
import {
  consumeAnonymousIdFromUrl,
  decorateDocumentOutboundLinks,
  getOrCreateAnonymousId,
  getOrCreateSessionId,
} from "@/lib/rudderstack/ids";

export default function AnalyticsClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const lastTrackedHrefRef = useRef<string | null>(null);

  useEffect(() => {
    // Accept cross-domain anonymous IDs before emitting page_view.
    consumeAnonymousIdFromUrl();

    // Ensure IDs exist even if tracking is disabled.
    getOrCreateAnonymousId();
    getOrCreateSessionId();

    // Decorate outbound links to other brand domains with anonymous_id.
    decorateDocumentOutboundLinks();

    // Dedupe page_view for cross-domain landings where replaceState updates search params.
    const href = window.location.href;
    if (lastTrackedHrefRef.current === href) return;
    lastTrackedHrefRef.current = href;

    analytics.pageView({
      url: href,
      path: window.location.pathname,
      search: window.location.search,
      title: document.title,
      referrer: document.referrer || null,
    });
  }, [pathname, search]);

  return null;
}
