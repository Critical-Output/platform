type ClickHouseConfig = {
  url: string;
  user?: string;
  password?: string;
  database: string;
};

const normalizeIdentifier = (value: string, label: string): string => {
  const v = value.trim();
  if (!/^[A-Za-z0-9_]+$/.test(v)) {
    throw new Error(`${label} must match [A-Za-z0-9_]+`);
  }
  return v;
};

export const getClickHouseConfigFromEnv = (): ClickHouseConfig | null => {
  const url = process.env.CLICKHOUSE_URL?.trim();
  if (!url) return null;

  const database = (process.env.CLICKHOUSE_DATABASE ?? "analytics").trim();
  return {
    url,
    user: process.env.CLICKHOUSE_USER?.trim() || undefined,
    password: process.env.CLICKHOUSE_PASSWORD?.trim() || undefined,
    database,
  };
};

const toBasicAuthHeader = (user: string, password?: string) => {
  const token = Buffer.from(`${user}:${password ?? ""}`).toString("base64");
  return `Basic ${token}`;
};

export const insertJsonEachRow = async (params: {
  config: ClickHouseConfig;
  table: string;
  rows: Record<string, unknown>[];
}) => {
  const { config, table, rows } = params;
  if (rows.length === 0) return;

  const db = normalizeIdentifier(config.database, "CLICKHOUSE_DATABASE");
  const tbl = normalizeIdentifier(table, "ClickHouse table");

  const endpoint = new URL(config.url);
  endpoint.searchParams.set("query", `INSERT INTO \`${db}\`.\`${tbl}\` FORMAT JSONEachRow`);

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (config.user) headers.authorization = toBasicAuthHeader(config.user, config.password);

  const body = `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
  const res = await fetch(endpoint.toString(), { method: "POST", headers, body });
  if (res.ok) return;

  const text = await res.text().catch(() => "");
  throw new Error(
    `ClickHouse insert failed (${res.status} ${res.statusText})${text ? `: ${text}` : ""}`,
  );
};

export const queryJson = async <T = Record<string, unknown>>(params: {
  config: ClickHouseConfig;
  query: string;
}): Promise<T[]> => {
  const { config, query } = params;

  const endpoint = new URL(config.url);
  endpoint.searchParams.set("database", normalizeIdentifier(config.database, "CLICKHOUSE_DATABASE"));

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (config.user) headers.authorization = toBasicAuthHeader(config.user, config.password);

  const body = `${query.trim()} FORMAT JSON`;
  const res = await fetch(endpoint.toString(), { method: "POST", headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `ClickHouse query failed (${res.status} ${res.statusText})${text ? `: ${text}` : ""}`,
    );
  }

  const json = (await res.json()) as { data: T[] };
  return json.data;
};
