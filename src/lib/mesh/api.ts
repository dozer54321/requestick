import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  createCredentialUser,
  renameAuthUser,
  setCredentialPassword,
} from "./accounts.server";
import { listBcCompanies, listOpenBcTickets, secretsReady, type BcSecrets } from "./bc.server";
import { DEFAULT_PUBLIC_BRAND, isHexColor } from "./brand";
import {
  loadSettings,
  mapBcPublic,
  mapBranding,
  mapPublic,
  mapSecrets,
  type SettingsRow,
} from "./settings.server";
import { applyVersion, loadUpdateStatus } from "./update.server";
import type {
  AccessStatus,
  AdminSettings,
  BcCompany,
  BcConnectionInput,
  BcTicket,
  Branding,
  MemberPatch,
  MemberRole,
  MeshNeed,
  MeshProfile,
  MeshSnapshot,
  NeedAction,
  NeedDraft,
  NeedPatch,
  NeedPriority,
  NeedStatus,
  NewAccountDraft,
  PublicBrand,
  TeamAction,
  UpdateStatus,
} from "./types";
import { ACCESS_STATUSES, NEED_PRIORITIES, NEED_STATUSES } from "./types";

type ProfileRow = {
  user_id: string;
  display_name: string;
  extension: string;
  cell: string;
  email: string;
  alerts_on: boolean;
  role: string;
  access_status: string;
};

type NeedRow = {
  id: number;
  created_by: string;
  part_number: string;
  description: string;
  ticket_number: string;
  qty: number;
  priority: string;
  notes: string;
  status: string;
  claimed_by: string | null;
  claimed_at: Date | string | null;
  filled_by: string | null;
  filled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function iso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function mapRole(value: string): MemberRole {
  return value === "admin" ? "admin" : "member";
}

function mapAccess(value: string): AccessStatus {
  return ACCESS_STATUSES.includes(value as AccessStatus)
    ? (value as AccessStatus)
    : "pending";
}

function mapProfile(row: ProfileRow): MeshProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    extension: row.extension ?? "",
    cell: row.cell ?? "",
    email: row.email ?? "",
    alertsOn: asBool(row.alerts_on),
    role: mapRole(row.role),
    accessStatus: mapAccess(row.access_status),
  };
}

