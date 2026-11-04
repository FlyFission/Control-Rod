# Policies and Administration (5.4), Codex round 3: adjudication

Codex confirmed the round 2 fixes and raised one finding, accepted.

| Finding | Disposition |
|---|---|
| Issuer protection reused `last-administrator`, whose advice does not lift it | Fixed. New catalogued refusal `last-qualification-issuer` ("Issue another active member a qualification with both administrator and policy authority first."). The API test asserts the code, the message and the `change` advice in the HTTP response. |
