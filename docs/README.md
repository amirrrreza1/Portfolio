# Documentation index

These documents define the approved target before feature implementation begins.

| Document | Purpose |
| --- | --- |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | Scope, users, requirements, acceptance criteria, and non-goals |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Runtime topology, workspace boundaries, request flows, and engineering rules |
| [DATA_MODEL.md](DATA_MODEL.md) | PostgreSQL entities, relationships, constraints, publishing states, and revisions |
| [API_SPEC.md](API_SPEC.md) | Public/admin endpoints, contracts, caching, errors, and concurrency rules |
| [SECURITY.md](SECURITY.md) | Threat model, mandatory controls, secure defaults, and release gates |
| [SEO.md](SEO.md) | Technical SEO, structured data, publishing checklist, and measurable targets |
| [DOCKER.md](DOCKER.md) | Container topology, hardening, health checks, migrations, and operations |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Ordered delivery phases, JSON migration, testing, and definition of done |

## Priority rules

1. Security requirements use **MUST**, **SHOULD**, and **MAY** in their RFC-style meanings.
2. If an implementation convenience conflicts with [SECURITY.md](SECURITY.md), the security requirement wins.
3. Public read paths must remain cacheable and server-rendered even though admin writes are dynamic.
4. Database access belongs to the API/database workspaces; browser code never receives database credentials.
5. Content migration must be reversible until production verification is complete.

## Status

The repository currently contains documentation, workspace/package scaffolding, the original frontend, and an API health probe. Feature code and the Prisma model are intentionally deferred to the implementation phases.
