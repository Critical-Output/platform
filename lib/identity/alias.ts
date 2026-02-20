import { randomUUID } from "node:crypto";

import {
  escapeClickHouseStringLiteral,
  insertJsonEachRow,
  queryJson,
  type ClickHouseConfig,
} from "@/lib/clickhouse/http";
import {
  formatClickHouseTimestamp,
  normalizeAnonymousId,
  normalizeEmail,
  normalizePhone,
  normalizeUserId,
} from "@/lib/identity/normalize";

type AliasLookupInput = {
  email?: string | null;
  phone?: string | null;
};

type AliasMergeInput = {
  config: ClickHouseConfig;
  userId: string;
  email?: string | null;
  phone?: string | null;
  anonymousId?: string | null;
  source: string;
};

type AnonymousIdRow = {
  anonymous_id?: string;
};

type IdentityGraphInsertRow = {
  anonymous_id: string;
  user_id: string;
  email: string | null;
  phone: string | null;
  device_fingerprint: string | null;
  confidence: number;
  method: string;
  first_seen: string;
  last_seen: string;
  last_event_id: string;
  metadata: string;
};

const buildIdentifierFilterClauses = (input: AliasLookupInput): string[] => {
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);

  const clauses: string[] = [];
  if (email) {
    clauses.push(`lower(email) = '${escapeClickHouseStringLiteral(email)}'`);
  }

  if (phone) {
    clauses.push(
      `replaceRegexpAll(ifNull(phone, ''), '[^0-9]', '') = '${escapeClickHouseStringLiteral(phone)}'`,
    );
  }

  return clauses;
};

const getDeterministicMethod = (email: string | null, phone: string | null) => {
  if (email && phone) return "deterministic_email_phone";
  if (email) return "deterministic_email";
  if (phone) return "deterministic_phone";
  return "deterministic_login";
};

export const listAnonymousIdsForIdentifiers = async (params: {
  config: ClickHouseConfig;
  email?: string | null;
  phone?: string | null;
}): Promise<string[]> => {
  const clauses = buildIdentifierFilterClauses({ email: params.email, phone: params.phone });
  if (clauses.length === 0) return [];

  const rows = await queryJson<AnonymousIdRow>({
    config: params.config,
    query: `
      SELECT DISTINCT anonymous_id
      FROM identity_graph
      WHERE anonymous_id != ''
        AND (${clauses.join(" OR ")})
    `,
  });

  const anonymousIds = new Set<string>();
  for (const row of rows) {
    const anonymousId = normalizeAnonymousId(row.anonymous_id);
    if (anonymousId) anonymousIds.add(anonymousId);
  }

  return Array.from(anonymousIds);
};

export const mergeAnonymousSessionsForUser = async (params: AliasMergeInput) => {
  const userId = normalizeUserId(params.userId);
  if (!userId) {
    throw new Error("userId is required");
  }

  const email = normalizeEmail(params.email);
  const phone = normalizePhone(params.phone);
  const requestAnonymousId = normalizeAnonymousId(params.anonymousId);

  const matchedAnonymousIds = await listAnonymousIdsForIdentifiers({
    config: params.config,
    email,
    phone,
  });

  const anonymousIdSet = new Set(matchedAnonymousIds);
  if (requestAnonymousId) anonymousIdSet.add(requestAnonymousId);

  const anonymousIds = Array.from(anonymousIdSet);
  if (anonymousIds.length === 0) {
    return {
      mergedAnonymousIds: [] as string[],
      insertedRows: 0,
    };
  }

  const timestamp = formatClickHouseTimestamp();
  const method = getDeterministicMethod(email, phone);

  const rows: IdentityGraphInsertRow[] = anonymousIds.map((anonymousId) => ({
    anonymous_id: anonymousId,
    user_id: userId,
    email,
    phone,
    device_fingerprint: null,
    confidence: 1.0,
    method,
    first_seen: timestamp,
    last_seen: timestamp,
    last_event_id: randomUUID(),
    metadata: JSON.stringify({
      source: params.source,
      alias_merge: true,
      merged_identifiers: {
        email,
        phone,
      },
    }),
  }));

  await insertJsonEachRow({
    config: params.config,
    table: "identity_graph",
    rows,
  });

  return {
    mergedAnonymousIds: anonymousIds,
    insertedRows: rows.length,
  };
};
