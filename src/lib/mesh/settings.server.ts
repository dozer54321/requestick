import type { Sql } from "@/lib/db";
import { secretsReady, type BcSecrets } from "./bc.server";
import { DEFAULT_BRANDING, isHexColor } from "./brand";
import type { BcConnectionPublic, Branding, PublicBrand } from "./types";

export type SettingsRow = {
  company_name: string;
  tagline: string;
  logo_data: string;
  paper: string;
  ink: string;
  accent: string;
  signup_open: boolean | string | number;
  bc_tenant_id: string;
  bc_environment: string;
  bc_company_id: string;
  bc_company_name: string;
  bc_client_id: string;
  bc_client_secret: string;
  bc_base_url: string;
  bc_basic_user: string;
  bc_basic_password: string;
};

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function colorOr(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  return isHexColor(v) ? v : fallback;
}

export function mapBranding(row: SettingsRow): Branding {
  return {
    companyName: row.company_name?.trim() || DEFAULT_BRANDING.companyName,
    tagline: row.tagline?.trim() || DEFAULT_BRANDING.tagline,
    logoData: row.logo_data ?? "",
    paper: colorOr(row.paper, DEFAULT_BRANDING.paper),
    ink: colorOr(row.ink, DEFAULT_BRANDING.ink),
    accent: colorOr(row.accent, DEFAULT_BRANDING.accent),
  };
}

export function mapPublic(row: SettingsRow): PublicBrand {
  return {
    ...mapBranding(row),
    signupOpen: asBool(row.signup_open),
  };
}

export function mapSecrets(row: SettingsRow): BcSecrets {
  return {
    tenantId: row.bc_tenant_id ?? "",
    environment: row.bc_environment || "Production",
    companyId: row.bc_company_id ?? "",
    clientId: row.bc_client_id ?? "",
    clientSecret: row.bc_client_secret ?? "",
    baseUrl: row.bc_base_url ?? "",
    basicUser: row.bc_basic_user ?? "",
    basicPassword: row.bc_basic_password ?? "",
  };
}

export function mapBcPublic(row: SettingsRow): BcConnectionPublic {
  const secrets = mapSecrets(row);
  return {
    tenantId: secrets.tenantId,
    environment: secrets.environment,
    companyId: secrets.companyId,
    companyName: row.bc_company_name ?? "",
    clientId: secrets.clientId,
    hasSecret: Boolean(secrets.clientSecret),
    baseUrl: secrets.baseUrl,
    basicUser: secrets.basicUser,
    hasBasicPassword: Boolean(secrets.basicPassword),
    connected: secretsReady(secrets) && Boolean(secrets.companyId),
  };
}

let settingsReady = false;

export async function ensureSettings(sql: Sql): Promise<void> {
  if (settingsReady) return;
  await sql.query(`
    create table if not exists mesh_settings (
      id integer primary key check (id = 1),
      company_name text not null default 'Requestick',
      tagline text not null default 'Request Ticket Tracker',
      logo_data text not null default '',
      paper text not null default '#efe8dc',
      ink text not null default '#1c1917',
      accent text not null default '#1c1917',
      bc_tenant_id text not null default '',
      bc_environment text not null default 'Production',
      bc_company_id text not null default '',
      bc_company_name text not null default '',
      bc_client_id text not null default '',
      bc_client_secret text not null default '',
      bc_base_url text not null default '',
      bc_basic_user text not null default '',
      bc_basic_password text not null default '',
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(
    `insert into mesh_settings (id) values (1) on conflict (id) do nothing`,
  );
  await sql.query(
    `alter table mesh_settings add column if not exists signup_open boolean not null default true`,
  );
  await sql.query(
    `update mesh_settings set company_name = 'Requestick', updated_at = now()
     where id = 1 and company_name in ('Mesh', '')`,
  );
  await sql.query(
    `update mesh_settings set tagline = 'Request Ticket Tracker', updated_at = now()
     where id = 1 and tagline in ('Sales board', 'Sales Board', '')`,
  );
  settingsReady = true;
}

const SETTINGS_SELECT = `
  company_name, tagline, logo_data, paper, ink, accent, signup_open,
  bc_tenant_id, bc_environment, bc_company_id, bc_company_name,
  bc_client_id, bc_client_secret, bc_base_url, bc_basic_user, bc_basic_password
`;

export async function loadSettings(sql: Sql): Promise<SettingsRow> {
  await ensureSettings(sql);
  const rows = await sql.query<SettingsRow>(
    `select ${SETTINGS_SELECT} from mesh_settings where id = 1`,
  );
  if (!rows[0]) throw new Error("Settings missing.");
  return rows[0];
}
