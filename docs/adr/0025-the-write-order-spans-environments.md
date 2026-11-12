# The write order spans Environments

Status: accepted (2026-11-12, [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23)). Supersedes [ADR 0018](0018-write-order-from-dominance-gaps.md) together with [ADR 0023](0023-writes-are-ordered-only-by-crossing-flows-with-a-settle-time.md) and [ADR 0024](0024-asg-membership-is-written-as-atoms-in-member-steps.md). First decided on 2026-11-10 in [Grilling: Crossing flows between Environments](https://github.com/mfgAkilae/nsgfw/issues/40).

The two Zones of a flow can sit in different Environments, for example peered VNets in a platform Environment and in Production, and the member IPs of an ASG object can land in NSGs of another Environment. A Commit starts one Deployment per affected Environment, each with its own result, and a Terraform Environment writes through its own pull requests. A Crossing flow ([ADR 0023](0023-writes-are-ordered-only-by-crossing-flows-with-a-settle-time.md)) can therefore need an order between writes of two Deployments.

We decided:

- **Edges cross Environments, per write.** Crossing-flow edges and member-step boundaries ([ADR 0024](0024-asg-membership-is-written-as-atoms-in-member-steps.md)) order writes across Environments too. A Commit still starts one Deployment per affected Environment, each with its own result. A write that waits for a write of another Environment's Deployment waits the same way: for `Succeeded`, in a Terraform Environment until Azure shows that step's target, and then the Settle time.
- **Every NSG that differs counts.** The engine compares every pair of Zones whose NSGs differ between the Deployed state and the latest Version, in every Environment, also where the Commit changes nothing. Example: Version 1290 opens a flow on an NSG in Production, and that Deployment has not finished. Version 1291 closes the same flow on an NSG in Non-production and changes nothing in Production. Inside one Environment the newer Deployment would supersede the older one and plan both writes. Across Environments, only this rule puts the closing write in Non-production first.
- **An edge into another Environment points at the NSG, not at a Deployment.** The waiting write starts once the Deployed state of the other NSG no longer lets the flow cross, whichever Deployment wrote it, and the Settle time has passed. Every Commit plans again the edges of the unfinished Deployments in the other Environments. They keep their Version and their writes, and the Deployment view notes the new plan. Like a superseding Deployment, the new plan waits until the writes in flight on the paired NSGs have ended.
- **A write that waits for another Environment has no time limit.** When the write it waits for fails, or that Deployment stops before its first write over Drift, a Policy finding or a limit, the waiting write keeps waiting, as inside one Environment. There is no override. The ways out are a Retry in the other Environment, a Change set that fixes the cause, or a Revert of the Commit, which an admin can make an Emergency Commit. The next plan then drops the edge. A write that waits for a skipped write, because that Zone lost its subnet or its subscription left its Environment, also keeps waiting. It shows "skipped" as the state of the other side until a person resolves the flag.
- **A Deployment that waits only for other Environments releases its lease.** It takes the state "waiting for" the other Environment, which is not a failure, and frees its Environment write lease, so that automatic Overwrite and other jobs of the Environment can run. It resumes on its own once the other write is done, and then waits the full Settle time, as after a crash.

The algorithm is in [the translation engine design](../design/translation-engine.md#plan-the-write-order), section "Plan: the write order".

## Considered Options

- **Edges only inside one Environment,** with a Crossing flow between Environments failing validation. Rejected. The second Commit of the split could be committed only once the first Deployment is done, in a Terraform Environment perhaps days later. And with every differing NSG counted, a Commit that only closes traffic, an Emergency Commit too, would fail validation while another Environment has an unfinished Deployment that crosses it.
- **Ordering the Environments of a Commit as a whole.** Rejected. A write would wait for a whole Deployment instead of one write, pull requests included, and two flows in opposite directions between two Environments would form a cycle although the single writes have an order.
- **An edge bound to one write of one Deployment.** Rejected. Once a newer Commit supersedes that Deployment, the edge would need a rule for where it moves.
- **A time limit or an admin override for a write that waits for another Environment.** Rejected, as inside one Environment: both would open traffic that the Deployed state and the target deny.
- **Holding the lease while waiting for another Environment.** Rejected. A pull request in a Terraform Environment can stay open for days, and automatic Overwrite and every other job of the waiting Environment would stall with it.

## Consequences

- The plan of a Deployment reads the Deployed state of other Environments. The engine functions stay pure.
- A cycle across Environments makes a Change set not orderable, like a cycle inside one (ADR 0023).
- In a Terraform Environment a step that waits for a write in another Environment is its own pull request, opened once that write is done and the Settle time has passed.
- The Deployment view shows both ends of an edge between Environments. The waiting write names the NSG, Zone and Environment it waits for, that write's Version and state, and the flow. The other end says which write in which Environment waits for it. Everyone who sees the waiting write sees all of this, because the other Zone already appears in the Rule they can read. The link into the other Deployment view opens only with read access there.
- The Environment's status card shows "waiting for" the other Environment in amber. There is no alert of its own, because the failure in the other Environment raises one already.
- The expected wait in the Preview counts the edges into other Environments.
