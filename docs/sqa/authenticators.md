# Hardware-backed authenticators for high-consequence signing

Approved by the owner on 2026-10-30 (workbench plan task 0.10; specification section 11.1, G-5). The Platform Plan floor: "High-consequence decisions need a credentialed person signing with a hardware-backed key."

## Eligible

A passkey counts as hardware backed only when its registration carried an attestation statement that identifies one of these authenticator classes, recorded on the Member's AuthenticatorCredential:

| Class | Examples | Evidence at registration |
|---|---|---|
| Roaming FIDO2 security key | YubiKey 5 series, other FIDO2 certified keys | `packed` or `fido-u2f` attestation chaining to the vendor's root; AAGUID recorded |
| Platform authenticator bound to a TPM | Windows Hello on a device with a TPM 2.0 | `tpm` attestation; AAGUID recorded |

## Not eligible

- Synced passkeys (for example iCloud Keychain or Google Password Manager). They are designed to move between devices, and their platforms typically return no attestation.
- Any credential registered with `attestation: "none"`. That includes every passkey registered before this policy, because `services/api/src/auth.ts` currently requests no attestation.
- Credentials whose attestation cannot be verified against a retained trust anchor.

Ineligible credentials still sign everything else; only decisions whose floor requires a hardware-backed key refuse them, and the refusal names the missing evidence.

## What the owner does

Re-enroll one security key or Windows Hello credential with attestation once Phase 1 task 1.12 lands, before signing any high-consequence decision.

## Change control

Adding or removing an authenticator class is a policy change: a ChangeRequest signed by a Member with policy authority.

## Exit criteria

Phase 1 task 1.12 enforces this list, and its tests refuse every class marked not eligible.

## Source-lineage note

Written for Control Rod from the Platform Plan's Security and compliance floor and the W3C WebAuthn attestation formats.
