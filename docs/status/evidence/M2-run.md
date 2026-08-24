# M2 applied migration run

Initial run date: **2026-08-14**
Base migration version: **2026-08-10.1**
Source checksum: **`1b32cbfbe4063afee36619404a380a526cb4568ef7ddaef5fb9ff6d7d39af539`**

## Environment

- PostgreSQL: `postgres:17-alpine`, fresh schema produced by the two M1 migrations.
- Object store: `minio/minio:RELEASE.2025-09-07T16-13-09Z` pinned to digest `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`.
- Bucket: `portfolio-media`, verified private with no anonymous policy.
- Credentials: enabled non-root application user with the `readwrite` policy; no credential values are recorded here.

## Apply and replay

The explicit-apply command completed once with:

```text
Legacy migration applied with 6 media object(s).
```

The same command, source checksum, database, and bucket were used immediately again. The replay completed with:

```text
Legacy migration already applied; no media objects were written.
```

The migration ledger contains one row for version `2026-08-10.1`, and its checksum matches the reconciliation report.

## Reconciled counts

| Record                        | Actual | Expected |
| ----------------------------- | -----: | -------: |
| Projects                      |     14 |       14 |
| Project translations          |     14 |       14 |
| Skill categories              |      6 |        6 |
| Skill-category translations   |      6 |        6 |
| Skills                        |     26 |       26 |
| Project-skill relations       |     55 |       55 |
| Certificates                  |      5 |        5 |
| Certificate translations      |      5 |        5 |
| Quotes                        |     35 |       35 |
| Verified media assets         |      6 |        6 |
| Resume versions               |      1 |        1 |
| Page sections                 |      6 |        6 |
| Navigation items              |      6 |        6 |
| Social links                  |      3 |        3 |
| Donate links                  |      1 |        1 |
| Applied migration ledger rows |      3 |        3 |

All 55 project-skill rows are protected by the migrated foreign-key constraints, so an orphan relation cannot be present in this applied schema.

## Media reconciliation

All six database rows are `DOCUMENT`/`application/pdf` with `VERIFIED` processing state. Certificates are public and the resume is private. MinIO contained exactly these six keys after both runs; hashing the stored object bytes in place produced the same SHA-256 values as both the source files and database metadata.

| Source file  |  Bytes | SHA-256                                                            |
| ------------ | -----: | ------------------------------------------------------------------ |
| `Next.pdf`   | 515726 | `163e65fefe48925dac0aeb2bb6537ee31a013a555568a8a70f4e6a3b55573e14` |
| `React.pdf`  | 502807 | `0f7d607ff0cb5d0e4c4a94fea61652e01a5f766436af580764b5d34a08b28f24` |
| `Web-1.pdf`  | 514902 | `41c6547e3de6e3d4e93d08dbd2aa59b1b33c4eb5361ae9dfa3713708be71625b` |
| `Web-2.pdf`  | 519381 | `6e7c9235ff6b8d82cb4d2e4a5f4c54beeb5fbc01138382f19da50f3f65e51123` |
| `Web-3.pdf`  | 512759 | `ec4d3b375c1322c6061c19e12c9d9cb92e250fc4fbe9bb3fab15c7a7462d3577` |
| `resume.pdf` | 279876 | `26b5888c8df0f6ea6b4d7d8bc10772f1d2e21797aec78eefeac7c5734e169b9b` |

## Completion run — 2026-08-24

- PostgreSQL: local `postgres:17-alpine`, server version 17.10; all three tracked schema migrations applied and the deterministic M1 structural seed completed before the page-section step.
- Object store: private local MinIO bucket `portfolio-media`, running the pinned `RELEASE.2025-09-07T16-13-09Z` image at digest `sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` with a non-root migration user.
- Apply output after the base media version was already in the ledger: `Legacy Hero/About and section ordering migrated.` and `Reviewed skill colours applied to 3 skill(s); the frozen source is unchanged.`
- Immediate replay output: `Legacy migration already applied; no media objects were written.`, `Legacy Hero/About and section ordering already applied.`, and `Reviewed skill colours already applied.`
- Reconciliation: 14 projects, 26 skills, 5 certificates, 35 quotes, 6 verified media rows, one resume, and 55 project-skill rows; the private bucket contains exactly six objects.
- Skill colours: legacy IDs 202, 306, and 801 are respectively `#0070f3`, `#767676`, and `#8b5cd6`.
- Ledger versions: `2026-08-10.1`, `2026-08-14.page-sections.1`, and `2026-08-15.skill-colors.1`.

The placeholder project URL warning is accepted: `#` becomes `null`. M2 has no outstanding acceptance work.

The deterministic preflight artifact is [M2-reconciliation.json](M2-reconciliation.json).
