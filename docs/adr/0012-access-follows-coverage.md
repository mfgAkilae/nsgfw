# Access follows Coverage

Status: accepted (2026-11-09, [Grilling: Access, roles and audit](https://github.com/mfgAkilae/nsgfw/issues/19))

The brief limits every Role to a Scope. In a firewall with one rule set per device, a Scope maps cleanly onto a set of rules. In nsgfw, one central Rule base spans all Environments ([ADR 0001](0001-central-rule-base-across-environments.md)), and a single Rule from Zone A to Zone B lands on the Managed NSGs of both ([ADR 0004](0004-place-rules-by-coverage.md)). A Rule therefore belongs to no single Scope, and neither do the Objects it uses. Approval already follows a Change set's Affected Zones ([ADR 0008](0008-approval-by-affected-zones.md)). The open question was what a Role's Scope limits when people edit and read such a Rule base.

We decided that Roles check rights where the effect is, in the same terms as Approval.

- **Editing is free, the Commit is gated.** Any editor, in any Scope, may draft any edit in a Change set: Rules, moves, Objects, ASG members, Zones. The Commit then needs every Affected Zone to be satisfied. At the Approval levels approver and four-eyes, an approver of that Zone must approve. At the level none, the committer must hold the editor Role in that Zone. A team can thus draft a Rule into another team's Zone, and that team's approver decides. A move is an edit of the moved Rule: every flow whose verdict a move changes matches the moved Rule, so its Zones lie in that Rule's Coverage.
- **Reading follows Coverage.** A person sees every Rule whose source or destination Coverage touches a Scope where they hold a Role, and the Azure side (NSGs, Drift, Deployments) of the Zones in their Scopes. The Translation engine places a Rule only on the Managed NSGs of its Coverage, so these Rules are exactly the ones that decide traffic in those Zones. Zone names and the Object library are visible to everyone, because a Rule must be able to reference them.
- **An open Change set widens the view.** While a Change set is open, its Authors and approvers see every Rule whose Coverage touches one of its Affected Zones, and its whole Preview. A Rule such as `VirtualNetwork → prod deny` covers only prod, yet it decides whether a new Rule `sandbox → prod allow` takes effect, so the Author of that new Rule must see it to place it.

The audit log is filtered the same way: each entry carries its Scopes, and a reader sees the entries that touch theirs.

## Considered Options

- **The editor Role in every Affected Zone.** Rejected. A Rule across two teams would need one person with rights on both sides, and a Rule with source any could only be written by an editor in the instance Scope.
- **The editor Role in at least one Affected Zone.** Rejected. It adds a check that the Commit gate already covers, and it still lets a team edit Rules into a Zone it does not own.
- **Everything readable for every Role.** Rejected. A viewer's Scope would then mean nothing, against the brief.
- **Strict Scope for Objects and Zones too.** Rejected. An editor could not pick another team's Zone as destination, so the request path through Approval would not work.

## Consequences

- At the level none, "an editor commits directly" means an editor of that Zone. A Commit by an Author or an admin still needs that Role in every Affected Zone at the level none.
- The read filter depends on Coverage, which changes with Azure facts such as subnet prefixes. Visibility can therefore change without any edit to the Rule base.
- Every API that lists Rules, Change sets, Versions, audit entries or Deployments must apply the same filter. The SIEM export is the one unfiltered view.
