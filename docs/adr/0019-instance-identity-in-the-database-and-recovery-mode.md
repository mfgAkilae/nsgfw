# The Instance's identity lives in its database, and an older or copied database enters Recovery mode

Status: accepted (2026-11-10, [Grilling: Operations: restore, exit, upgrades and exposure](https://github.com/mfgAkilae/nsgfw/issues/29)). Amends point 20 of [Grilling: Zone onboarding and NSG lifecycle](https://github.com/mfgAkilae/nsgfw/issues/11): an NSG or ASG of another Instance no longer blocks onboarding for good. It is taken over through a Handover.

Every Managed NSG and Managed ASG carries the Instance ID in `nsgfw-managed-by`, and that ID decides which resources belong to an Instance. PostgreSQL holds all state. A database recovered from backup is older than Azure. Versions and audit entries after the restore point are gone, and every resource written since then shows as Drift. The ID sequences would hand out Rule IDs, Zone IDs, Object IDs and Version numbers that lost entries already used, and those IDs already appear in NSG rule names (`nsgfw-r<Rule ID>-…`), in tags and in the audit export. A database copied into another installation carries the same Instance ID, so two Instances would both treat the same NSGs as their own.

We decided:

- **The Instance ID lives in the database.** The first migrate creates it, and it travels with every backup and dump. An empty database is a new Instance. The `instance` module does not set it.
- **Resources of another Instance go through a Handover.** Onboarding treats an NSG or ASG tagged by another Instance like one that other IaC manages: Import, adopt in place or swap, and the admin confirms the Handover checklist, which says that the other Instance is shut down or no longer writes there. The tool then rewrites the marker tag. There is no release step at exit.
- **A version tag shows that the database is older than Azure.** Every Managed NSG and Managed ASG carries `nsgfw-version` with the Version whose Deployment last changed its content. The tag changes only when the content changes, in ARM mode and in the Data contract, so it adds no writes and no Terraform diffs. At startup and in the daily reconcile one Resource Graph query reads the highest value under this Instance ID. If it is above the newest Version in the database, the Instance enters Recovery mode.
- **The database records the Tool identity it runs under:** the Tool identity's object ID and the app registration's client ID, at first start. If the running ones differ, the Instance enters Recovery mode and an admin chooses. **Move** keeps the Instance ID, and a checklist confirms that the old installation is shut down. A move from on-premises to Azure changes the identity legitimately and is a Move. **Copy** gives the Instance a new ID. The Zones it already holds then have NSGs and ASGs tagged by the old ID: they get no Deployment and no automatic Overwrite until an admin confirms a Handover for them.
- **Recovery mode** ends every session. Only holders of the Entra app role `InstanceAdmin` can sign in. That role lives outside the database, so a recovery cannot bring back a Role assignment that was revoked after the restore point. There are no Commits, no Deployments and no automatic Overwrite or Adopt. The Drift poll keeps running. An admin can also start Recovery mode by hand.
- **Differences are resolved through the existing paths.** The tool sorts them into known resources with other content (Drift), Managed NSGs and Managed ASGs of this Instance that the database does not know (lost onboardings), and known resources that are missing in Azure. An admin resolves them with Overwrite, which writes single resources at once, with Adopt, whose Change sets wait until the mode ends, and with a new onboarding through Import. The tool does not rebuild lost Rules from NSG rules; the audit export shows what was lost. The admin can end Recovery mode at any time with a reason, and whatever is still open stays ordinary Drift.
- **IDs never repeat.** On entering Recovery mode, every ID sequence (Rule, Zone, Object, Version) jumps past the highest value the tool finds in Azure, plus a reserve of 10,000 for IDs that reached only the audit export.
- **The audit chain continues with a recovery entry.** The entry records the event, the hash of the restored last entry and the highest Version found in Azure, and it chains to the restored last entry. The export then shows a fork at that point. The chain verify accepts a fork only at a recovery entry.
- **The tag and Recovery mode ship with the first stage**, because detection sees only resources that carry the tag.

## Considered Options

- **The Instance ID as a Terraform variable.** Rejected. A reinstall without backup that sets the old ID takes over every NSG without a confirmation, and a copy looks exactly like the original.
- **A release step at exit that removes the marker tags.** Rejected. It fails exactly when the old Instance is lost, and the Handover covers both cases.
- **Detection only through an operator step** in the recovery runbook. Rejected. An operator who forgets it gets a flood of Drift, and automatic Overwrite would roll parts of Azure back.
- **Detection through Drift that `resourcechanges` attributes to the Tool identity.** Rejected. `resourcechanges` keeps 14 days ([Research: ARM and Resource Graph behaviour for NSG deployment](https://github.com/mfgAkilae/nsgfw/issues/4)), so older writes show as Drift with no sign of the recovery.
- **Only a write lock, open to everyone, or only a banner.** Rejected. Role assignments revoked after the restore point would hold again.
- **Ending Recovery mode only when every difference is resolved.** Rejected. One unclear NSG would hold up every Commit of the Instance.
- **Rebuilding lost Rules from the NSG rules in Azure,** keeping their Rule IDs and flow-log history. Rejected. It needs a reverse translation across partitions, packing and both sides of a flow.
- **Random IDs instead of sequences.** Rejected. They never collide, but they make NSG rule names longer and IDs harder to read. The jump keeps short numbers.
- **A new Instance ID whenever the identity changes.** Rejected. A real move would then need a Handover for every NSG.
- **Importing the tail of the audit export after a recovery.** Rejected for the MVP. The database stays the source of truth and the export the long-term store.

## Consequences

- In Azure, a point-in-time restore of Azure Database for PostgreSQL flexible server always creates a new server with a new name and copies neither private endpoints nor server parameters ([backup and restore concepts](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore), page date 2026-07-16, retrieved 2026-11-10). The recovery runbook therefore goes through the `instance` module.
- The Deployed state holds the tag value, so an Overwrite writes it back with the content.
- A copied database in a test installation must get the Copy choice before it can write anything.
