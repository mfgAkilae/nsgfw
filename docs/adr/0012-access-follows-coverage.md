# Access follows Coverage

Status: accepted (2026-11-09, [Grilling: Access, roles and audit](https://github.com/mfgAkilae/nsgfw/issues/19)). Amended on 2026-11-12 by [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23): an Open Change set widens its Authors' view only to the Rules that overlap their own edits, Rules that cover no Zone and the surfaces outside a person's Scopes each have their readers, and at the Approval level none a Change set of the tool waits for a committer.

The brief limits every Role to a Scope. In a firewall with one rule set per device, a Scope maps cleanly onto a set of rules. In nsgfw, one central Rule base spans all Environments ([ADR 0001](0001-central-rule-base-across-environments.md)), and a single Rule from Zone A to Zone B lands on the Managed NSGs of both ([ADR 0004](0004-place-rules-by-coverage.md)). A Rule therefore belongs to no single Scope, and neither do the Objects it uses. Approval already follows a Change set's Affected Zones ([ADR 0008](0008-approval-by-affected-zones.md)). The open question was what a Role's Scope limits when people edit and read such a Rule base.

We decided that Roles check rights where the effect is, in the same terms as Approval.

- **Editing is free, the Commit is gated.** Any editor, in any Scope, may draft any edit in a Change set: Rules, moves, Objects, ASG members, Zones. The Commit then needs every Affected Zone to be satisfied. At the Approval levels approver and four-eyes, an approver of that Zone must approve. At the level none, the committer must hold the editor Role in that Zone. A team can thus draft a Rule into another team's Zone, and that team's approver decides. A move is an edit of the moved Rule: every flow whose verdict a move changes matches the moved Rule, so its Zones lie in that Rule's Coverage.
- **A Change set without Affected Zones is checked in the instance Scope.** It needs the Approval of an approver in the instance Scope, at the instance default level. At the level none, its committer must hold the editor Role in the instance Scope. A Change set that holds only Folder edits stays exempt ([ADR 0021](0021-folders-are-layout-outside-approval-and-rule-conflicts.md)).
- **At the level none, a Change set of the tool waits for a person.** The tool holds no Role, so a Change set that it prepared does not commit on its own at the level none. It waits in the inbox until one person who holds the editor Role in every Affected Zone commits it; an admin with those Roles can do it. Two kinds of Commit stay automatic at every level, also at none: the expiry of an allow Rule, and the automatic Adopt cases that [ADR 0008](0008-approval-by-affected-zones.md) lists. Everything else the tool prepares waits for a person: an expired deny Rule, every other Adopt, a Re-translation and the Revert of a rejected Emergency Commit. At the levels approver and four-eyes, the tool commits its Change set once the Approval is complete.
- **Reading follows Coverage.** A person sees every Rule whose source or destination Coverage touches a Scope where they hold a Role, and the Azure side (NSGs, Drift, Deployments) of the Zones in their Scopes. The Translation engine places a Rule only on the Managed NSGs of its Coverage, so these Rules are exactly the ones that decide traffic in those Zones. A Rule that covers no Zone, such as a Rule from a service tag to a subnet that is not a Zone, is readable by every Role in the instance Scope and by its Authors. Zone names and the Object library are visible to everyone, because a Rule must be able to reference them.
- **An Open Change set widens the view only as far as placement needs.** While a Change set is Open, its Authors see, beyond their Scopes, only the Rules whose source, destination and service overlap a Rule they added or edited in it. These Rules carry the flag "through your Change set". They are what an Author needs to judge order and shadowing: a Rule such as `VirtualNetwork → prod deny` covers only prod, yet it decides whether a new Rule `sandbox → prod allow` takes effect, so the Author of that new Rule must see it to place it. The Preview of Zones outside an Author's Scopes is visible only once the Change set is Submitted. Approvers see the Preview of the Zones they approve.

The audit log is filtered the same way: each entry carries its Scopes, and a reader sees the entries that touch theirs.

Some surfaces show data that belongs to no single Rule. Who reads them:

| Surface | Who reads it |
|---|---|
| Onboarding candidates, the onboarding screen with the existing NSG, and the search over VMs, network interfaces and private endpoints | every editor, in every Scope, because any editor may draft an onboarding or pick ASG members |
| The Flows and Settings tabs of a Zone | Roles whose Scope holds the Zone |
| The Versions page | every Role, filtered like the Rule base |
| "Export JSON" of a Version | Roles in the instance Scope |
| "used in N Rules" and other counts | follow the read filter |
| Health | every Role in the instance Scope reads the detail; a person without one sees the problems of their own Scopes |

## Considered Options

- **The editor Role in every Affected Zone.** Rejected. A Rule across two teams would need one person with rights on both sides, and a Rule with source any could only be written by an editor in the instance Scope.
- **The editor Role in at least one Affected Zone.** Rejected. It adds a check that the Commit gate already covers, and it still lets a team edit Rules into a Zone it does not own.
- **Everything readable for every Role.** Rejected. A viewer's Scope would then mean nothing, against the brief.
- **Every Rule that touches an Affected Zone, and the whole Preview, for the Authors of an Open Change set,** as first decided. Rejected on 2026-11-12. An editor of one Zone could draft a Rule from any to any, never Submit it and read the whole Rule base.
- **Stating that the read filter binds viewers only.** Rejected on 2026-11-12. Every editor would then read the whole Rule base, and an editor's Scope would mean nothing for reading.
- **Strict Scope for Objects and Zones too.** Rejected. An editor could not pick another team's Zone as destination, so the request path through Approval would not work.

## Consequences

- At the level none, "an editor commits directly" means an editor of that Zone. A Commit by an Author or an admin still needs that Role in every Affected Zone at the level none: one committer holds it in all of them, and several people cannot each commit for their own Zones. The same holds for a Change set that the tool prepared.
- The read filter depends on Coverage, which changes with Azure facts such as subnet prefixes. Visibility can therefore change without any edit to the Rule base.
- Every API that lists Rules, Change sets, Versions, audit entries or Deployments must apply the same filter, and so must every count. The SIEM export is the one unfiltered view. The JSON export of a Version needs a Role in the instance Scope.