function mapNeed(row: NeedRow): MeshNeed {
  const priority = NEED_PRIORITIES.includes(row.priority as NeedPriority)
    ? (row.priority as NeedPriority)
    : "today";
  const status = NEED_STATUSES.includes(row.status as NeedStatus)
    ? (row.status as NeedStatus)
    : "open";
  return {
    id: Number(row.id),
    createdBy: row.created_by,
    partNumber: row.part_number,
    description: row.description,
    ticketNumber: row.ticket_number ?? "",
    qty: Number(row.qty) || 1,
    priority,
    notes: row.notes ?? "",
    status,
    claimedBy: row.claimed_by,
    claimedAt: iso(row.claimed_at),
    filledBy: row.filled_by,
    filledAt: iso(row.filled_at),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
  };
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function cleanEmail(value: unknown): string {
  return cleanText(value, 120).toLowerCase();
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseNeedDraft(input: Record<string, unknown>): NeedDraft {
  const partNumber = cleanPart(input.partNumber);
  const description = cleanText(input.description, 240);
  if (!partNumber) throw new Error("Part number is required.");
  if (!description) throw new Error("Description is required.");
  const ticketNumber = cleanText(input.ticketNumber, 40);
  const qty = Math.max(1, Math.min(9999, Number(input.qty) || 1));
  const priority = NEED_PRIORITIES.includes(input.priority as NeedPriority)
    ? (input.priority as NeedPriority)
    : "today";
  const notes = cleanText(input.notes, 400);
  return { partNumber, description, ticketNumber, qty, priority, notes };
}

const NEED_RETURNING = `id, created_by, part_number, description, ticket_number, qty,
                priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                created_at, updated_at`;

let accessColumnsReady = false;

async function ensureAccessColumns(sql: Awaited<ReturnType<typeof getSql>>) {
  if (accessColumnsReady) return;
  await sql.query(
    "alter table mesh_profiles add column if not exists role text not null default 'member'",
  );
  await sql.query(
    "alter table mesh_profiles add column if not exists access_status text not null default 'pending'",
  );
  await sql.query(
    "alter table mesh_profiles add column if not exists email text not null default ''",
  );
  accessColumnsReady = true;
}

async function loadProfile(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
): Promise<MeshProfile | null> {
  await ensureAccessColumns(sql);
  const rows = await sql<ProfileRow>`
    select user_id, display_name, extension, cell, email, alerts_on, role, access_status
    from mesh_profiles
    where user_id = ${userId}
  `;
  return rows[0] ? mapProfile(rows[0]) : null;
}

async function ensureBootstrapAdmin(sql: Awaited<ReturnType<typeof getSql>>): Promise<void> {
  await ensureAccessColumns(sql);
  const admins = await sql<{ n: number }>`
    select count(*)::int as n from mesh_profiles
    where role = 'admin' and access_status = 'approved'
  `;
  if (Number(admins[0]?.n) > 0) return;
  await sql`
    update mesh_profiles
    set role = 'admin', access_status = 'approved', updated_at = now()
    where user_id = (
      select user_id from mesh_profiles order by created_at asc limit 1
    )
  `;
}

async function requireApproved(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
): Promise<MeshProfile> {
  const profile = await loadProfile(sql, userId);
  if (!profile) throw new Error("Set up your station first.");
  if (profile.accessStatus === "denied") {
    throw new Error("Access denied. Talk to an admin.");
  }
  if (profile.accessStatus !== "approved") {
    throw new Error("Waiting on admin approval.");
  }
  return profile;
}

async function requireAdmin(
  sql: Awaited<ReturnType<typeof getSql>>,
  userId: string,
): Promise<MeshProfile> {
  const profile = await requireApproved(sql, userId);
  if (profile.role !== "admin") throw new Error("Admins only.");
  return profile;
}

async function listProfiles(
  sql: Awaited<ReturnType<typeof getSql>>,
): Promise<MeshProfile[]> {
  const rows = await sql<ProfileRow>`
    select user_id, display_name, extension, cell, email, alerts_on, role, access_status
    from mesh_profiles
    order by
      case access_status when 'pending' then 0 when 'approved' then 1 else 2 end,
      display_name asc
  `;
  return rows.map(mapProfile);
}

function parseBranding(input: Record<string, unknown>): Branding {
  const companyName = cleanText(input.companyName, 60);
  if (companyName.length < 2) throw new Error("Company name is required.");
  const paper = cleanText(input.paper, 7);
  const ink = cleanText(input.ink, 7);
  const accent = cleanText(input.accent, 7);
  if (!isHexColor(paper) || !isHexColor(ink) || !isHexColor(accent)) {
    throw new Error("Colors must be 6-digit hex, like #1c1917.");
  }
  const logoData = String(input.logoData ?? "");
  if (logoData && !logoData.startsWith("data:image/")) {
    throw new Error("Logo must be an image file.");
  }
  if (logoData.length > 400_000) {
    throw new Error("Logo is too large. Keep it under ~250 KB.");
  }
  return {
    companyName,
    tagline: cleanText(input.tagline, 80) || "Sales board",
    logoData,
    paper,
    ink,
    accent,
  };
}

function parseBcInput(raw: unknown): BcConnectionInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  return {
    tenantId: cleanText(input.tenantId, 80),
    environment: cleanText(input.environment, 40) || "Production",
    companyId: cleanText(input.companyId, 80),
    companyName: cleanText(input.companyName, 120),
    clientId: cleanText(input.clientId, 120),
    clientSecret: String(input.clientSecret ?? "").trim(),
    baseUrl: cleanText(input.baseUrl, 240),
    basicUser: cleanText(input.basicUser, 120),
    basicPassword: String(input.basicPassword ?? "").trim(),
    clear: input.clear === true,
  };
}

function mergeSecrets(stored: SettingsRow, input: BcConnectionInput): BcSecrets {
  if (input.clear) {
    return {
      tenantId: "",
      environment: "Production",
      companyId: "",
      clientId: "",
      clientSecret: "",
      baseUrl: "",
      basicUser: "",
      basicPassword: "",
    };
  }
  return {
    tenantId: input.tenantId,
    environment: input.environment || "Production",
    companyId: input.companyId,
    clientId: input.clientId,
    clientSecret: input.clientSecret || stored.bc_client_secret,
    baseUrl: input.baseUrl,
    basicUser: input.basicUser,
    basicPassword: input.basicPassword || stored.bc_basic_password,
  };
}

export const getPublicBrand = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicBrand> => {
    try {
      const sql = await getSql();
      const row = await loadSettings(sql);
      return mapPublic(row);
    } catch {
      return DEFAULT_PUBLIC_BRAND;
    }
  },
);

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MeshProfile | null> => {
    const sql = await getSql();
    await ensureBootstrapAdmin(sql);
    return loadProfile(sql, context.userId);
  });

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const input = (raw ?? {}) as Record<string, unknown>;
    const displayName = cleanText(input.displayName, 80);
    if (displayName.length < 2) throw new Error("Name is required.");
    return {
      displayName,
      extension: cleanText(input.extension, 16),
      cell: cleanText(input.cell, 24),
      email: cleanEmail(input.email),
      alertsOn: input.alertsOn !== false,
    };
  })
  .handler(async ({ context, data }): Promise<MeshProfile> => {
    const sql = await getSql();
    await ensureAccessColumns(sql);
    const rows = await sql<ProfileRow>`
      insert into mesh_profiles (
        user_id, display_name, extension, cell, email, alerts_on,
        role, access_status, updated_at
      )
      values (
        ${context.userId}, ${data.displayName}, ${data.extension}, ${data.cell},
        ${data.email}, ${data.alertsOn},
        case when (select count(*) from mesh_profiles) = 0 then 'admin' else 'member' end,
        case when (select count(*) from mesh_profiles) = 0 then 'approved' else 'pending' end,
        now()
      )
      on conflict (user_id) do update set
        display_name = excluded.display_name,
        extension = excluded.extension,
        cell = excluded.cell,
        email = excluded.email,
        alerts_on = excluded.alerts_on,
        updated_at = now()
      returning user_id, display_name, extension, cell, email, alerts_on, role, access_status
    `;
    const created = mapProfile(rows[0]);
    await ensureBootstrapAdmin(sql);
    return (await loadProfile(sql, context.userId)) ?? created;
  });

