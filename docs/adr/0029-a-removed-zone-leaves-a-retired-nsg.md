# A removed Zone leaves a Retired NSG

Status: accepted (2026-11-12, [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23)). First decided on 2026-11-09 in [Grilling: Zone onboarding and NSG lifecycle](https://github.com/mfgAkilae/nsgfw/issues/11).

A Zone can be removed from the Rule base while its subnet lives on. Taking the NSG off the subnet would leave the subnet without protection, and the landing-zone policy `Deny-Subnet-Without-Nsg` denies a subnet write that removes the NSG ([Azure Policy evaluation before deployment](../research/azure-policy-precheck.md)).

We decided:

- **Removing a Zone turns its Managed NSG into a Retired NSG.** The NSG stays associated with the subnet and holds only the Platform exceptions and the Deny-all rules, so the subnet stays protected and no Azure Policy is violated. If the subnet becomes a Zone again, the Retired NSG becomes its Managed NSG again. The tool never deletes or disassociates the NSG of an existing subnet.
- **Removing a Zone is a Rule base edit.** It goes through a Change set, Preview, Approval and Commit. A Zone that Rules still reference cannot be removed; the console shows where it is used and offers "remove from all Rules", which puts the Rule edits into the same Change set.
- **A Zone whose subnet disappears from Azure is flagged, not removed.** This covers a deleted subnet and a VNet resource move, which changes the subnet's resource ID. The Zone's identity is the subnet's resource ID, so a subnet re-created with the same name and ID is Drift, not a lost Zone. The flag stands outside Adopt: the latest Version keeps the old facts, and the tool skips the writes of that Zone, prepares no Adopt for it and changes nothing on its own. A person resolves it through a Change set that removes the Zone, and that Commit deletes the Zone's Managed NSG, which no longer has a subnet. A write that waits for a skipped write keeps waiting ([ADR 0025](0025-the-write-order-spans-environments.md)).
- **A subscription that leaves its Environment is the same kind of flag.** A person re-homes its Zones into an Environment with the same Deployment mode, where they keep their IDs, names and Rules, and their NSGs keep their names and resource groups. Otherwise the person removes the Zones, which retires the NSGs while the tool can still write to the subscription. Where it cannot, the Zones are only removed from the Rule base ("forget"): Azure stays unchanged, and the console warns that the NSGs still carry the marker tag.
- **A Retired NSG whose subnet is deleted is deletable.** The next Commit to its Environment deletes it, and the Preview shows the deletion.
- **A Revert or a Restore never removes and never re-creates a Zone on its own.** Where the older state lacks a Zone or holds one that is gone, the prepared Change set lists the Zone as a separate step that the Author must tick, with its effect stated: "subnet X falls to deny-all", or "Zone X is onboarded again and needs a Handover where other IaC manages its NSG". "Revert this Commit" on an onboarding Commit in the Deployment view shows the same banner. A Zone that is onboarded again warns that its former Role assignments and Approval level are gone.

## Considered Options

- **A Revert or a Restore that removes or re-creates Zones like any other edit.** Rejected. Reverting an onboarding Commit would turn the Zone's NSG into a Retired NSG with deny-all, and the legacy NSG rules would not return. The console offers "Revert this Commit" as the way out of a failed Deployment. A Restore that brings a Zone back would return it without its Approval level.

## Consequences

- Removing a Zone closes its subnet: it falls to deny-all. A Retired NSG has no Inherited defaults.
- A Retired NSG denies outbound, so a removed Zone is one of the cases in which Crossing flows order the writes ([ADR 0023](0023-writes-are-ordered-only-by-crossing-flows-with-a-settle-time.md)).
- The tool does not give a subnet back to its state before onboarding: the Retired NSG stays on the subnet, and the legacy NSG rules do not return.
