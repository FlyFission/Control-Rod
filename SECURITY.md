# Security policy

Control Rod exists to keep AI agents from approving their own work, so we treat any way around its controls as a security issue, even if no data is exposed.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Report a vulnerability** button on this repository's Security tab. Do not open a public issue.

Helpful details:

- What control you were able to get around, and how
- The version or commit you tested
- Steps to reproduce, and any logs or evidence records involved

We will acknowledge a report, keep you informed while we work on it, and credit you in the advisory unless you prefer otherwise.

## Especially interesting

- An agent editing its own acceptance criteria, policies, baseline or verification tools
- An agent's work being accepted without the required verification record or human signature
- Data leaving a sandbox or data lane that should not allow it
- Evidence or history that can be altered without detection
- A signature that can be moved to a different record or revision

## Supported versions

Control Rod is pre-alpha. Until the first release, only the default branch is supported.
