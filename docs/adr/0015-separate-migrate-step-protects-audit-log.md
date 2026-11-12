# A separate migrate step keeps the runtime from rewriting the audit log

Status: accepted (2026-11-09, [Grilling: Hosting, identity and least-privilege role](https://github.com/mfgAkilae/nsgfw/issues/20)). Amended on 2026-11-12 by [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23): the reason against an init container is that a job binds the migrator identity to one run per upgrade, because the first reason does not hold in the workload profiles environment the tool uses.

[Grilling: Tech stack and repository architecture](https://github.com/mfgAkilae/nsgfw/issues/10) decided that the application applies its Kysely migrations at startup under an advisory lock. [Grilling: Access, roles and audit](https://github.com/mfgAkilae/nsgfw/issues/19) decided that the application's database role has no UPDATE and no DELETE on the audit table. Both cannot hold at once: a role that owns the schema can grant itself those rights again. The hash chain shows an edited entry, but not a deleted tail. Only the export to a SIEM shows that.

We decided:

- **The image gets the role flag `migrate`,** next to `all`, `api` and `worker`. It applies the migrations as the schema owner and exits.
- **The runtime role owns nothing.** It may read and write the domain tables, and it may only insert into and select from the audit table.
- **Azure:** Azure Database for PostgreSQL flexible server allows Microsoft Entra authentication only. The runtime role belongs to the Tool identity. The owner role belongs to a second user-assigned managed identity, the migrator, which only a Container Apps Job carries. The Entra administrator of the server is an operator group, never the tool. The application passes Entra tokens through an async password callback, and the pool retires connections before the token expires.
- **On-premises:** the runtime role uses a `scram-sha-256` password from Key Vault over TLS with `verify-full`. The owner password exists only as a file in the one-shot migrate container. It is never stored in Key Vault, because the runtime can read Key Vault.
- **Upgrades run the step first.** In Azure, Terraform starts the job on every image change, before the new revision rolls out. In Docker Compose, `migrate` is a one-shot service that the application waits for. The application refuses to start when the schema is older than it expects. Migrations only add, so the previous revision keeps working during the switch.

This amends point 7 of [Grilling: Tech stack and repository architecture](https://github.com/mfgAkilae/nsgfw/issues/10).

## Considered Options

- **Migrations at startup with a second owner credential in the same process.** Rejected. It protects against bugs and SQL injection, but not against a compromised container, which can read both credentials.
- **One owner role, protected only by the hash chain and the export.** Rejected. It weakens point 19 of [Grilling: Access, roles and audit](https://github.com/mfgAkilae/nsgfw/issues/19), and a deleted tail would show only in the export.
- **An init container for migrations.** Rejected. An init container belongs to the app and runs before the main container starts ([containers](https://learn.microsoft.com/en-us/azure/container-apps/containers), retrieved 2026-11-12), so the app would carry the migrator identity and use it at every start of a replica. A job binds the migrator identity to one run per upgrade. The first reason, that init containers cannot use managed identities, no longer decides this. It holds in Consumption-only environments and on Dedicated workload profiles; on the Consumption profile of a workload profiles environment, init containers can use a managed identity ([managed identities](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity), retrieved 2026-11-12). The `instance` module creates a workload profiles environment, because egress through a NAT gateway or user-defined routes is supported only there ([networking](https://learn.microsoft.com/en-us/azure/container-apps/networking), retrieved 2026-11-12).

## Consequences

- An upgrade has two steps, and the IaC orders them.
- A migration that drops or renames a column needs two releases: one that adds, and a later one that removes.
- Each instance has two database principals.