export const getMesh = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MeshSnapshot> => {
    const sql = await getSql();
    await requireApproved(sql, context.userId);
    const needs = await sql<NeedRow>`
      select id, created_by, part_number, description, ticket_number, qty,
             priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
             created_at, updated_at
      from mesh_needs
      order by created_at desc, part_number asc
      limit 500
    `;
    const profiles = await sql<ProfileRow>`
      select user_id, display_name, extension, cell, email, alerts_on, role, access_status
      from mesh_profiles
      where access_status = 'approved'
    `;
    const mapped = needs.map(mapNeed);
    let revision = "0";
    for (const n of mapped) {
      if (n.updatedAt > revision) revision = n.updatedAt;
    }
    let bcConnected = false;
    try {
      const settings = await loadSettings(sql);
      const secrets = mapSecrets(settings);
      bcConnected = secretsReady(secrets) && Boolean(secrets.companyId);
    } catch {
      bcConnected = false;
    }
    return {
      me: context.userId,
      needs: mapped,
      profiles: profiles.map(mapProfile),
      revision,
      openCount: mapped.filter((n) => n.status === "open").length,
      hotCount: mapped.filter((n) => n.status === "open" && n.priority === "hot").length,
      claimedCount: mapped.filter((n) => n.status === "claimed").length,
      bcConnected,
    };
  });

export const postNeed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown): NeedDraft => {
    const input = (raw ?? {}) as Record<string, unknown>;
    return parseNeedDraft(input);
  })
  .handler(async ({ context, data }): Promise<MeshNeed> => {
    const sql = await getSql();
    await requireApproved(sql, context.userId);
    const rows = await sql<NeedRow>`
      insert into mesh_needs (
        created_by, part_number, description, ticket_number, qty, priority, notes
      ) values (
        ${context.userId}, ${data.partNumber}, ${data.description},
        ${data.ticketNumber}, ${data.qty}, ${data.priority}, ${data.notes}
      )
      returning id, created_by, part_number, description, ticket_number, qty,
                priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                created_at, updated_at
    `;
    return mapNeed(rows[0]);
  });

