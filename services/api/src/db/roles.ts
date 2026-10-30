import { randomBytes } from "node:crypto";
import { chmodSync, closeSync, lstatSync, openSync, readFileSync, writeSync } from "node:fs";
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

const SECRET = /^[0-9a-f]{48}$/;

/**
 * Reads a private file, creating it with `create()` on first use. Creation is exclusive (never
 * follows or replaces an existing path); an existing file must be a regular file, not a link, and
 * is narrowed to mode 0600 if it was wider.
 */
export function privateFile(path: string, create: () => string): string {
  try {
    const fd = openSync(path, "wx", 0o600);
    try { writeSync(fd, create()); } finally { closeSync(fd); }
  } catch (e) {
    if ((e as { code?: string }).code !== "EEXIST") throw e;
  }
  const st = lstatSync(path);
  if (!st.isFile()) throw new RoleSetupError(`${path} must be a regular file, not a link or directory`);
  if (typeof process.getuid === "function" && st.uid !== process.getuid()) throw new RoleSetupError(`${path} is owned by another user`);
  if ((st.mode & 0o077) !== 0) chmodSync(path, 0o600);
  return readFileSync(path, "utf8").trim();
}

/** Loads the local role passwords, creating them on first use. */
export function localRoleSecrets(file: string): RoleSecrets {
  const s = JSON.parse(privateFile(file, () => JSON.stringify({ reader: randomBytes(24).toString("hex"), writer: randomBytes(24).toString("hex") }))) as RoleSecrets;
  assertSecrets(s);
  return s;
}

function assertSecrets(s: RoleSecrets): void {
  if (!SECRET.test(s?.reader ?? "") || !SECRET.test(s?.writer ?? "")) throw new RoleSetupError("role passwords must be 48 hexadecimal characters");
}

/** Whether a login already accepts this password, so provisioning can leave it alone. */
async function canLogIn(ownerUrl: string, role: string, password: string): Promise<boolean> {
  const probe = new pg.Pool({ connectionString: roleUrl(ownerUrl, role, password), max: 1, connectionTimeoutMillis: 5000 });
  try {
    await probe.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end();
  }
}

/** The owner's connection string with a role's own login in place of the owner's. */
export function roleUrl(ownerUrl: string, role: string, password: string): string {
  const u = new URL(ownerUrl);
  u.username = role;
  u.password = password;
  return u.toString();
}

/**
 * Creates both login roles, or sets a password that does not yet work. A login that already accepts
 * its password is left alone, so installations sharing a server do not reset each other. Needs a
 * connection that may create roles; without one it refuses with the step an administrator must take.
 */
export async function provisionRoles(owner: pg.Pool, secrets: RoleSecrets): Promise<void> {
  assertSecrets(secrets);
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
    if (exists && (await canLogIn(owner.options.connectionString as string, role, password))) continue;
    try {
      await owner.query(`${exists ? "alter" : "create"} role ${role} ${attrs} password '${password}'`);
    } catch (e) {
      // Another database on this cluster created it first; set the password on the existing role.
      if ((e as { code?: string }).code !== "42710") throw e;
      await owner.query(`alter role ${role} ${attrs} password '${password}'`);
    }
  }
}

/**
 * Refuses to run unless both roles exist, can log in, hold no power beyond their grants, and their
 * effective privileges are what migration 011 gives them: the reader writes nothing, the writer
 * writes no rule table, neither owns anything, and no privileged function can act for them.
 */
export async function verifyRoles(owner: pg.Pool, writerReadOnly: readonly string[] = []): Promise<void> {
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
  const audit = (await owner.query<{ problem: string }>(
    `select format('%s can write %s', $1::text, c.relname) as problem from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege($1, c.oid, 'insert,update,delete,truncate')
     union all
     select format('%s can write %s', $2::text, c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($3::text[]) and has_table_privilege($2, c.oid, 'insert,update,delete,truncate')
     union all
     select format('%s owns %s', pg_get_userbyid(c.relowner), c.relname) from pg_class c
        where pg_get_userbyid(c.relowner) in ($1, $2)
     union all
     select format('%s owns schema %s', pg_get_userbyid(nspowner), nspname) from pg_namespace where pg_get_userbyid(nspowner) in ($1, $2)
     union all
     select format('%s can create in schema public', r) from unnest(array[$1, $2]::text[]) r where has_schema_privilege(r, 'public', 'create')
     union all
     select format('security definer function %s in public', p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef`,
    [READER, WRITER, [...writerReadOnly]])).rows;
  if (audit.length) throw new RoleSetupError(`database privileges are wider than Control Rod allows: ${audit.map((a) => a.problem).join("; ")}`);
}

/** Fails if a pool is not logged in as the role it is meant to be. */
export async function assertLogin(pool: pg.Pool, role: string): Promise<void> {
  const r = (await pool.query<{ session_user: string; current_user: string }>("select session_user, current_user")).rows[0];
  if (r?.session_user !== role || r.current_user !== role)
    throw new RoleSetupError(`expected to be logged in as ${role}, but the session is ${r?.session_user} acting as ${r?.current_user}`);
}
