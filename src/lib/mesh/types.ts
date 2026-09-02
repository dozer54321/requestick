export const NEED_STATUSES = ["open", "claimed", "filled", "cancelled"] as const;
export type NeedStatus = (typeof NEED_STATUSES)[number];

export const NEED_PRIORITIES = ["hot", "today", "later"] as const;
export type NeedPriority = (typeof NEED_PRIORITIES)[number];

export const ACCESS_STATUSES = ["pending", "approved", "denied"] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export type MemberRole = "owner" | "manager" | "member";

export type MeshProfile = {
  userId: string;
  displayName: string;
  extension: string;
  cell: string;
  email: string;
  alertsOn: boolean;
  role: MemberRole;
  accessStatus: AccessStatus;
};

export type MeshNeed = {
  id: number;
  createdBy: string;
  partNumber: string;
  description: string;
  ticketNumber: string;
  qty: number;
  priority: NeedPriority;
  notes: string;
  status: NeedStatus;
  claimedBy: string | null;
  claimedAt: string | null;
  filledBy: string | null;
  filledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MeshSnapshot = {
  me: string;
  needs: MeshNeed[];
  profiles: MeshProfile[];
  revision: string;
  openCount: number;
  hotCount: number;
  claimedCount: number;
  bcConnected: boolean;
  announcement: DeskAnnouncement | null;
};

export type DeskAnnouncement = {
  id: number;
  body: string;
  by: string;
  at: string;
};

export type NeedDraft = {
  partNumber: string;
  description: string;
  ticketNumber: string;
  qty: number;
  priority: NeedPriority;
  notes: string;
};

export type NeedPatch = NeedDraft & { id: number };

export type NeedAction = "claim" | "release" | "fill" | "reopen" | "drop" | "remove";

export type StatusFilter = "open" | "claimed" | "filled" | "all" | "hidden";
export type SortMode = "date" | "part" | "priority";

export type TeamAction = "approve" | "deny" | "make_manager" | "remove_manager" | "transfer_owner";

export type Branding = {
  companyName: string;
  tagline: string;
  logoData: string;
  paper: string;
  ink: string;
  accent: string;
};

export type PublicBrand = Branding & {
  signupOpen: boolean;
};

export type AdminSettings = {
  branding: Branding;
  signupOpen: boolean;
  bc: BcConnectionPublic;
};

export type BcConnectionPublic = {
  tenantId: string;
  environment: string;
  companyId: string;
  companyName: string;
  clientId: string;
  hasSecret: boolean;
  baseUrl: string;
  basicUser: string;
  hasBasicPassword: boolean;
  connected: boolean;
};

export type BcConnectionInput = {
  tenantId: string;
  environment: string;
  companyId: string;
  companyName: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  basicUser: string;
  basicPassword: string;
  clear?: boolean;
};

export type BcCompany = {
  id: string;
  name: string;
};

export type BcLine = {
  id: string;
  documentId: string;
  partNumber: string;
  description: string;
  qty: number;
  outstanding: number;
};

export type BcPartOrder = {
  orderId: string;
  orderNumber: string;
  status: string;
  salespersonCode: string;
  outstanding: number;
  description: string;
};

export type BcTicket = {
  id: string;
  kind: "order" | "quote";
  number: string;
  customer: string;
  salesperson: string;
  status: string;
  date: string;
  lines: BcLine[];
  onMesh: boolean;
};

export type NewAccountDraft = {
  displayName: string;
  email: string;
  password: string;
  extension: string;
  cell: string;
  role: MemberRole;
};

export type MemberPatch = {
  userId: string;
  displayName: string;
  email: string;
  extension: string;
  cell: string;
  password?: string;
};

export type ReleaseInfo = {
  tag: string;
  name: string;
  publishedAt: string;
  notes: string;
  hasImage: boolean;
  cached: boolean;
  newer: boolean;
};

export type UpdateStatus = {
  currentVersion: string;
  latestTag: string | null;
  updateAvailable: boolean;
  canApply: boolean;
  reason: string;
  repo: string;
  job: {
    state: "idle" | "downloading" | "loading" | "restarting" | "error";
    targetTag: string | null;
    error: string | null;
  };
  releases: ReleaseInfo[];
};
