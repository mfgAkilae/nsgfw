# Review of the complete design package

Review for [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23), run on 2026-11-12 against `main` at `07b7a824`.

## Verdict

The package holds up in its main lines. Placement by Coverage, the split into NSG rules, names, priorities and the Crossing-flow rule recompute correctly in the worked examples. The Azure limits, default rules, tag contents, ASG constraints and throttling numbers match the research and Microsoft Learn as fetched on 2026-11-12. The glossary and the design docs carry the current decisions, and the brief's requirements are covered.

The increment plan should not be cut yet. Three findings block it:

1. No document says what a Change set that the tool prepares does at the Approval level none, the setup choice of the first stage ([Q1](#q1)).
2. Read literally, ADR 0020 gives a new subnet or network interface no way into a Version, so it could not be onboarded or added to an object ([Q2](#q2)).
3. Azure refuses the Reader role assignment that ADR 0014 prescribes for an Environment defined by a management group ([Q3](#q3)).

Behind them sit 43 smaller decisions and a list of corrections that need no decision. The weakest part of the package is the trail of amended ADRs: 0004, 0009, 0010 and 0018 no longer say plainly what was decided.

The map owner decided all 46 points on the same day. [Outcome](#outcome) records what was adopted and what was decided differently from the recommendation below.

## Method

Seven independent reviewers, each with a fresh context and one lens, read the package without access to each other's work:

| Reviewer | Lens |
|---|---|
| A | Translation engine, placement, priorities, ASGs, write order; 12 worked examples recomputed by hand |
| B | Change sets, Rebase, Approval, Commit, Roles, read access, audit log, console |
| C | Architecture, Deployment in both modes, onboarding, Import, Drift, roles, Recovery mode, sizing |
| D | Coverage of the brief, superseded decisions, map accuracy, links, announced follow-ups |
| E1 | Azure facts on NSGs, ASGs, service tags, special subnets, ARM, Resource Graph, measured behaviour |
| E2 | Facts on Azure Policy, Terraform, identity, hosting, security layers, flow logs, licences |
| F | Quality of the glossary and of the 21 ADRs, one vocabulary across the package |

They read `GLOSSARY.md`, `docs/brief.md`, `docs/adr/`, `docs/design/`, the map, every ticket resolution and the research files on the `research/*` branches. E1 and E2 fetched the Microsoft, HashiCorp and GitHub pages named below on 2026-11-12. The main session checked the three blockers and a sample of the other findings against the text. Findings that two or three reviewers reported on their own are merged, and the reviewer IDs stand in brackets.

A finding is either a **decision** (Q, for the map owner) or a **correction** (K, no decision needed, written after the map owner agrees).

## Decisions for the map owner

### Blockers

<a id="q1"></a>
**Q1. Change sets the tool prepares at the Approval level none.** [B1]
[Grilling: Change sets, concurrency and approval](https://github.com/mfgAkilae/nsgfw/issues/15), point 27: the tool "submits it automatically ... Once its Approval is complete, the tool commits it." ADR 0012: "At the level none, the committer must hold the editor Role in that Zone." The tool holds no Role. Either the tool commits at once, and then an expired deny Rule is disabled, a new member of an External ASG object is adopted and a Re-translation goes out with no person involved, against point 25 ("Deny Rules are not disabled automatically, because that would open traffic"). Or the Change set waits, and no document says for whom. The small profile ships with the level none.
Recommended: at the level none a Change set of the tool does not commit on its own. What commits without Approval at every level stays automatic (expired allow Rules, the automatic Adopt cases). Everything else waits in the inbox for an editor of every Affected Zone to commit it.

<a id="q2"></a>
**Q2. How an Azure fact that no Rule uses yet enters a Version.** [C1]
ADR 0020: "A change in Azure enters only through Adopt", and an Adopt is prepared "when the observed Azure inventory changes the translation of the latest Version". A subnet created yesterday, a new network interface, a new VNet or a new peering changes no translation. No Adopt carries it into a Version, and "a Change set uses the Azure inventory of its base Version". The onboarding Change set for that subnet then translates against an inventory without its prefixes. A new peering never reaches a Version, so the write plan never trusts it.
Recommended: a Change set that first references a resource pins that resource's facts from the observed Azure inventory, as the Import snapshot does for NSGs. The Preview shows them, and a change of a pinned fact before the Commit resets the Approvals. Every Commit also takes over the observed facts that change no translation (peerings, unreferenced subnets and network interfaces).

<a id="q3"></a>
**Q3. The Reader role cannot be assigned at a management group.** [E2-1]
ADR 0014 gives `nsgfw Reader` the data action `Microsoft.OperationalInsights/workspaces/tables/data/read` and assigns it "in every Environment, at the Environment's scope". An Environment is "one management group or a list of subscriptions". Microsoft: "Custom roles with `DataActions` can't be assigned at the management group scope." ([custom roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/custom-roles), retrieved 2026-11-12). An assignment per subscription would break the rule that a new subscription under the management group joins the Environment on its own.
Recommended: a fourth role, `nsgfw Flow Reader`, with `workspaces/read`, `workspaces/query/read` and the data action, assigned on the flow-data workspace only and always with the `NTANetAnalytics` condition. `nsgfw Reader` loses the data action. Rejected: Reader per subscription.

### Translation engine and placement

**Q4. Deny Rules toward private endpoints whose subnet does not apply NSGs to them.** [A1]
ADR 0016 assumes "every Zone enforces inbound". Azure ignores the subnet NSG for private endpoint traffic while `privateEndpointNetworkPolicies` is `Disabled`, which is the default. Step 5 of the engine leaves a deny out on the source side when its destination "lies entirely inside Zones". "deny Zone web → Zone pe" is then enforced nowhere, and the evaluation function still answers "deny".
Recommended: in the "entirely inside Zones" test the engine treats such private endpoint IPs like a subnet that is not a Zone. Denies stay outbound and the source Zones become Affected Zones. The Azure inventory records `privateEndpointNetworkPolicies`. The warning from [Grilling: Zone onboarding and NSG lifecycle](https://github.com/mfgAkilae/nsgfw/issues/11), point 10, also covers `RouteTableEnabled` and the regions where Microsoft lists the feature as unavailable.

**Q5. Outbound deny NSG rules on an Application Gateway v2 Zone.** [E1-02, D2, A6]
Deny Rules land on both sides, and on this Zone "Rules land outbound as usual and nothing is left out". Microsoft: "Outbound NSG rules that deny any outbound connectivity must not be created." ([infrastructure configuration](https://learn.microsoft.com/en-us/azure/application-gateway/configuration-infrastructure), retrieved 2026-11-12). The check that should have settled this was dropped, and the conditional decision in [Grilling: Rule placement and default posture](https://github.com/mfgAkilae/nsgfw/issues/12), point 14, never resolved. One broad deny Rule can fail the NSG write of every such Zone.
Recommended: the engine leaves out every outbound deny NSG rule on such a Zone. The Preview says "outbound open, required by Azure". Where the destination of the deny is not entirely inside Zones, the Rule gets a warning that it is not enforced for this Zone. Two reviewers proposed this; one proposed a validation error instead, which would block every broad deny Rule once one such Zone exists.

**Q6. A cleanup Rule "deny any → any".** [A14]
It stays outbound on every Zone and overlaps every allow above it, so Step 5 leaves nothing out and every "any → Zone B" Rule lands outbound on every Zone again. That is the cost ADR 0016 removed.
Recommended: the Rule editor warns on a deny with source and destination any ("the Deny-all rules already do this"), and ADR 0016 names the consequence.

**Q7. A write plan that becomes not orderable after the Commit.** [A15]
A peering that disappears after the Commit adds tag cases and edges to the plan of an unfinished Deployment. If they close a cycle, validation is already over.
Recommended: the Deployment stops as "not orderable" with the flows named, with the same ways out as a failed write (a fixing Change set, a Revert).

### Azure facts

**Q8. Settle time for traffic to private endpoints.** [E1-03]
The lags behind the 10 s default were measured against VMs. The only private endpoint measurement (T8) took effect 9.9 to 11.8 s after the response. Since private endpoints are carried by IP, every change that concerns one is an NSG write, and no check measured how long an NSG PUT takes to bind private endpoint traffic. All runs were in North Europe.
Recommended: no new check before the increment plan, because the result changes a default and not the design. The nightly test gets a private endpoint target and a second region. Until it has measured, NSG writes of Zones that hold a private endpoint wait 30 s. ADR 0018 says "only one region was measured".

**Q9. Measured behaviour without a fallback.** [E1-04]
One whole-NSG PUT taking effect as a whole (T2), a rejected PUT applying nothing (T3) and the subnet swap as a whole (T7) have a nightly test and no fallback. An accepted PUT that ends `Failed` is neither documented nor measured. Azure accepting ASGs on the IPv4 IP configurations only was measured once (T10).
Recommended: ADR 0018 records T2, T3 and T7 as an accepted exception to "documentation before tests" and says what a failing nightly test means: a release note and a Health warning, and Change sets with Crossing-flow edges must be split until a fix ships. An NSG whose PUT ends `Failed` counts as Drift until a GET shows the old or the new content. T10 cases 1 and 4 join the nightly test, with the fallback that dual-stack members go fully through the IP fallback.

**Q10. Step-up sign-in.** [E2-3]
ADR 0013 rests the 15-minute rule on OIDC `max_age`. Entra does not list that parameter, and the `auth_time` claim is optional and off by default.
Recommended: the server checks freshness from the `auth_time` claim, which the `instance` module adds as an optional ID-token claim. The redirect uses the documented `prompt=login`. An integration test covers it. Without the claim the step-up is refused and Health flags it.

**Q11. Licence rule of ADR 0002.** [E2-5]
"Every runtime and build dependency must carry an OSI-approved permissive licence". The azurerm and azapi providers are MPL-2.0, Terraform from 1.6 is BUSL-1.1, and the console font is OFL-1.1.
Recommended: the rule covers the code shipped in the image and its npm build graph. ADR 0002 names the exceptions: MPL-2.0 Terraform providers, OFL-1.1 fonts, and the Terraform CLI as a tool the operator runs. `infra/` and the default HCL are also tested on OpenTofu, so no installation needs a BUSL tool.

**Q12. Reads for Azure Virtual Network Manager.** [E2-6]
The Reader holds the documented action for effective admin rules, but none for network group membership or security user rules. Which right exposes the Resource Graph rows is undocumented, and a missing right returns an empty result without an error. A new AlwaysAllow admin rule then raises no warning.
Recommended: add `Microsoft.Network/networkGroupMemberships/read`. Read admin rules per VNet through the documented REST call at the reconcile and at Submit. Drop the band for security user rules from the MVP. Show "cannot read" where a right is missing, as the Flow view does.

**Q13. Drift poll for scale sets and subnet associations.** [E1-01, E1-07, C8]
`resourcechanges` covers only the tables `resources`, `resourcecontainers` and `healthresources` ([Resource Graph changes](https://learn.microsoft.com/en-us/azure/governance/resource-graph/changes/resource-graph-changes), retrieved 2026-11-12). Scale-set and AKS node interfaces live in `ComputeResources`, so External ASG objects see member changes only at the 24-hour reconcile, and a scaled-in node's IP stays allowed in other VNets. Whether a removed subnet association shows up in `resourcechanges` is undocumented and untested.
Recommended: each Drift poll queries `ComputeResources` for External ASG objects with scale-set members and reads the NSG reference of every Zone's subnet from `resources`. Both get a nightly test.

**Q14. Minimum provider versions.** [E2-4, D14]
The stated minimum azurerm 3.39.0 rests on the private endpoint ASG association, which the tool no longer uses.
Recommended: the minimum is the lowest major the nightly test runs. azurerm 4.x and 5.x are tested, 3.x is "expected to work".

**Q15. GitHub auto-merge.** [E2-10]
GitHub offers auto-merge only when the repository setting is on and the pull request cannot merge at once. In a repository without required checks the request fails, and every pull request waits for a person, also the one that disables an expired allow Rule.
Recommended: Environment onboarding checks the repository setting. A pull request that is mergeable at once is merged by the tool.

### Change lifecycle and access

**Q16. The read filter and open Change sets.** [B2]
ADR 0012: any editor may draft any edit, and while a Change set is open its Authors see every Rule whose Coverage touches one of its Affected Zones. An editor of one Zone drafts "any → any", never submits it and reads the whole Rule base.
Recommended: the wider view shows only the Rules that overlap the Author's own edits, which placement needs, and the Preview of other Zones only once the Change set is submitted.

**Q17. Approvals after a clean Rebase.** [B3]
A clean Rebase keeps the Approvals. Change set A adds "group G → Zone db allow" and db's approver approves it. Another Commit widens G, which is no conflict. A rebases cleanly, the Approval stays and db opens to the wider G. ADR 0020 promises "What an approver saw is what the Deployment writes."
Recommended: a Rebase resets the Approval of an Affected Zone when the NSG rules the Change set writes for that Zone differ in content from the Preview that approver saw. Renumbering does not count.

**Q18. Change sets without Affected Zones, and Rules that cover no Zone.** [B5]
Such a Change set "uses the instance default, four-eyes", but no approver Role maps onto it. A Rule that covers no Zone is readable by nobody after the Commit.
Recommended: it needs an approver in the instance Scope, or at the level none a committer with the editor Role there. Rules that cover no Zone are readable by the Roles of the instance Scope and by their Authors.

**Q19. Rejected or conflicted Change sets of the tool.** [B6]
The tool is the Author, so nobody can act on a rejection or resolve a conflict. "Approval afterwards" of an Emergency Commit is defined for one approver only.
Recommended: such a Change set goes to the inbox of the admins of its Affected Zones with "take over" and "dismiss with reason" (audited, not prepared again for the same cause). Approval afterwards counts per Affected Zone like any Approval, and one rejection prepares the Revert.

**Q20. Revert and Restore across a Zone onboarding or removal.** [B7]
Reverting an onboarding Commit removes the Zone, its NSG becomes a Retired NSG with deny-all, and the legacy NSG rules do not return. The console offers "Revert this Commit" as the way out of a failed Deployment. A Restore that brings back a Zone returns it without its Approval level.
Recommended: Revert and Restore never remove or re-create a Zone on their own. They list the Zone as a separate step with its effect stated ("subnet X falls to deny-all"). A Zone that is onboarded again warns about the lost Role assignments and Approval level.

**Q21. When Roles and Approval levels count.** [B8]
An approver leaves the Role between the Approval and a scheduled Commit, or the level rises in between.
Recommended: everything is evaluated at the Commit. An Approval counts only where its giver holds the approver Role at that moment, and the person who scheduled the Commit must hold the Roles when it runs. Otherwise the Change set stays Approved without a schedule and names what is missing.

**Q22. One Change set lifecycle.** [B10]
The states Open, Submitted, Approved and Committed exist only in a ticket, and six tickets hold the permissions.
Recommended: a section "Change set lifecycle" in `console.md` with a table (state, action, who, result), with these answers: the Change set owner may commit; "admin" means admin in at least one Affected Zone; a new Affected Zone after a Rebase returns the Change set to Submitted; an approver can reject or withdraw until the Commit; a Submitted Change set with open conflicts cannot be approved.

**Q23. Commits of the tool that close a Tool path.** [B11]
Closing a Tool path needs the committer's confirmation with a reason. The tool's own Commits (Rule expiry, a closing Adopt) have no committer.
Recommended: a Commit of the tool never closes a Tool path. It holds that Rule back and alerts the admins and the Rule owner.

**Q24. Switching on automatic adoption.** [B12]
`console.md` asks for "the Approval of the Zones the Object covers", ADR 0006 says "An admin can set", ADR 0008 has no rule. For an External ASG object that is the source of an allow Rule, the destination Zone decides and is not asked.
Recommended: the switch is an Object edit. Its Affected Zones are those of every Rule that uses the Object, plus the Zones that hold members. No admin Role is needed.

**Q25. What a person reads outside their Scopes.** [B13]
Undecided for the onboarding candidates with their existing NSG, the search over VMs and network interfaces, the Flows and Settings tabs, the Versions page with "Export JSON", and the "used in N Rules" counts. Health has two answers.
Recommended: a table in ADR 0012. Inventory for onboarding and for picking members is readable by every editor. Flows and Settings follow the Zone's Scope. Export JSON needs a Role in the instance Scope. Counts follow the read filter. Health shows a person without a Role in the instance Scope the problems of their own Scopes.

**Q26. Console surfaces the first stage needs and nobody designed.** [B9]
`console.md` says "Not covered yet: Nothing". Missing: the Recovery mode view (differences, Move or Copy, ending it), Change set management (description and ticket reference, a second Change set, co-editors, hand-over, taking over a Change set of the tool), removing a Zone, the flags for a lost subnet or subscription, offboarding an Environment, the Terraform bootstrap, the instance time zone and the expiry lead time, and Folder conflicts beyond a name.
Recommended: one new prototype ticket, "Recovery mode and Change set management views", before the increment plan. The other surfaces are listed in `console.md` and designed in their increments.

**Q27. Audit log growth through principals without a Role.** [B14]
Every principal in the tenant can call the API, each denied call is audited, and the log is never pruned.
Recommended: a rate limit for principals without a Role, and one audit entry per principal and hour with a count.

**Q28. Expiry notices and the "expiry date in the past" check.** [B15]
A Rule owner without a Role cannot sign in, and Import leaves the owner empty. After the first expiry the Rule base holds Rules with a past date.
Recommended: the notice also goes to the editors of the Rule's destination Zones, the Rule editor warns on an empty owner, and the check applies only to enabled Rules that the Change set adds or edits.

### Deployment and operations

**Q29. Terraform mode: superseding a merged pull request, and pull request churn.** [C2]
A newer Version commits while a step is merged and waits for its apply. No document says whether the new Deployment waits for the observation. Every Commit closes the open pull request, so frequent automatic Adopts can keep any pull request from merging where a person must review it.
Recommended: a merged step is observed to its end before the next plan, with the apply timeout as the limit, and the stage watch keeps the Deployed state of a superseded step current. The tool's own Commits are batched per Terraform Environment (at most one every 30 minutes, closing ones at once).

**Q30. A second trigger for Recovery mode.** [C3]
The `nsgfw-version` tag shows only lost Versions that changed tagged NSG or ASG content. Folder edits, membership-only changes, failed Deployments, Role revocations and Approvals leave no tag. After such a restore, IDs repeat and a revoked Role holds again.
Recommended: the `instance` module passes a restore marker that forces Recovery mode at the first start. The worker starts no job before the Recovery check has passed, and a failed check keeps writes off.

**Q31. Recovery mode: time-driven work, Terraform Environments, Handover after Copy.** [C4, F5, D8]
Undecided for scheduled and queued Commits, Rules that expire in the mode, a running Deployment, an auto-merging pull request and bearer tokens. In a Terraform Environment there is no single-resource Overwrite. After a Copy the glossary's Handover has no Change set and no Author.
Recommended: a table in ADR 0019. Schedules and queued Commits are cleared with a notice. Expiry Commits run when the mode ends. Running Deployments stop after the writes in flight. Bearer tokens are refused except for `InstanceAdmin`. A Terraform Environment gets no pull request until every difference is adopted or confirmed. The Handover after a Copy is one confirmation per Environment by an `InstanceAdmin` in the Recovery mode view, audited.

**Q32. What a failed pre-check stops.** [C5]
One reading gates the Commit ("block the whole Commit", "the Change set stays Approved"). The other stops one Deployment after the Version exists. The exception for expiry Commits is in no document.
Recommended: two stages. A gate before the Version for Commits with a person or a schedule; a failure leaves the Change set Approved. A check at each Deployment start that stops only that Deployment. The tool's own closing Commits skip the gate, and an NSG with Drift fails on its own.

**Q33. Reader actions and the join actions.** [C7]
Handover evidence names the Activity Log caller, and the Reader lacks `Microsoft.Insights/eventtypes/values/read`. Five join actions "stay out until" a check that was closed without testing them.
Recommended: add the Activity Log read. The linked-access test (a subnet PUT with route table, NAT gateway and service endpoints; a network interface PUT with NSG, public IP and load-balancer pool) is the first integration test of the onboarding increment. Until then the tool maps `LinkedAuthorizationFailed` to the missing action.

**Q34. Tags that others set on a Managed NSG.** [C9]
ARM mode keeps them, [Grilling: Import and drift handling](https://github.com/mfgAkilae/nsgfw/issues/18) calls "another tag" Drift, and the default HCL sets the tags to the contract's map.
Recommended: only the marker tags belong to the tool, in both modes. Other tags are never Drift, and the default HCL merges them with the existing ones.

**Q35. A deleted Zone subnet, and a subscription that leaves its Environment.** [C11]
Both act on writes at once without an Adopt, the re-translation has no defined input for a Zone whose subnet is gone, and a write that waits for a skipped write has no state.
Recommended: ADR 0020 names both as flags outside Adopt. The Version keeps the old facts, the Zone is skipped and no Adopt is prepared for it. A write that waits for a skipped write keeps waiting and shows "skipped" for the other side.

**Q36. Another Instance's ASG.** [F4, D8]
ADR 0006: it "can be neither adopted nor referenced". ADR 0019 allows adopt in place with a Handover.
Recommended: it can be an External ASG object without a Handover, because the tool only reads it, and it can be adopted in place through a Handover. The sentence in ADR 0006 goes.

**Q37. Sizing.** [C15]
The Preview target counts changed Rules, but one Rule with any touches up to 20,000 NSGs. ARM reads have no budget. The hourly hits query has no stated behaviour on a timeout.
Recommended: the Preview target counts NSGs touched (2 s up to 200 NSGs, 60 s with progress above). The lease holder keeps a read budget per subscription and region. A hits timeout keeps the last value with its time.

### Brief and scope

**Q38. Departures from the brief that the map does not record.** [D1]
The Data contract instead of generated Terraform code from templates; Inherited defaults and the Intra-zone default; optional automatic Overwrite and automatic Adopt; adopted NSGs exempt from the naming pattern; External ASG objects.
Recommended: confirm all five as reopened brief decisions. Each was decided in a session with the map owner. The map note lists them, and ADR 0010 says that it changes the brief.

**Q39. The outbound warning and the catalog of required flows.** [D3]
The brief asks to warn that outbound traffic then needs explicit allow Rules. The decision (a list of required flows at onboarding, a badge on the Zone, a catalog of ready-made Rules) stands only in a ticket.
Recommended: the warning stays, shown when Preserve behaviour is off and when the Inherited default "outbound to Internet" is switched off. The catalog moves to Later.

**Q40. Lint checks in the Rule editor.** [D11]
`console.md` lists "allows everything", "opens a management port from the Internet", "lands on very many Managed NSGs", "writes nothing", and marks unused Objects. The brief puts rule analysis under Later, and no ticket decided these.
Recommended: "writes nothing", "allows everything" and unused Objects stay as warnings and are defined in the engine doc. The management-port check and "very many NSGs" move to Later.

**Q41. Research files on `main`.** [D10]
The measured facts and the list of deferred checks live only on `research/*` branches, while the destination says "kept as repo docs".
Recommended: merge the research Markdown files and this review into `main` under `docs/research/` and `docs/review/`, without scripts and raw results. The map links point at `main`.

**Q42. Two announced follow-ups.** [D14]
Who chooses Re-import or Keep snapshot (the glossary says an Author, a ticket said the admin), and whether the tool reads an AKS pod range from the cluster.
Recommended: an Author with the editor Role in the Zone chooses. The pod range stays a manual entry in the MVP.

### Shape of the documents

**Q43. ADR 0018 and ADR 0009.** [F2, F8, D5]
ADR 0018 is current but 4,200 words long, carries seven amendments in its status line and a file name that states the rejected rule. ADR 0009 is superseded and still the only home of decisions in force (a Version exists from its Commit, the Deployed state, superseding Deployments, pre-checks before the first write).
Recommended: three short ADRs supersede 0018 (writes ordered by Crossing flows with a Settle time; ASG membership as atoms in member steps; the write order spans Environments), each with the decision and the rejected options worth keeping, and a pointer to `translation-engine.md` for the algorithm. One more ADR takes the surviving decisions of 0009.

**Q44. Decisions without an ADR.** [F14]
Drift is resolved by Adopt or Overwrite, and Overwrite needs no Approval; a deny Policy finding blocks unless an admin grants a Pre-check waiver; an engine upgrade is a Re-translation that approvers cannot reject; a removed Zone leaves a Retired NSG.
Recommended: one short ADR each.

**Q45. Glossary entries that carry rules.** [F11]
36 of 72 entries exceed two sentences and state workflow rules, and the first of them have gone stale.
Recommended: cut every entry to what the thing is, and keep the rules in the ADR or design doc that already holds them.

**Q46. All corrections below.**
Recommended: write K1 to K31 as listed.

## Corrections that need no decision

### ADRs

- **K1. ADR 0010** [F3, C6, C12, D4, D5, E2-4, A13]: rewrite in place in current terms. One pull request per step of the write order, opened once Azure shows the previous target and the Settle time has passed. Today's reason against a single pull request: the Settle time and the observation between steps cannot happen inside one apply. Drop "Tighten", "Loosen", "held Loosen writes", the two-pull-request count and `azurerm_private_endpoint_application_security_group_association`. The same resource and the 3.39.0 reason go from `architecture.md` ("Deployment").
- **K2. ADR 0010 and the default HCL** [E2-2]: Terraform destroys a dependency before it updates the dependent resource unless `create_before_destroy` is set ([destroying.md](https://github.com/hashicorp/terraform/blob/v1.17.1/docs/destroying.md)). The default HCL sets `lifecycle { create_before_destroy = true }` on the Managed ASG, rule three for a replacement HCL says so, and the network interface association references the ASG resource.
- **K3. ADR 0004** [F6, D6]: new title "Place Rules by Coverage". Remove the void second paragraph, the rejected option "Deny Rules on both sides" and the stale consequences ("accepted as harmless", "is open").
- **K4. ADR 0001** [F7, D6]: "The instance is the root Scope for Roles; Environment is the coarsest Scope for Approval requirements."
- **K5. ADR 0008** [F7, D7, B5]: mark as amended by ADR 0021, 0006 and 0020, and list every Commit without Approval in one place (expiry of allow Rules, Emergency Commit, Folder-only Change sets, the automatic Adopt cases). Reword "needs the strictest level of all Environments" to each Zone's own level.
- **K6. ADR 0020** [C10, D7]: "commits on its own what only closes traffic" is narrower than decided. Point at the list in ADR 0008 and ADR 0006, and cite the tickets that decided it.
- **K7. ADR 0018, ADR 0020** [E1-08]: a peering counts as a tag fact only when it is Connected, allows virtual network access and covers the whole VNet. "Outside `Internet`" for a peered VNet is marked as an assumption.
- **K8. ADR 0015** [E2-8]: the reason against init containers no longer holds in a workload profiles environment. The reason that holds: a job binds the migrator identity to one run per upgrade. `architecture.md` names the environment type.
- **K9. ADR 0003, 0005, 0006, 0013, 0014, 0017** [F15, D15, E1-11, F8]: replace stale "is open" pointers with the result. ADR 0003: "adopts in place". ADR 0005: the 65 characters come from NSG flow logs. ADR 0006: "ticket 33, narrowed by T10" for "(T33, undocumented)". ADR 0014: no pointer to ADR 0009. ADR 0017: the pod range per Q42.
- **K10. ADR 0006, 0017** [F13]: "An admin can ..." where any editor may draft the edit becomes "an editor".
- **K11. ADR 0016** [F13, A11]: "every NSG rule that comes from a Rule belongs to exactly one Rule; posture NSG rules belong to a posture element".

### Translation engine

- **K12. Affected Zones, rule 1** [A3, B4]: "... or when an Object it uses changed (value, members, VNet binding, Service object or Service group), or a Zone it uses changed its prefixes or Extra prefixes." Add a worked example with a changed Service object. Incremental translation uses the same definition.
- **K13. Write order for a new association or a swap** [A2]: for a Zone whose NSG takes effect through a subnet write, the subnet write carries the Crossing-flow and member-step edges and starts the Settle time. Its Deployed content is the NSG associated so far, or "allows everything" without one. Retired NSGs enter the input of Evaluate and "pair of Zones". Add a worked example for a swap.
- **K14. Incremental translation** [A4]: define the dependency set (a subnet that appears or vanishes under a deny's destination, a changed member IP, a first or last private endpoint) and state that the incremental result must equal the full translation, with a test.
- **K15. Step 3 and Step 4** [A5]: the table gets an own-side column (the ASG reference plus the IPv6 addresses of the members in the Zone; on fallback Zones the IPs of the members in the Zone). "ASG chunk × IPv6 prefix list" is not emitted. Add a dual-stack ASG example.
- **K16. Worked examples** [A7]: each example names the Zones it onboards and any change to the example estate. Lines 164, 168 and 231 do not follow from the estate of 11 Zones as stated.
- **K17. Step 7 and Step 8** [A9]: specify the hash key and function, `*` as a partition kind, chunk order, the order of one Rule's NSG rules, the tie-break of the keep set and the whole-band fallback of the rebalance, or mark the hashes as illustrative.
- **K18. Step 9** [E1-05, E1-10]: add the limit "sources × destinations × port ranges ≤ 250,000 per NSG rule" for Zones that hold a private endpoint ([private endpoint overview](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview)). The default for several ASGs per side is "chunks of 10, per the limits page; fallback chunk size 1 as data". Ports have no published limit, so the engine does not count them.
- **K19. Stale text** [E1-11, A8, A6, D2, A10]: the subnet swap is measured (T7, 60 swaps); delete the open point and both sentences on the dropped Application Gateway check. Complete "Where the prototype differs" (IPv6 fallback, private endpoint Zones, NSG writes between member steps, a subnet without an NSG).
- **K20. ICMP over IPv6** [E1-09]: Microsoft's pages disagree on ICMPv6 in NSGs. Add a deferred check and a warning on an icmp Service object on a dual-stack Zone.

### Architecture

- **K21. Repository table** [D9, A11]: the evaluation function lives in `packages/engine`, not `packages/model`.
- **K22. Hosting** [E2-7, E2-11, E2-13]: "internal environment; the app's ingress is external, which there means reachable from the VNet only". Geo-redundant backup is the default in paired regions only, and a geo-restore returns the last replicated backup. Pulling the image by digest and starting the migrate job from Terraform join the nightly list with their fallbacks.
- **K23. Lost-update check** [E1-06, C13]: extend it to subnet and NSG writes.
- **K24. Error classes** [C14]: a 403 in the middle of a Deployment is permanent after one re-run of the permission check. A failed observation read shows "cannot read Azure", not "merged, not applied".
- **K25. Policy findings** [E2-9]: classify by `policyEffect`, never by `result`. Add the case to the nightly list.
- **K26. New sections** [D13, C11]: "Tests and CI" from [Grilling: Tech stack and repository architecture](https://github.com/mfgAkilae/nsgfw/issues/10), with the nightly test and its test subscription as a prerequisite; "Zone lifecycle and marker tags" from [Grilling: Zone onboarding and NSG lifecycle](https://github.com/mfgAkilae/nsgfw/issues/11) and [Grilling: Environment and tenancy model](https://github.com/mfgAkilae/nsgfw/issues/9). The Writer's delete reason covers adopted NSGs too.
- **K27. Flow view** [E2-12]: show the processing interval read from the flow log, and add one paragraph on what Traffic Analytics costs the operator.

### Glossary

- **K28. Deployed state** [F1]: "For each Azure resource the tool manages, the content the tool last confirmed as its own in Azure: what Azure stored after the tool's last successful write, or, for a resource adopted in place and not yet written, its content at adoption. In a Terraform Environment, the content of the merged Data contract that the tool has seen in Azure."
- **K29. Entries that disagree with the ADRs** [F10, A12, F5]: ASG object ("per VNet that holds network interface members", also Step 10), Managed ASG ("on their IPv4 IP configurations"), Adopt (pointer to the list), Commit (drop "approved"), Import ("or is dropped with an Import note"), Instance, Rebase, Handover (without actor and moment), Crossing flow and Deployment (name the member steps).
- **K30. Missing and unused terms** [F9, F12, F13]: add Object ("An Address object or a Service object. A Zone is not an Object."), a wider Rule base, Target, member step, IP fallback, ASG reference, Submit, Review, onboarding, ARM mode and Terraform mode, observed Azure inventory, Rule warning, small profile, Rule number. Explain or drop "re-home". Delete "Augmented rule". Drop the `_Avoid_` on "member" and move "Change set owner" out of Author's `_Avoid_`. Use "single IP" for "host", "fixed NSG rules" for "posture NSG rules" and "order lists" for the merge inputs.

### Map

- **K31. Map body** [D10, D12, F15]: point the eight `wayfinder/*` links at `main`. Remove "interim content" and "private endpoint writes" from "Not yet specified". Fix the gist of the operations ticket ("no writes"). Add "Later changed" to the gists of the tickets on placement, the ASG model, the worked examples, the write order under lag, private endpoint membership and the architecture proposal. Add the provider majors, the `flushConnection` re-decision and the new test subscription to the increment-plan paragraph.

## Checked and found sound

- **Engine.** Examples 1, 2, 3, 5 to 9 and 11 to 14 recompute from the stated steps when each example's Zones are used. Cycles can arise only among Crossing-flow edges. The member-step argument holds. Member steps, the Settle time, the IPv4-only atom and the edges across Environments read the same in ADR 0018, the engine doc and the glossary.
- **Azure facts, fetched on 2026-11-12.** 2,000 rules per NSG, 6,000 addresses, 100 ASGs per NSG, 10 per rule, 20 per IP configuration, 4,000 IP configurations per ASG; priorities 100 to 4096; the default rules; names up to 80 characters; one service tag per side; all members of an ASG in one VNet; the contents of `VirtualNetwork` and `AzureLoadBalancer`; one address family per NSG rule; subnets without NSG support; whole-NSG PUT; 1,000 writes per 5 minutes; Resource Graph quotas; `resourcechanges` kept 14 days. The numbers quoted from T1 to T10 match the measurements.
- **Platform facts, fetched on 2026-11-12.** `checkPolicyRestrictions` fields and permission; a policy deny as 403 `RequestDisallowedByPolicy`; the landing-zone policy for subnets without an NSG; inline against separate azurerm rules; `azapi_update_resource` as GET, merge and PUT; the network interface association writing IPv4 only (3.39.0 and 5.13.0 source); `import` with `for_each` from Terraform 1.7; MSAL Node with a user-assigned identity as federated credential; app roles in the `roles` claim; the condition format for table-level reads; admin rules before NSGs; the order of subnet and NIC-level NSGs; NSG flow logs retiring on 2027-09-30; the `NTANetAnalytics` fields; MIT, BSD or Apache licences across the npm stack; every AG Grid feature the console uses is in the Community edition.
- **Change lifecycle.** The amended Affected Zones rule reads the same in ADR 0008, ADR 0016, the glossary and the console. The audit-log guarantees agree across ADR 0015, ADR 0019 and the architecture. The step-up actions match in three documents.
- **Deployment.** No leftover of phases, interim content or the hold in the glossary, the architecture, ADR 0003 or ADR 0011. The three role tables match ADR 0014 action for action, and no document grants a private endpoint write. Worker crash, Drift between pre-check and write, a closed or unapplied pull request, a hand-edited Data contract file and a dead lease holder each have one answer. All 15 "Gaps for the map" in the architecture are closed.
- **Brief and trail.** Every UI requirement of the brief is in `console.md`. No relative link or anchor in the docs is broken, and every ticket title in a link matches its ticket. All 64 example names carry an 8-character hash. No document points at `CONTEXT.md`.

## Not covered

- The prototypes were read, not run. The hash values in the example tables are not reproduced.
- The Import mapping and the constraint merge beyond Example 15, and the Data contract section.
- Microsoft Graph and Exchange facts, PostgreSQL token lifetime, Key Vault reference refresh and prices.
- The SQL Managed Instance and Databricks pages were confirmed through search excerpts only.
- Three remarks rest on a reviewer's own knowledge and need a check when their increment starts: the references a network interface PUT re-sends (Q33), `Microsoft.Network/applicationGateways/read` for detecting Application Gateway v2 (Q33), and how azapi handles tags (Q34).
- How concurrent audit inserts from `api` and `worker` keep one chain is left to the data model.
- The German terms in `console.md` were not checked against the glossary.

## Outcome

The map owner decided all 46 points on 2026-11-12 in one grilling round, asked in rounds of four in plain language. The decided wording is in the resolution of [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23) and in the documents themselves.

**Adopted as recommended:** Q1 to Q39 and Q41 to Q46, with these notes.

- Q38: the map owner confirmed each of the five departures from the brief on its own.
- Q43 and Q44 produced eight ADRs: 0022 (a Version exists from its Commit), 0023 (writes ordered by Crossing flows), 0024 (membership atoms in member steps), 0025 (the write order spans Environments), 0026 (Drift by Adopt or Overwrite), 0027 (Pre-check waiver), 0028 (Re-translation), 0029 (Retired NSG). ADR 0018 and ADR 0009 are superseded.
- Q26 produced [Prototype: Recovery mode and Change set management views](https://github.com/mfgAkilae/nsgfw/issues/43).
- Q41: the research files now live in `docs/research/`.

**Decided differently:**

- Q40: all five Rule checks stay in the MVP, not three. Management ports are an instance setting with the default TCP 22, 3389, 5985 and 5986. "Very many Managed NSGs" is an instance setting with the default 100. This is one more addition beyond the brief.

**Deliberately left:** nothing. Every correction K1 to K31 was approved.

**Decided in two follow-up rounds,** on details that came up while the outcome was written:

- A deny Policy finding does not hold back a Commit of the tool that only closes traffic. The tool tries the write, and a write that Azure refuses fails on its own.
- An Emergency Commit always creates its Version. Stage 2 of the pre-checks stops only the Deployment of an Environment with a problem.
- A Change set of the tool whose Affected Zones have several Approval levels follows each Zone's own level. The tool commits on its own only when no Affected Zone is at the level none.
- The test subscription of the empirical checks still exists. The nightly test needs a new principal.
- Change set lifecycle: any editor who sees a Change set of the tool can take it over, and once it is rejected or conflicted only an admin of its Affected Zones; a dismissed one ends Discarded; a withdrawn Approval leaves the Change set Approved while another approver still covers the same Zones; an Emergency Commit goes directly from Open; "admin" for a Change set without Affected Zones means an admin of the instance Scope.
- The 30 s follow any write of a Zone that holds a private endpoint, NSG or subnet, that another write waits for.
- Batching in Terraform mode holds back the pull request, not the Version.
- A blocking Import note also stops a Commit that needs no Submit.
- The management-port warning counts port ranges and the service any when a management port lies inside, and a source group that contains any.
- The badge "outbound restricted" marks a Zone whose Inherited default "outbound to Internet" is off.
- The tool runs on the Consumption profile of a workload profiles environment.
- The tool merges a pull request itself only when the Environment setting for it is on, which is off by default.

**Restored, not newly decided:** an Adopt that only closes traffic stays automatic, and a Rule counts as changed when the Coverage of an Object it uses changes without an edit. Both were decided before the review and were missing from its first list.

**Checked after writing:** an independent reader compared the written outcome with the decisions and found 17 places where a decision was missing in one file or differed between two. All are fixed.

**Left to the increments,** because no design decision hangs on them: the value of the rate limit for principals without a Role; how the default HCL reads the tags that exist, and how azapi handles tags; what the Recovery check at startup covers, and how the tool knows that it has handled a restore marker; what "confirmed" means for a difference in a Terraform Environment in Recovery mode; how reads outside a Deployment count against the ARM read budget; how `*`, a service tag and a single prefix count in the 250,000 product; where the region data for private endpoint support lives; the hash function and key encoding of NSG rule names; which OpenTofu versions the tests run; whether Azure DevOps needs the same merge check as GitHub.