export const updateNeed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown): NeedPatch => {
    const input = (raw ?? {}) as Record<string, unknown>;
    const id = Number(input.id);
    if (!Number.isFinite(id) || id < 1) throw new Error("Invalid need.");
    return { id, ...parseNeedDraft(input) };
  })
  .handler(async ({ context, data }): Promise<MeshNeed> => {
    const sql = await getSql();
    const profile = await requireApproved(sql, context.userId);
    const rows = await sql.query<NeedRow>(
      `select ${NEED_RETURNING.replace(/\s+/g, " ")} from mesh_needs where id = $1`,
      [data.id],
    );
    const row = rows[0];
    if (!row) throw new Error("Need not found.");
    if (row.created_by !== context.userId && profile.role !== "admin") {
      throw new Error("Only the requester or an admin can edit this.");
    }
    const updated = await sql.query<NeedRow>(
      `update mesh_needs
       set part_number = $1, description = $2, ticket_number = $3, qty = $4,
           priority = $5, notes = $6, updated_at = now()
       where id = $7
       returning ${NEED_RETURNING.replace(/\s+/g, " ")}`,
      [
        data.partNumber,
        data.description,
        data.ticketNumber,
        data.qty,
        data.priority,
        data.notes,
        data.id,
      ],
    );
    if (!updated[0]) throw new Error("Could not save that need.");
    return mapNeed(updated[0]);
  });

export const actOnNeed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const input = (raw ?? {}) as Record<string, unknown>;
    const id = Number(input.id);
    const action = String(input.action ?? "") as NeedAction;
    if (!Number.isFinite(id) || id < 1) throw new Error("Invalid need.");
    if (!["claim", "release", "fill", "reopen", "drop", "remove"].includes(action)) {
      throw new Error("Invalid action.");
    }
    return { id, action };
  })
  .handler(async ({ context, data }): Promise<MeshNeed> => {
    const sql = await getSql();
    const profile = await requireApproved(sql, context.userId);
    const isAdmin = profile.role === "admin";
    const existing = await sql<NeedRow>`
      select id, created_by, part_number, description, ticket_number, qty,
             priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
             created_at, updated_at
      from mesh_needs where id = ${data.id}
    `;
    const row = existing[0];
    if (!row) throw new Error("Need not found.");
    const me = context.userId;

    if (data.action === "drop" && row.created_by !== me && !isAdmin) {
      throw new Error("Only the requester or an admin can hide this.");
    }
    if (data.action === "remove") {
      if (!isAdmin) throw new Error("Admins only.");
    }
    if (data.action === "release" && row.claimed_by !== me && !isAdmin) {
      throw new Error("Only the person on it can release.");
    }

    let rows: NeedRow[] = [];
    if (data.action === "claim") {
      rows = await sql<NeedRow>`
        update mesh_needs
        set status = 'claimed', claimed_by = ${me}, claimed_at = now(),
            filled_by = null, filled_at = null, updated_at = now()
        where id = ${data.id} and status in ('open', 'claimed')
        returning id, created_by, part_number, description, ticket_number, qty,
                  priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                  created_at, updated_at
      `;
    } else if (data.action === "release") {
      rows = await sql<NeedRow>`
        update mesh_needs
        set status = 'open', claimed_by = null, claimed_at = null, updated_at = now()
        where id = ${data.id}
        returning id, created_by, part_number, description, ticket_number, qty,
                  priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                  created_at, updated_at
      `;
    } else if (data.action === "fill") {
      rows = await sql<NeedRow>`
        update mesh_needs
        set status = 'filled', filled_by = ${me}, filled_at = now(), updated_at = now()
        where id = ${data.id} and status in ('open', 'claimed')
        returning id, created_by, part_number, description, ticket_number, qty,
                  priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                  created_at, updated_at
      `;
    } else if (data.action === "reopen") {
      if (isAdmin) {
        rows = await sql<NeedRow>`
          update mesh_needs
          set status = 'open', claimed_by = null, claimed_at = null,
              filled_by = null, filled_at = null, updated_at = now()
          where id = ${data.id}
          returning id, created_by, part_number, description, ticket_number, qty,
                    priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                    created_at, updated_at
        `;
      } else {
        rows = await sql<NeedRow>`
          update mesh_needs
          set status = 'open', claimed_by = null, claimed_at = null,
              filled_by = null, filled_at = null, updated_at = now()
          where id = ${data.id} and (created_by = ${me} or filled_by = ${me} or claimed_by = ${me})
          returning id, created_by, part_number, description, ticket_number, qty,
                    priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                    created_at, updated_at
        `;
      }
    } else if (data.action === "remove") {
      rows = await sql<NeedRow>`
        delete from mesh_needs
        where id = ${data.id}
        returning id, created_by, part_number, description, ticket_number, qty,
                  priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                  created_at, updated_at
      `;
    } else if (isAdmin) {
      rows = await sql<NeedRow>`
        update mesh_needs
        set status = 'cancelled', updated_at = now()
        where id = ${data.id}
        returning id, created_by, part_number, description, ticket_number, qty,
                  priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                  created_at, updated_at
      `;
    } else {
      rows = await sql<NeedRow>`
        update mesh_needs
        set status = 'cancelled', updated_at = now()
        where id = ${data.id} and created_by = ${me}
        returning id, created_by, part_number, description, ticket_number, qty,
                  priority, notes, status, claimed_by, claimed_at, filled_by, filled_at,
                  created_at, updated_at
      `;
    }

    if (!rows[0]) throw new Error("Could not update that need.");
    return mapNeed(rows[0]);
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MeshProfile[]> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    return listProfiles(sql);
  });

