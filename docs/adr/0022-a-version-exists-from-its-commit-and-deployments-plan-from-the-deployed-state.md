# A Version exists from its Commit, and Deployments plan from the Deployed state

Status: accepted (2026-11-12, [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23)). Supersedes [ADR 0009](0009-tighten-then-loosen-deployments.md) together with [ADR 0023](0023-writes-are-ordered-only-by-crossing-flows-with-a-settle-time.md). First decided on 2026-11-09 in [Grilling: Deployment execution and failure handling](https://github.com/mfgAkilae/nsgfw/issues/16).

A Commit changes many Azure resources, and no Azure operation spans more than one of them. Writes to different NSGs, network interfaces and subnets land one after another, and in a Terraform Environment they can land days later. The brief requires Deployments that are idempotent and resumable, and never silently half-applied. [ADR 0009](0009-tighten-then-loosen-deployments.md) answered this together with a Tighten phase and a Loosen phase, which [ADR 0023](0023-writes-are-ordered-only-by-crossing-flows-with-a-settle-time.md) replaced. This ADR records the part of ADR 0009 that still holds.

We decided:

- **A Version records what was decided and exists from the moment of its Commit.** A Commit starts one Deployment per affected Environment, and each Deployment has its own result. Whether Azure matches a Version is the result of its Deployments.
- **The tool stores the Deployed state of every resource it manages:** what Azure stored after the tool's last successful write, or, for a resource adopted in place and not yet written, its content at adoption. In a Terraform Environment it is the content of the merged Data contract that the tool has seen in Azure. Drift is a difference between Azure and the Deployed state, not between Azure and the Version. A resource that a Deployment has not reached yet is pending, not drifted.
- **A Deployment plans from the Deployed state to the latest Version, and a newer one supersedes.** When a newer Version commits while a Deployment to the same Environment is still running or has failed, the older Deployment stops after the writes in flight and becomes superseded. The newer Deployment also delivers what the older one did not. In ARM mode a write in retry backoff counts as in flight only while its request is running, and a superseding Deployment cancels the backoff. In Terraform mode a merged step is observed to its end before a newer Deployment plans, with the apply timeout as the limit, and the stage watch keeps the Deployed state of a superseded step current.
- **Pre-checks run in two stages.** They check Drift (a fresh GET of every resource the Deployment writes, compared with the Deployed state), Azure Policy (`checkPolicyRestrictions` for every NSG and subnet write) and the live limits per subscription and region. Stage 1 is a gate before the Version, for a Commit that a person makes or scheduled: when Drift, a deny Policy finding without a Pre-check waiver or a live limit fails it, no Version is created and the Change set stays Approved. Stage 2 runs at the start of every Deployment and stops only that Deployment before its first write. Commits of the tool that only close traffic (Rule expiry, a closing Adopt) skip stage 1; in stage 2 an NSG with Drift fails on its own and the rest deploys. Stage 1 runs outside the serialized Commit section, so a large Change set does not hold other Commits; the Commit re-checks only that the latest Version is still its base.
- **After a crash, every write can be repeated.** Each Deployment holds a lease with a heartbeat. When the lease expires, another worker takes over and checks each write in flight with a GET. A resource that matches the target counts as written. One that matches the Deployed state gets the PUT again. One that matches neither fails as Drift.
- **Creations that open nothing come first, deletions last.** A Deployment first creates what opens nothing: a new NSG without a subnet and an empty Managed ASG. It deletes last: Managed ASGs that nothing references, and the NSGs of Zones without a subnet. The order of the writes in between is the subject of ADR 0023, [ADR 0024](0024-asg-membership-is-written-as-atoms-in-member-steps.md) and [ADR 0025](0025-the-write-order-spans-environments.md); the algorithm is in [the translation engine design](../design/translation-engine.md#plan-the-write-order), section "Plan: the write order".

## Considered Options

- **A Version only after every Deployment succeeds.** Rejected. Serialized Commits would wait for Terraform pull requests, and a partial Deployment would match no Version.
- **An automatic rollback when a Deployment fails.** Rejected. A rollback is a Change set with Approval.
- **A queue of Deployments per Environment, without superseding.** Rejected. A write that keeps failing, for example because of a Policy deny, would block the fix behind it.
- **One queue for the whole instance.** Rejected. Open Terraform pull requests would block every Commit.

## Consequences

- The latest Version can be ahead of Azure. A Commit that spans an ARM Environment and a Terraform Environment can read "ARM deployed, Terraform: pull request open".
- A rollback is a Revert or a Restore. It runs through the same path, and its Deployments supersede the unfinished ones.
- A Commit that fails stage 1 leaves no Version behind. At a scheduled time the Change set stays Approved without a schedule, and the committer and the Change set owner are notified.
- Stage 2 does not close the gap to the write. Every single write is preceded by a GET and a comparison, and a difference fails only that write, as Drift.
- In a Terraform Environment a newer Deployment can wait for a merged step until the apply timeout.
