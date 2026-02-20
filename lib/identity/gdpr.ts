import {
  escapeClickHouseStringLiteral,
  queryJson,
  type ClickHouseConfig,
} from "@/lib/clickhouse/http";
import {
  normalizeAnonymousId,
  normalizeEmail,
  normalizePhone,
  normalizeUserId,
} from "@/lib/identity/normalize";

type IdentityDeleteInput = {
  userId?: unknown;
  email?: unknown;
  phone?: unknown;
  anonymousId?: unknown;
};

type IdentityIdentifierSets = {
  userIds: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
  anonymousIds: Set<string>;
};

type IdentityGraphIdentifierRow = {
  user_id?: unknown;
  email?: unknown;
  phone?: unknown;
  anonymous_id?: unknown;
};

const DEFAULT_LINKED_IDENTIFIER_TIMEOUT_MS = 5000;

const createIdentifierSets = (): IdentityIdentifierSets => ({
  userIds: new Set<string>(),
  emails: new Set<string>(),
  phones: new Set<string>(),
  anonymousIds: new Set<string>(),
});

const addIdentifier = (set: Set<string>, value: string | null): boolean => {
  if (!value) return false;
  const sizeBefore = set.size;
  set.add(value);
  return set.size > sizeBefore;
};

const normalizeInputIdentifiers = (input: IdentityDeleteInput): IdentityIdentifierSets => {
  const identifiers = createIdentifierSets();
  addIdentifier(identifiers.userIds, normalizeUserId(input.userId));
  addIdentifier(identifiers.emails, normalizeEmail(input.email));
  addIdentifier(identifiers.phones, normalizePhone(input.phone));
  addIdentifier(identifiers.anonymousIds, normalizeAnonymousId(input.anonymousId));
  return identifiers;
};

const toSqlStringList = (values: Set<string>): string =>
  Array.from(values)
    .sort()
    .map((value) => `'${escapeClickHouseStringLiteral(value)}'`)
    .join(", ");

const buildWhereClauseFromIdentifiers = (identifiers: IdentityIdentifierSets): string | null => {
  const clauses: string[] = [];

  if (identifiers.userIds.size > 0) {
    clauses.push(`user_id IN (${toSqlStringList(identifiers.userIds)})`);
  }

  if (identifiers.emails.size > 0) {
    clauses.push(`lower(email) IN (${toSqlStringList(identifiers.emails)})`);
  }

  if (identifiers.phones.size > 0) {
    clauses.push(
      `replaceRegexpAll(ifNull(phone, ''), '[^0-9]', '') IN (${toSqlStringList(identifiers.phones)})`,
    );
  }

  if (identifiers.anonymousIds.size > 0) {
    clauses.push(`anonymous_id IN (${toSqlStringList(identifiers.anonymousIds)})`);
  }

  if (clauses.length === 0) return null;
  return clauses.map((clause) => `(${clause})`).join(" OR ");
};

export const resolveLinkedIdentityIdentifiers = async (params: {
  config: ClickHouseConfig;
  input: IdentityDeleteInput;
  maxIterations?: number;
  timeoutMs?: number;
}): Promise<IdentityIdentifierSets | null> => {
  const identifiers = normalizeInputIdentifiers(params.input);
  if (!buildWhereClauseFromIdentifiers(identifiers)) return null;

  if (params.maxIterations !== undefined && (!Number.isInteger(params.maxIterations) || params.maxIterations < 1)) {
    throw new Error("maxIterations must be an integer greater than 0 when provided");
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_LINKED_IDENTIFIER_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive finite number");
  }

  const startedAt = Date.now();
  let iteration = 0;

  while (true) {
    if (params.maxIterations !== undefined && iteration >= params.maxIterations) {
      throw new Error(
        `Linked identifier expansion reached maxIterations=${params.maxIterations} before convergence`,
      );
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Linked identifier expansion timed out after ${timeoutMs}ms`);
    }

    const whereClause = buildWhereClauseFromIdentifiers(identifiers);
    if (!whereClause) break;

    const rows = await queryJson<IdentityGraphIdentifierRow>({
      config: params.config,
      query: `
        SELECT
          user_id,
          email,
          phone,
          anonymous_id
        FROM identity_graph
        WHERE ${whereClause}
      `,
    });
    iteration += 1;

    let expanded = false;
    for (const row of rows) {
      expanded = addIdentifier(identifiers.userIds, normalizeUserId(row.user_id)) || expanded;
      expanded = addIdentifier(identifiers.emails, normalizeEmail(row.email)) || expanded;
      expanded = addIdentifier(identifiers.phones, normalizePhone(row.phone)) || expanded;
      expanded = addIdentifier(identifiers.anonymousIds, normalizeAnonymousId(row.anonymous_id)) || expanded;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Linked identifier expansion timed out after ${timeoutMs}ms`);
    }
    if (!expanded) break;
  }

  return identifiers;
};

export const buildIdentityDeleteWhereClause = (
  input: IdentityDeleteInput | IdentityIdentifierSets,
): string | null => {
  const isResolvedSet =
    typeof input === "object" &&
    input !== null &&
    "userIds" in input &&
    "emails" in input &&
    "phones" in input &&
    "anonymousIds" in input;

  const identifiers = isResolvedSet
    ? (input as IdentityIdentifierSets)
    : normalizeInputIdentifiers(input as IdentityDeleteInput);

  return buildWhereClauseFromIdentifiers(identifiers);
};
