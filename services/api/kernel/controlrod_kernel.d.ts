/* tslint:disable */
/* eslint-disable */
/**
 * Decides a lifecycle transition. A request that does not parse is refused, never guessed.
 */
export function decide_json(request: string): string;
/**
 * Canonical SHA-256 of a JSON record under the shared digest profile, as lowercase hex.
 *
 * # Errors
 * Returns the digest profile error for input outside the profile.
 */
export function canonical_sha256_hex(json: string): string;
