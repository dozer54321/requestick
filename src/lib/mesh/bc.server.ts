import type { BcCompany, BcLine, BcTicket } from "./types";

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

async function bcGet<T>(
  secrets: BcSecrets,
  accessToken: string | null,
  path: string,
): Promise<T> {
  const url = `${apiRoot(secrets)}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: authHeaders(accessToken, secrets),
    signal: AbortSignal.timeout(20000),
  });
  const json = (await res.json().catch(() => ({}))) as JsonRecord;
  if (!res.ok) {
    const err = json.error as JsonRecord | undefined;
    const msg =
      asString(err?.message) ||
      asString(json.message) ||
      `Business Central ${res.status} on ${path}`;
    throw new Error(msg);
  }
  return json as T;
}

type ODataList<T> = { value?: T[] };

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

function mapLine(row: JsonRecord): BcLine {
  const qty = asNumber(row.quantity);
  const outstanding = asNumber(
    row.outstandingQuantity ?? row.quantityToShip ?? row.quantity,
  );
  return {
    id: asString(row.id),
    documentId: asString(row.documentId),
    partNumber: asString(row.lineObjectNumber || row.number || row.description),
    description: asString(row.description),
    qty: qty || 1,
    outstanding: outstanding || qty || 1,
  };
}

function mapTicket(
  row: JsonRecord,
  kind: "order" | "quote",
  lines: BcLine[],
  meshTickets: Set<string>,
): BcTicket {
  const number = asString(row.number);
  return {
    id: asString(row.id),
    kind,
    number,
    customer: asString(row.customerName || row.sellToCustomerName),
    salesperson: asString(row.salesperson || row.salespersonCode),
    status: asString(row.status),
    date: asString(row.orderDate || row.documentDate || row.postingDate),
    lines: lines.filter((l) => l.documentId === asString(row.id) && l.partNumber),
    onMesh: meshTickets.has(number.toLowerCase()),
  };
}

export async function listOpenBcTickets(
  secrets: BcSecrets,
  meshTicketNumbers: string[],
): Promise<BcTicket[]> {
  const access = await token(secrets);
  const root = companyPath(secrets);
  const meshTickets = new Set(
    meshTicketNumbers.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );

  const [orders, quotes, orderLines, quoteLines] = await Promise.all([
    bcGet<ODataList<JsonRecord>>(
      secrets,
      access,
      `${root}/salesOrders?$top=80&$filter=fullyShipped eq false`,
    ).catch(() => ({ value: [] as JsonRecord[] })),
    bcGet<ODataList<JsonRecord>>(
      secrets,
      access,
      `${root}/salesQuotes?$top=40`,
    ).catch(() => ({ value: [] as JsonRecord[] })),
    bcGet<ODataList<JsonRecord>>(
      secrets,
      access,
      `${root}/salesOrderLines?$top=400`,
    ).catch(() => ({ value: [] as JsonRecord[] })),
    bcGet<ODataList<JsonRecord>>(
      secrets,
      access,
      `${root}/salesQuoteLines?$top=200`,
    ).catch(() => ({ value: [] as JsonRecord[] })),
  ]);

  const oLines = (orderLines.value ?? []).map(mapLine);
  const qLines = (quoteLines.value ?? []).map(mapLine);

  const tickets: BcTicket[] = [
    ...(orders.value ?? []).map((row) => mapTicket(row, "order", oLines, meshTickets)),
    ...(quotes.value ?? [])
      .filter((row) => {
        const status = asString(row.status).toLowerCase();
        return status !== "accepted" && status !== "expired" && status !== "converted";
      })
      .map((row) => mapTicket(row, "quote", qLines, meshTickets)),
  ];

  return tickets.filter((t) => t.number);
}

export function secretsReady(secrets: BcSecrets): boolean {
  if (secrets.basicUser && secrets.basicPassword && secrets.baseUrl) return true;
  return Boolean(secrets.tenantId && secrets.clientId && secrets.clientSecret);
}
