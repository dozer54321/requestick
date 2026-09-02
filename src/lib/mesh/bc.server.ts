import type { BcCompany, BcPartOrder } from "./types";

export type BcSecrets = {
  tenantId: string;
  environment: string;
  companyId: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  basicUser: string;
  basicPassword: string;
};

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function odataQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function apiRoot(secrets: BcSecrets): string {
  const custom = secrets.baseUrl.trim().replace(/\/+$/, "");
  if (custom) return custom;
  const tenant = secrets.tenantId.trim();
  const env = (secrets.environment.trim() || "Production").replace(/\s+/g, "");
  if (!tenant) throw new Error("Tenant ID is required for Business Central (SaaS).");
  return `https://api.businesscentral.dynamics.com/v2.0/${encodeURIComponent(tenant)}/${encodeURIComponent(env)}/api/v2.0`;
}

async function token(secrets: BcSecrets): Promise<string | null> {
  if (secrets.basicUser && secrets.basicPassword) return null;
  if (!secrets.clientId || !secrets.clientSecret || !secrets.tenantId) {
    throw new Error("Client ID, secret, and tenant ID are required.");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: secrets.clientId,
    client_secret: secrets.clientSecret,
    scope: "https://api.businesscentral.dynamics.com/.default",
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(secrets.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20000),
    },
  );
  const json = (await res.json().catch(() => ({}))) as JsonRecord;
  if (!res.ok) {
    throw new Error(
      asString(json.error_description || json.error) ||
        `Azure AD token failed (${res.status}).`,
    );
  }
  const access = asString(json.access_token);
  if (!access) throw new Error("Azure AD did not return an access token.");
  return access;
}

function authHeaders(accessToken: string | null, secrets: BcSecrets): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (secrets.basicUser) {
    const raw = `${secrets.basicUser}:${secrets.basicPassword}`;
    headers.Authorization = `Basic ${Buffer.from(raw).toString("base64")}`;
  }
  return headers;
}