export const setTeamAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const input = (raw ?? {}) as Record<string, unknown>;
    const userId = cleanText(input.userId, 80);
    const action = String(input.action ?? "") as TeamAction;
    if (!userId) throw new Error("Missing teammate.");
    if (!["approve", "deny", "make_admin", "remove_admin"].includes(action)) {
      throw new Error("Invalid action.");
    }
    return { userId, action };
  })
  .handler(async ({ context, data }): Promise<MeshProfile[]> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const target = await loadProfile(sql, data.userId);
    if (!target) throw new Error("No such account.");

    if (data.action === "remove_admin") {
      if (data.userId === context.userId) {
        throw new Error("You can't drop your own admin seat.");
      }
      const admins = await sql<{ n: number }>`
        select count(*)::int as n from mesh_profiles
        where role = 'admin' and access_status = 'approved'
      `;
      if (Number(admins[0]?.n) <= 1) {
        throw new Error("Keep at least one admin.");
      }
      await sql`
        update mesh_profiles
        set role = 'member', updated_at = now()
        where user_id = ${data.userId}
      `;
    } else if (data.action === "make_admin") {
      await sql`
        update mesh_profiles
        set role = 'admin', access_status = 'approved', updated_at = now()
        where user_id = ${data.userId}
      `;
    } else if (data.action === "approve") {
      await sql`
        update mesh_profiles
        set access_status = 'approved', updated_at = now()
        where user_id = ${data.userId}
      `;
    } else {
      if (data.userId === context.userId) {
        throw new Error("You can't deny your own access.");
      }
      await sql`
        update mesh_profiles
        set access_status = 'denied', role = 'member', updated_at = now()
        where user_id = ${data.userId}
      `;
    }

    return listProfiles(sql);
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown): NewAccountDraft => {
    const input = (raw ?? {}) as Record<string, unknown>;
    const displayName = cleanText(input.displayName, 80);
    const email = cleanEmail(input.email);
    const password = String(input.password ?? "");
    if (displayName.length < 2) throw new Error("Name is required.");
    if (!looksLikeEmail(email)) throw new Error("A real email is required.");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    const role: MemberRole = input.role === "admin" ? "admin" : "member";
    return {
      displayName,
      email,
      password,
      extension: cleanText(input.extension, 16),
      cell: cleanText(input.cell, 24),
      role,
    };
  })
  .handler(async ({ context, data }): Promise<MeshProfile[]> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    await ensureAccessColumns(sql);
    const userId = await createCredentialUser(sql, {
      name: data.displayName,
      email: data.email,
      password: data.password,
    });
    await sql.query(
      `insert into mesh_profiles (
         user_id, display_name, extension, cell, email, alerts_on,
         role, access_status, updated_at
       ) values ($1, $2, $3, $4, $5, true, $6, 'approved', now())`,
      [userId, data.displayName, data.extension, data.cell, data.email, data.role],
    );
    return listProfiles(sql);
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown): MemberPatch => {
    const input = (raw ?? {}) as Record<string, unknown>;
    const userId = cleanText(input.userId, 80);
    const displayName = cleanText(input.displayName, 80);
    const email = cleanEmail(input.email);
    if (!userId) throw new Error("Missing teammate.");
    if (displayName.length < 2) throw new Error("Name is required.");
    if (!looksLikeEmail(email)) throw new Error("A real email is required.");
    const passwordRaw = String(input.password ?? "");
    if (passwordRaw && passwordRaw.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    return {
      userId,
      displayName,
      email,
      extension: cleanText(input.extension, 16),
      cell: cleanText(input.cell, 24),
      password: passwordRaw || undefined,
    };
  })
  .handler(async ({ context, data }): Promise<MeshProfile[]> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const target = await loadProfile(sql, data.userId);
    if (!target) throw new Error("No such account.");
    await renameAuthUser(sql, data.userId, data.displayName, data.email);
    if (data.password) {
      await setCredentialPassword(sql, data.userId, data.password);
    }
    await sql.query(
      `update mesh_profiles
       set display_name = $1, email = $2, extension = $3, cell = $4, updated_at = now()
       where user_id = $5`,
      [data.displayName, data.email, data.extension, data.cell, data.userId],
    );
    return listProfiles(sql);
  });

