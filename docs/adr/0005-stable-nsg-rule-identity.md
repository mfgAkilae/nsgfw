# Keep NSG rule names and priorities stable across Commits

Status: accepted (2026-11-09, [Grilling: Priority assignment and rule packing](https://github.com/mfgAkilae/nsgfw/issues/13)). Amended on 2026-11-10 by [Prototype: Translation engine worked examples](https://github.com/mfgAkilae/nsgfw/issues/22): a new NSG rule of a Rule that already has NSG rules in the NSG and direction takes the free numbers next to them.

The Translation engine could derive every NSG rule's name and priority from the current Rule base alone: name from the Rule's position or name, priorities spread evenly from scratch on every Commit. That is simple and reproducible, but it changes far more in Azure than the edit did. Inserting one Rule near the top would shift the priority of every NSG rule below it, in every Managed NSG where it lands. Renaming or moving a Rule would rename its NSG rules. Flow logs identify an NSG rule only by its name ([Research: Other security layers and flow-log rule identity](https://github.com/mfgAkilae/nsgfw/issues/7)). In Terraform the rule name is `ForceNew`, so a rename means destroy and create ([Research: Terraform azurerm modeling of NSGs, associations and ASGs](https://github.com/mfgAkilae/nsgfw/issues/6)). And no Microsoft document says that a whole-NSG PUT applies its changes atomically ([Research: ARM and Resource Graph behaviour for NSG deployment](https://github.com/mfgAkilae/nsgfw/issues/4)), so every shifted priority adds a chance of a short wrong order while a deployment runs.

We decided that NSG rule identity is stable. An NSG rule's name is `nsgfw-r<Rule ID>-<in|out>-<hash>`. The Rule ID never changes and is never reused. The hash covers only the split key: protocol, and the kind and identity of the partition on each side (prefix list, service tag name, ASG chunk). Adding a prefix or a port therefore keeps the name. The Rule's name goes into the description. Priorities are assigned per Managed NSG and per direction against the NSG rules that the engine generated for the last committed Version, and that Version stores them. An NSG rule keeps its priority while its order relative to its neighbours holds. A new or moved NSG rule takes the middle of the gap between its neighbours. A new NSG rule of a Rule that already has NSG rules there first takes the free numbers right next to them, so one Rule's NSG rules stay together. When no number is free, the engine spreads out only the smallest window around that spot that gives enough room.

## Considered Options

- **Priorities as a pure function of the Rule base.** Rejected. It needs no stored state, but small edits produce large Previews, large Terraform diffs and more exposure to non-atomic writes.
- **Rebalance the whole direction when a gap runs out.** Rejected. It is simpler than a window, but in a full NSG (about 1,000 NSG rules per direction) it would happen often and change hundreds of priorities each time.
- **NSG rule names with a part index (`-1`, `-2`).** Rejected. Editing a Rule's service or Objects shifts the indexes, which renames NSG rules.
- **NSG rule names with the Rule's name.** Rejected. They read well in the portal, but every Rule rename breaks flow-log history and recreates the NSG rules, and the 65-character limit for NSG flow logs forces truncation.

## Consequences

- The engine stays a pure function, but its input includes the NSG rules of the last committed Version. Drift in Azure never feeds into priority assignment.
- A Version stores the NSG rules generated for it, or at least their names and priorities. This shapes the data model.
- The same Rule has different priorities in different Managed NSGs. The UI shows priorities per NSG and never derives them from the Rule number.
- The Preview groups changes that only move a priority, so a rebalance does not hide the real changes.
