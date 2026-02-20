import {
  escapeClickHouseStringLiteral,
  queryJson,
  type ClickHouseConfig,
} from "@/lib/clickhouse/http";
import { normalizeEmail, normalizeUserId } from "@/lib/identity/normalize";

export type IdentityProfile = {
  canonicalUserId: string;
  anonymousIds: string[];
  emails: string[];
  phones: string[];
  deviceFingerprints: string[];
  matchMethods: string[];
  edgeCount: number;
  lastSeen: string | null;
};

type IdentityProfileRow = {
  canonical_user_id?: unknown;
  anonymous_ids?: unknown;
  emails?: unknown;
  phones?: unknown;
  device_fingerprints?: unknown;
  match_methods?: unknown;
  edge_count?: unknown;
  last_seen?: unknown;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
};

export const getIdentityProfileForUser = async (params: {
  config: ClickHouseConfig;
  userId: string;
  email?: string | null;
}): Promise<IdentityProfile> => {
  const userId = normalizeUserId(params.userId);
  if (!userId) {
    throw new Error("userId is required");
  }

  const email = normalizeEmail(params.email);
  const clauses = [`canonical_user_id = '${escapeClickHouseStringLiteral(userId)}'`];

  if (email) {
    clauses.push(`has(emails, '${escapeClickHouseStringLiteral(email)}')`);
  }

  const rows = await queryJson<IdentityProfileRow>({
    config: params.config,
    query: `
      SELECT
        canonical_user_id,
        anonymous_ids,
        emails,
        phones,
        device_fingerprints,
        methods AS match_methods,
        edge_count,
        toString(last_seen) AS last_seen
      FROM identity_customer_profiles
      WHERE ${clauses.join(" OR ")}
      ORDER BY (canonical_user_id = '${escapeClickHouseStringLiteral(userId)}') DESC, edge_count DESC, last_seen DESC
      LIMIT 1
    `,
  });

  const row = rows[0] ?? {};
  const canonicalUserId =
    typeof row.canonical_user_id === "string" && row.canonical_user_id.trim()
      ? row.canonical_user_id
      : userId;

  return {
    canonicalUserId,
    anonymousIds: toStringArray(row.anonymous_ids),
    emails: toStringArray(row.emails),
    phones: toStringArray(row.phones),
    deviceFingerprints: toStringArray(row.device_fingerprints),
    matchMethods: toStringArray(row.match_methods),
    edgeCount: typeof row.edge_count === "number" ? row.edge_count : Number(row.edge_count ?? 0),
    lastSeen: typeof row.last_seen === "string" && row.last_seen.trim() ? row.last_seen : null,
  };
};
