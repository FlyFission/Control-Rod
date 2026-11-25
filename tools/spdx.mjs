// Decides whether an SPDX license expression is allowed, given the set of allowed license IDs.
// Grammar (SPDX 2.3 annex D, the parts packages use): expr := and ("OR" and)*;
// and := atom ("AND" atom)*; atom := ID ["+"] | "(" expr ")". AND binds tighter than OR, as SPDX says.
// Anything else (WITH exceptions, LicenseRef-, stray tokens, unbalanced parentheses) is not allowed:
// the gate fails closed and a person decides.
export function expressionAllowed(expression, allowed) {
  const tokens = String(expression).match(/\(|\)|[^\s()]+/g) ?? [];
  let i = 0;
  const fail = () => {
    throw new Error("unsupported");
  };
  const atom = () => {
    const t = tokens[i++];
    if (t === "(") {
      const v = orExpr();
      if (tokens[i++] !== ")") fail();
      return v;
    }
    if (t === undefined || t === ")" || t === "AND" || t === "OR" || t === "WITH") fail();
    return allowed.has(t);
  };
  const andExpr = () => {
    let v = atom();
    while (tokens[i] === "AND") {
      i++;
      v = atom() && v;
    }
    return v;
  };
  const orExpr = () => {
    let v = andExpr();
    while (tokens[i] === "OR") {
      i++;
      v = andExpr() || v;
    }
    return v;
  };
  try {
    const v = orExpr();
    return i === tokens.length && v;
  } catch {
    return false;
  }
}
