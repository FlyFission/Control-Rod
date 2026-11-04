# Policies and Administration (5.4), PR #40 review threads: adjudication

Seven threads from the GitHub reviewers on the opened PR, all accepted.

| Thread | Disposition |
|---|---|
| Policy proposal keeps stale values after an approval | Fixed. Forms take a `resetKey`; the proposal's is the policy version, so it starts again from the policy in force. Test: a new policy version resets the ceiling and formats. |
| Bootstrap authorities enforced only by the form | Fixed in the control plane: a bootstrap without both administrator and policy authority is refused (`bootstrap-authorities`, catalogued). Test: `test/bootstrap.test.ts` on an install with no qualification. |
| License lines with a fifth value silently drop it | Fixed: more than four values refuses the line. Test added. |
| `project.update` cannot change overlays | Fixed: overlays can be replaced or cleared, never both (the form names that combination and will not sign it). Test added. |
| Hard cap previewed for tokens or USD | Fixed: forms gain `invalid`, which names a combination the control plane refuses and keeps it from being signed; set and change budget forms use it. Test added. |
| Registry hardware from the registration verdict | Fixed: `hardware` is `currentFloor` under the policy in force, as signing decides. Test asserts it per credential. |
| Delegation reasons leaked to every Member | Fixed: explicit `RegistryDelegation` projection without `reason`. Test asserts the omission for a non-administrator. |

## Codex round 5

Confirmed all seven fixes; one finding, accepted: the form showed a refusal's message without the control plane's advice for lifting it. Fixed: the form renders `explain()` (message, then what would change it). Test: a `last-qualification-issuer` refusal shows its advice.

## Codex round 6 and a later thread

Codex round 6: MERGE, no actionable defects. A later review thread, accepted: with no policy approved, the first proposal started with no attestation formats though signing accepts Control Rod's defaults, so approving a proposal about something else would have removed every hardware key's eligibility. Fixed: `GET /admin` adds `hardware_formats_in_force` (the approved policy's formats, or the defaults), and the proposal starts from it. Tests: the API reports the defaults with no policy and the policy's formats once approved; the web form's first proposal keeps them.
