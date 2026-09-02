import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Sql } from "@/lib/db";

function newId(): string {
  return randomBytes(16).toString("hex");
}

export async function emailTaken(sql: Sql, email: string): Promise<boolean> {
  const rows = await sql.query<{ n: number }>(
    `select count(*)::int as n from "user" where lower(email) = $1`,
    [email],
  );
  return Number(rows[0]?.n) > 0;
}

export async function createCredentialUser(
  sql: Sql,
  input: { name: string; email: string; password: string },
): Promise<string> {
  if (await emailTaken(sql, input.email)) {
    throw new Error("That email already has a login.");
  }
  const userId = newId();
  const accountId = newId();
  const hashed = await hashPassword(input.password);
  await sql.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ($1, $2, $3, true, now(), now())`,
    [userId, input.name, input.email],
  );
  await sql.query(
    `insert into "account" (
       id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
     ) values ($1, $2, 'credential', $3, $4, now(), now())`,
    [accountId, userId, userId, hashed],
  );
  return userId;
}

export async function setCredentialPassword(
  sql: Sql,
  userId: string,
  password: string,
): Promise<void> {
  const hashed = await hashPassword(password);
  const updated = await sql.query<{ id: string }>(
    `update "account"
     set password = $1, "updatedAt" = now()
     where "userId" = $2 and "providerId" = 'credential'
     returning id`,
    [hashed, userId],
  );
  if (updated[0]) return;
  await sql.query(
    `insert into "account" (
       id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt"
     ) values ($1, $2, 'credential', $3, $4, now(), now())`,
    [newId(), userId, userId, hashed],
  );
}

export async function deleteAuthUser(sql: Sql, userId: string): Promise<void> {
  await sql.query(`delete from "session" where "userId" = $1`, [userId]);
  await sql.query(`delete from "account" where "userId" = $1`, [userId]);
  await sql.query(`delete from "user" where id = $1`, [userId]);
}

export async function renameAuthUser(
  sql: Sql,
  userId: string,
  name: string,
  email: string,
): Promise<void> {
  const clash = await sql.query<{ id: string }>(
    `select id from "user" where lower(email) = $1 and id <> $2`,
    [email, userId],
  );
  if (clash[0]) throw new Error("That email already has a login.");
  await sql.query(
    `update "user" set name = $1, email = $2, "updatedAt" = now() where id = $3`,
    [name, email, userId],
  );
}
