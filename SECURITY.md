# Security Policy

## Supported versions

Cadenza is pre-1.0 (0.x). Only the latest 0.x minor release receives security
fixes; older minors are not backported.

| Version | Supported |
| --- | --- |
| latest 0.x | yes |
| anything older | no |

## Reporting a vulnerability

Report privately through GitHub Security Advisories on
`suisya-systems/cadenza`: open the repository's Security tab and use
"Report a vulnerability". Do not open a public issue for a suspected
vulnerability.

We aim to acknowledge a report within 3 business days. Disclosure is
coordinated: we work with the reporter on a fix and a release before any
public detail is published, and credit the reporter unless they ask otherwise.

## Scope

Cadenza's core job is resolving catalog data (tracked and operator-local
layers, see `docs/design/g1-project-registry.md`) into clone sources that a
run then acts on. That makes an untrusted catalog file a real attack surface:
if something other than the intended operator can edit `config/projects.toml`
or `config/projects.local.toml`, they can steer a future run's clone source
or base branch.

Treat a catalog file as trusted input at the level of whoever can edit it —
the same trust you'd extend to someone who can push to the repository or
write to your local disk. Cadenza does not sandbox against a malicious
catalog author.

`local_path` containment (`docs/design/g1-project-registry.md` section 3.1) is
checked lexically only: the domain layer normalizes and bounds-checks the path
string, but never touches the filesystem. A lexically contained path can
still be a symlink pointing outside the allowed root. Verifying that a path
is not a symlink, and otherwise safe to clone from, is the run-side
`LocalPathVerifier` port's job, not the catalog's. Do not treat catalog-level
containment as a filesystem safety guarantee on its own.