async function bcGetUrl<T>(
  secrets: BcSecrets,
  accessToken: string | null,
  url: string,
  timeoutMs = 25000,
): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders(accessToken, secrets),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as JsonRecord;
  if (!res.ok) {
    const err = json.error as JsonRecord | undefined;
    const msg =
      asString(err?.message) ||
      asString(json.message) ||
      `Business Central ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

async function bcGet<T>(
  secrets: BcSecrets,
  accessToken: string | null,
  path: string,
  timeoutMs = 25000,
): Promise<T> {
  const url = `${apiRoot(secrets)}${path.startsWith("/") ? path : `/${path}`}`;
  return bcGetUrl<T>(secrets, accessToken, url, timeoutMs);
}

type ODataList<T> = { value?: T[]; "@odata.nextLink"?: string };

async function bcListAll(
  secrets: BcSecrets,
  accessToken: string | null,
  path: string,
  max = 800,
): Promise<JsonRecord[]> {
  const out: JsonRecord[] = [];
  let next: string | null = path.startsWith("http")
    ? path
    : `${apiRoot(secrets)}${path.startsWith("/") ? path : `/${path}`}`;
  while (next && out.length < max) {
    const data: ODataList<JsonRecord> = await bcGetUrl<ODataList<JsonRecord>>(
      secrets,
      accessToken,
      next,
    );
    out.push(...(data.value ?? []));
    next = data["@odata.nextLink"] || null;
  }
  return out;
}

export async function listBcCompanies(secrets: BcSecrets): Promise<BcCompany[]> {
  const access = await token(secrets);
  const data = await bcGet<ODataList<JsonRecord>>(secrets, access, "/companies");
  return (data.value ?? []).map((row) => ({
    id: asString(row.id),
    name: asString(row.displayName || row.name),
  }));
}

function companyPath(secrets: BcSecrets): string {
  if (!secrets.companyId) throw new Error("Pick a Business Central company.");
  return `/companies(${secrets.companyId})`;
}

function linePart(row: JsonRecord): string {
  return asString(row.lineObjectNumber || row.number).trim();
}

function lineOutstanding(row: JsonRecord): number {
  const outstanding = asNumber(row.outstandingQuantity ?? row.quantityToShip);
  if (outstanding > 0) return outstanding;
  return asNumber(row.quantity);
}

const LINE_SELECT =
  "$select=id,documentId,lineObjectNumber,number,description,quantity,outstandingQuantity,quantityToShip";

async function fetchLinesForPart(
  secrets: BcSecrets,
  access: string | null,
  root: string,
  partNumber: string,
): Promise<JsonRecord[]> {
  const quoted = odataQuote(partNumber);
  const attempts = [
    `${root}/salesOrderLines?${LINE_SELECT}&$top=200&$filter=lineObjectNumber eq ${quoted} and outstandingQuantity gt 0`,
    `${root}/salesOrderLines?${LINE_SELECT}&$top=200&$filter=number eq ${quoted} and outstandingQuantity gt 0`,
    `${root}/salesOrderLines?${LINE_SELECT}&$top=200&$filter=lineObjectNumber eq ${quoted}`,
    `${root}/salesOrderLines?${LINE_SELECT}&$top=200&$filter=number eq ${quoted}`,
  ];
  const wanted = partNumber.toUpperCase();
  for (const path of attempts) {
    try {
      const rows = await bcListAll(secrets, access, path, 2000);
      const matched = rows.filter((row) => linePart(row).toUpperCase() === wanted);
      const open = matched.filter((row) => lineOutstanding(row) > 0);
      if (open.length > 0) return open;
      if (matched.length > 0) return matched;
    } catch {
      /* try the next field / filter */
    }
  }
  return [];
}

function salespersonFromHeader(row: JsonRecord): string {
  const nested = (row.salespersonPurchaser || row.salesperson || {}) as JsonRecord;
  return (
    asString(row.salespersonCode) ||
    asString(nested.code) ||
    asString(nested.number) ||
    ""
  );
}

async function fetchSalespersonCodes(
  secrets: BcSecrets,
  access: string | null,
  root: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const paths = [
    `${root}/salespersonPurchasers?$select=id,code`,
    `${root}/salespeople?$select=id,code`,
  ];
  for (const path of paths) {
    try {
      const rows = await bcListAll(secrets, access, path, 400);
      for (const row of rows) {
        const id = asString(row.id);
        const code = asString(row.code);
        if (id && code) map.set(id.toLowerCase(), code);
      }
      if (map.size > 0) return map;
    } catch {
      /* try the next entity set */
    }
  }
  return map;
}

async function fetchOrderHeaders(
  secrets: BcSecrets,
  access: string | null,
  root: string,
  ids: string[],
): Promise<Map<string, JsonRecord>> {
  const map = new Map<string, JsonRecord>();
  const selects = [
    "$select=id,number,status,salespersonCode,salesperson,fullyShipped",
    "$select=id,number,status,salesperson,fullyShipped",
    "$select=id,number,status,fullyShipped",
  ];
  const size = 40;
  let select = selects[0];
  for (let i = 0; i < ids.length; i += size) {
    const chunk = ids.slice(i, i + size);
    const filter = chunk.map((id) => `id eq ${id}`).join(" or ");
    let loaded = false;
    for (const trySelect of selects) {
      try {
        const data = await bcGet<ODataList<JsonRecord>>(
          secrets,
          access,
          `${root}/salesOrders?${trySelect}&$filter=${encodeURIComponent(filter)}`,
        );
        select = trySelect;
        for (const row of data.value ?? []) {
          const id = asString(row.id);
          if (id) map.set(id, row);
        }
        loaded = true;
        break;
      } catch {
        /* try a smaller $select */
      }
    }
    if (loaded) continue;
    for (const id of chunk) {
      try {
        const row = await bcGet<JsonRecord>(
          secrets,
          access,
          `${root}/salesOrders(${id})?${select}`,
        );
        map.set(id, row);
      } catch {
        /* skip one missing header */
      }
    }
  }
  return map;
}

const CLOSED = new Set(["canceled", "cancelled", "invoiced", "closed"]);

export async function searchOpenOrdersByPart(
  secrets: BcSecrets,
  partNumber: string,
): Promise<BcPartOrder[]> {
  const pn = partNumber.replace(/^\s+|\s+$/g, "");
  if (!pn) throw new Error("Part number is required.");
  const access = await token(secrets);
  const root = companyPath(secrets);
  const lines = await fetchLinesForPart(secrets, access, root, pn);
  const ids = [...new Set(lines.map((row) => asString(row.documentId)).filter(Boolean))];
  const [headers, codes] = await Promise.all([
    ids.length > 0 ? fetchOrderHeaders(secrets, access, root, ids) : Promise.resolve(new Map<string, JsonRecord>()),
    fetchSalespersonCodes(secrets, access, root),
  ]);

  const qtyByOrder = new Map<string, { outstanding: number; description: string }>();
  for (const row of lines) {
    const id = asString(row.documentId);
    if (!id) continue;
    const prev = qtyByOrder.get(id);
    const outstanding = lineOutstanding(row);
    const description = asString(row.description);
    if (!prev) qtyByOrder.set(id, { outstanding, description });
    else {
      prev.outstanding += outstanding;
      if (!prev.description) prev.description = description;
    }
  }

  const out: BcPartOrder[] = [];
  for (const id of ids) {
    const header = headers.get(id);
    if (!header) continue;
    if (header.fullyShipped === true) continue;
    const status = asString(header.status) || "Open";
    if (CLOSED.has(status.toLowerCase())) continue;
    const qty = qtyByOrder.get(id);
    const spId = asString(header.salesperson);
    out.push({
      orderId: id,
      orderNumber: asString(header.number),
      status,
      salespersonCode:
        salespersonFromHeader(header) || (spId ? codes.get(spId.toLowerCase()) ?? "" : ""),
      outstanding: qty?.outstanding ?? 0,
      description: qty?.description ?? "",
    });
  }

  return out
    .filter((row) => row.orderNumber)
    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true }));
}

export function secretsReady(secrets: BcSecrets): boolean {
  if (secrets.basicUser && secrets.basicPassword && secrets.baseUrl) return true;
  return Boolean(secrets.tenantId && secrets.clientId && secrets.clientSecret);
}
