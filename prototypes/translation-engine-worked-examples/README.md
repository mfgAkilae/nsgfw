# PROTOTYPE, throwaway: Translation engine worked examples

For [Prototype: Translation engine worked examples](https://github.com/mfgAkilae/nsgfw/issues/22). Never merged.

- `worked-examples.html`: open by double-click. 46 worked examples in 7 groups (Placement, Priorities and names, ASGs, Write order, Terraform, Import, Change workflow), each a sequence of Versions and Change sets, with the NSG rules per Managed NSG, the Preview, Affected Zones and the Deployment plan. Free-play buttons move or disable Rules, switch Egress postures, commit, and fail writes. "What to react to" lists the open questions.
- `node run.mjs [example-key] [--verbose]`: runs every example and checks it against the decision it encodes.
- `node build.mjs`: rebuilds `worked-examples.html` from `template.html`, `engine.js`, `examples.js` and `page.js`.
- `engine.js` is the pure part (no DOM): Coverage, placement and pruning, the split, normalization, names, stable priorities with window rebalance, limits, the Preview, Affected Zones, Crossing flows, member steps, the write plan, Import with the constraint merge, Rebase conflicts and the Data contract.

The write-order check that replaced ADR 0009 lives on the branch `prototype/translation-engine-order-check`.

Since 2026-11-10 `engine.js` also carries three decisions from [Task: Translation engine design doc with worked examples](https://github.com/mfgAkilae/nsgfw/issues/31): NSG rule names end in 8 hex characters (ADR 0005), a deny is left out only when no subnet that is not a Zone overlaps its destination (ADR 0016), and `AzureLoadBalancer` counts as the documented address 168.63.129.16 (ADR 0018). The tables in `docs/design/translation-engine.md` on main come from this state.