export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<AdminSettings> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const row = await loadSettings(sql);
    return {
      branding: mapBranding(row),
      signupOpen: asBool(row.signup_open),
      bc: mapBcPublic(row),
    };
  });

export const saveBranding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const input = (raw ?? {}) as Record<string, unknown>;
    return {
      branding: parseBranding(input),
      signupOpen: input.signupOpen !== false,
    };
  })
  .handler(async ({ context, data }): Promise<PublicBrand> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const b = data.branding;
    await sql.query(
      `update mesh_settings
       set company_name = $1, tagline = $2, logo_data = $3,
           paper = $4, ink = $5, accent = $6, signup_open = $7, updated_at = now()
       where id = 1`,
      [b.companyName, b.tagline, b.logoData, b.paper, b.ink, b.accent, data.signupOpen],
    );
    const row = await loadSettings(sql);
    return mapPublic(row);
  });

export const saveBcConnection = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => parseBcInput(raw))
  .handler(async ({ context, data }): Promise<AdminSettings> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const stored = await loadSettings(sql);
    const secrets = mergeSecrets(stored, data);
    await sql.query(
      `update mesh_settings
       set bc_tenant_id = $1, bc_environment = $2, bc_company_id = $3,
           bc_company_name = $4, bc_client_id = $5, bc_client_secret = $6,
           bc_base_url = $7, bc_basic_user = $8, bc_basic_password = $9,
           updated_at = now()
       where id = 1`,
      [
        secrets.tenantId,
        secrets.environment,
        secrets.companyId,
        data.clear ? "" : data.companyName,
        secrets.clientId,
        secrets.clientSecret,
        secrets.baseUrl,
        secrets.basicUser,
        secrets.basicPassword,
      ],
    );
    const row = await loadSettings(sql);
    return {
      branding: mapBranding(row),
      signupOpen: asBool(row.signup_open),
      bc: mapBcPublic(row),
    };
  });

export const probeBc = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => parseBcInput(raw))
  .handler(async ({ context, data }): Promise<BcCompany[]> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const stored = await loadSettings(sql);
    const secrets = mergeSecrets(stored, data);
    if (!secretsReady(secrets)) {
      throw new Error("Fill in SaaS credentials or an on-prem URL with basic auth.");
    }
    return listBcCompanies(secrets);
  });

export const listBcOpen = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BcTicket[]> => {
    const sql = await getSql();
    await requireApproved(sql, context.userId);
    const settings = await loadSettings(sql);
    const secrets = mapSecrets(settings);
    if (!secretsReady(secrets) || !secrets.companyId) {
      throw new Error("Business Central is not connected.");
    }
    const tickets = await sql<{ ticket_number: string }>`
      select distinct ticket_number from mesh_needs
      where ticket_number <> '' and status in ('open', 'claimed')
    `;
    return listOpenBcTickets(
      secrets,
      tickets.map((t) => t.ticket_number),
    );
  });

export const getUpdateStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<UpdateStatus> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    return loadUpdateStatus();
  });

export const applyAppUpdate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((raw: unknown) => {
    const input = (raw ?? {}) as Record<string, unknown>;
    const tag = String(input.tag ?? "").trim();
    if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("Pick a version from the list.");
    return { tag };
  })
  .handler(async ({ context, data }): Promise<UpdateStatus> => {
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    return applyVersion(data.tag);
  });
