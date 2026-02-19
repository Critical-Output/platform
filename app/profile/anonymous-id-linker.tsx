"use client";

import { useEffect, useRef } from "react";

import { getOrCreateAnonymousId } from "@/lib/rudderstack/ids";

export default function AnonymousIdLinker() {
  const hasSentRef = useRef(false);

  useEffect(() => {
    if (hasSentRef.current) return;
    hasSentRef.current = true;

    const anonymousId = getOrCreateAnonymousId();

    void fetch("/api/auth/link-anonymous", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ anonymousId }),
    });
  }, []);

  return null;
}
