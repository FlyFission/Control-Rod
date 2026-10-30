import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

/**
 * Login roles for the command boundary (specification 10.1). The application reads as
 * controlrod_reader and the command executor writes as controlrod_writer. Each is its own login and
 * a member of no other role, so neither can switch to a stronger role: there is nothing to switch to.
 *
 * A local install provisions both itself (the app owns its embedded cluster). An external database
 * is provisioned once by an administrator, who hands the app CONTROLROD_DB_READER_URL and
 * CONTROLROD_DB_WRITER_URL. Either way, startup verifies the roles and refuses to run if they are
 * stronger than they should be.
 */
export const READER = "controlrod_reader";
export const WRITER = "controlrod_writer";

export interface RoleSecrets { reader: string; writer: string }
export interface RoleUrls { readerUrl: string; writerUrl: string }

export class RoleSetupError extends Error {}

/** Loads the local role passwords, creating them on first use (mode 0600). */
export function localRoleSecrets(file: string): RoleSecrets {
  if (!existsSync(file)) {
    const fresh: RoleSecrets = { reader: randomBytes(24).toString("hex"), writer: randomBytes(24).toString("hex") };
    writeFileSync(file, JSON.stringify(fresh), { mode: 0o600 });
  }
  const s = JSON.parse(readFileSync(file, "utf8")) as RoleSecrets;
  if (!/^[0-9a-f]{48}$/.test(s.reader) || !/^[0-9a-f]{48}$/.test(s.writer)) throw new RoleSetupError(`${file} is not a Control Rod role secrets file`);
  return s;
}

/** The owner's connection string with a role's own login in place of the owner's. */
export function roleUrl(ownerUrl: string, role: string, password: string): string {
  const u = new URL(ownerUrl);
  u.username = role;
  u.password = password;
  return u.toString();
}

/**
 * Creates or updates both login roles with the given passwords. Needs a connection that may create
 * roles; without one it refuses with the step an administrator must take.
 */
export async function provisionRoles(owner: pg.Pool, secrets: RoleSecrets): Promise<void> {
  const me = (await owner.query<{ allowed: boolean }>(
    "select rolsuper or rolcreaterole as allowed from pg_roles where rolname = current_user")).rows[0];
  if (!me?.allowed)
    throw new RoleSetupError(
      "Control Rod needs two database logins, controlrod_reader and controlrod_writer, and this connection cannot create them. " +
      "Ask a database administrator to create them (see docs/commands/database-roles.md), then set CONTROLROD_DB_READER_URL and CONTROLROD_DB_WRITER_URL.");
  for (const [role, password] of [[READER, secrets.reader], [WRITER, secrets.writer]] as const) {
    const attrs = "login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls";
    // Role names are constants; passwords are hex, checked above, so quoting is safe.
    const exists = (await owner.query("select 1 from pg_roles where rolname = $1", [role])).rowCount;
    try {
      await owner.query(`${exists ? "alter" : "create"} role ${role} ${attrs} password '${password}'`);
    } catch (e) {
      // Another database on this cluster created it first; set the password on the existing role.
      if ((e as { code?: string }).code !== "42710") throw e;
      await owner.query(`alter role ${role} ${attrs} password '${password}'`);
    }
  }
}

/** Refuses to run unless both roles exist, can log in, and hold no power beyond their grants. */
export async function verifyRoles(owner: pg.Pool): Promise<void> {
  const rows = (await owner.query<{ rolname: string; strong: boolean; member_of: string[]; members: string[] }>(
    `select r.rolname,
            (r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication or r.rolbypassrls or not r.rolcanlogin) as strong,
            array(select g.rolname::text from pg_auth_members m join pg_roles g on g.oid = m.roleid where m.member = r.oid) as member_of,
            array(select u.rolname::text from pg_auth_members m join pg_roles u on u.oid = m.member where m.roleid = r.oid) as members
       from pg_roles r where r.rolname in ($1, $2)`, [READER, WRITER])).rows;
  for (const role of [READER, WRITER]) {
    const r = rows.find((x) => x.rolname === role);
    if (!r) throw new RoleSetupError(`database role ${role} does not exist; see docs/commands/database-roles.md`);
    if (r.strong) throw new RoleSetupError(`database role ${role} has powers it must not have (superuser, role or database creation, replication, row security bypass) or cannot log in`);
    if (r.member_of.length) throw new RoleSetupError(`database role ${role} is a member of ${r.member_of.join(", ")}; it must belong to no role`);
    if (r.members.some((m) => m === READER || m === WRITER)) throw new RoleSetupError(`database role ${role} has the other Control Rod role as a member`);
  }
}

/** Fails if a pool is not logged in as the role it is meant to be. */
export async function assertLogin(pool: pg.Pool, role: string): Promise<void> {
  const r = (await pool.query<{ session_user: string; current_user: string }>("select session_user, current_user")).rows[0];
  if (r?.session_user !== role || r.current_user !== role)
    throw new RoleSetupError(`expected to be logged in as ${role}, but the session is ${r?.session_user} acting as ${r?.current_user}`);
}
