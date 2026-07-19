# Security Policy

Security fixes are provided for the latest released minor version.

Do not report vulnerabilities in public issues. Use GitHub private vulnerability
reporting for the repository. If private reporting is unavailable, contact the
maintainer through the private address listed in the GitHub organization
profile.

Include affected versions, reproduction steps, impact, and any suggested
mitigation. Maintainers will acknowledge a report within seven days and will
coordinate disclosure after a fix is available.

Context Router `v0.1` is a trusted-local stdio service. Do not expose it directly
to an untrusted network. `CONTEXT_ROUTER_OWNER_ID` is an isolation scope, not an
authentication credential.
