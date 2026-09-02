import type { MemberRole } from "./types";

export function isStaff(role: MemberRole | string | undefined): boolean {
  return role === "owner" || role === "manager";
}

export function isOwner(role: MemberRole | string | undefined): boolean {
  return role === "owner";
}

export function mapRole(value: string): MemberRole {
  if (value === "owner") return "owner";
  if (value === "manager" || value === "admin") return "manager";
  return "member";
}
