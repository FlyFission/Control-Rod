/**
 * SemVer 2.0 precedence for strict versions (no build metadata), as the daemon's agentupdate
 * package compares them: major, minor and patch numerically; a prerelease is lower than its
 * release; prerelease identifiers compare numeric ones by value (length, then digits) and below
 * alphanumeric ones, which compare in ASCII order; a shorter list of equal identifiers is lower.
 */
const STRICT = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;

export const strictVersion = (v: unknown): v is string => typeof v === "string" && v.length <= 64 && STRICT.test(v);

const ident = (x: string, y: string): number => {
  const dx = /^\d+$/.test(x);
  const dy = /^\d+$/.test(y);
  if (dx && dy) return x.length !== y.length ? x.length - y.length : x < y ? -1 : x > y ? 1 : 0;
  if (dx) return -1;
  if (dy) return 1;
  return x < y ? -1 : x > y ? 1 : 0;
};

/** True when a and b are strict versions and a has higher precedence than b. */
export function newer(a: string, b: string): boolean {
  const ma = STRICT.exec(a);
  const mb = STRICT.exec(b);
  if (!ma || !mb || a.length > 64 || b.length > 64) return false;
  for (let i = 1; i <= 3; i++) {
    const d = Number(ma[i]) - Number(mb[i]);
    if (d !== 0) return d > 0;
  }
  const pa = ma[4];
  const pb = mb[4];
  if (pa === undefined || pb === undefined) return pa === undefined && pb !== undefined;
  const xa = pa.split(".");
  const xb = pb.split(".");
  for (let i = 0; i < Math.min(xa.length, xb.length); i++) {
    const c = ident(xa[i]!, xb[i]!);
    if (c !== 0) return c > 0;
  }
  return xa.length > xb.length;
}
