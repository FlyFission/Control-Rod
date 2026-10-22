# ADR 0013: Better Auth narrowed, Keycloak for enterprise identity

- Status: Accepted
- Date: 2026-10-22

## Decision
Better Auth handles sessions, passkeys and OIDC login only. SAML, SCIM, smart cards and FIPS deployments go through Keycloak or the customer's own provider, behind one identity interface.

## Context
Better Auth's SSO and SCIM plugins had critical account-takeover advisories in 2026, and its cryptography is not FIPS-validated.
