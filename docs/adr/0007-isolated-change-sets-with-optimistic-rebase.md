# Isolated Change sets with optimistic Rebase

Status: accepted (2026-11-09, [Grilling: Change sets, concurrency and approval](https://github.com/mfgAkilae/nsgfw/issues/15)). Amended on 2026-11-09 by [Grilling: Review round on placement, egress posture and MVP shape](https://github.com/mfgAkilae/nsgfw/issues/27): a placement conflicts only against an overlapping Rule with the other action.

There is one central Rule base for all Environments ([ADR 0001](0001-central-rule-base-across-environments.md)), and up to 20 administrators edit it at the same time. The brief asks the tool to detect or prevent conflicting edits, and every Change set needs an Approval that depends on the Zones it touches. Firewall consoles solve this in different ways. Palo Alto shares one candidate configuration between all administrators. Check Point gives each administrator a session and locks every object that the session edits.

We decided that a Change set is isolated. It is based on one Version, it stores its edits as operations on Rule IDs, Object IDs and Zone IDs, and other administrators see its effect only after its Commit. An administrator can have several open Change sets, so an urgent fix can go out next to a large pending change. When a Commit creates a new Version, the tool rebases every open Change set onto it. A Rebase conflicts when both sides changed the same Rule, Object or Zone, even if they changed different fields. It also conflicts when a Change set inserted or moved a Rule and the latest Version changed the order between that Rule and an overlapping Rule with the other action, because only then can a verdict change. Each placement stores both neighbours by Rule ID, and an Author of the Change set confirms the position after such a conflict. Any other change next to a placed Rule rebases cleanly. The first form of this decision made every change to a neighbour a conflict; two administrators who insert at the same spot would then collide every time and lose their Approvals. A clean Rebase keeps the Approvals already given; a resolved conflict or any other edit resets them. Commits are serialized across the instance, and each one creates the next global Version.

## Considered Options

- **One shared candidate configuration.** Rejected. Approvers would see other administrators' edits mixed in, and committing only one's own edits needs dependency tracking, for example when one Rule uses an Object that someone else has just created.
- **Locks on Rules and Objects.** Rejected. Locks left by an abandoned Change set block others until an admin releases them, and Rule order cannot be locked in a useful way.
- **Merge per field.** Rejected. Merging one Change set's new source with another's new service produces a Rule that nobody reviewed as a whole.
- **Approval bound to the exact Preview.** Rejected. Every Commit by another administrator would reset the Approvals of all open Change sets. Instead, each Approval stores the Preview its approver saw, and the Commit dialog marks what changed since.

## Consequences

- The data model stores a Change set as its base Version plus operations, and records who made each edit, because four-eyes excludes every Author.
- A Change set's Affected Zones are recomputed after every Rebase. Zones that are new after a Rebase need their own Approval.
- The UI warns while editing when another open Change set changes the same Rule, Object or Zone.
