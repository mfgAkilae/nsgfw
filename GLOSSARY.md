# nsgfw

nsgfw manages Azure Network Security Groups the way a classic firewall console manages a firewall: administrators edit one central Rule base of Objects, Zones and ordered Rules, and the tool translates it into NSGs. Administrators never create or edit an NSG directly.

## Language

A term that names a thing of the tool's model is capitalised wherever the docs use it (Rule, Zone, Change set, Deployed state). A term that names a process, a step or a mode is written in lower case in running text: onboarding, target, member step, membership atom, IP fallback, ASG reference, observed Azure inventory, pinned Azure facts, small profile. Its entry below starts with a capital only as a headword.

### Rule base

**Rule base**:
The ordered Rules with their Folders, all Objects and Zones with their settings, and the Internal address space. There is exactly one Rule base per Instance, and it spans all Environments.
_Avoid_: policy, ruleset, NSG configuration

**Rule**:
One ordered entry in the Rule base that allows or denies traffic from a source to a destination for a service, with an owner (an Entra user or group) and an optional expiry date. Source, destination and service each hold one or more Objects or Zones and match any of them; there is no negation. Rules are evaluated top-down and the first match wins.
_Avoid_: NSG rule, security rule, policy

**Rule ID**:
The identifier a Rule gets when it is created. It never changes and is never reused, unlike the Rule number.

**Rule number**:
The current position of a Rule in the Rule base, counted over all Rules. It changes when Rules above it are added, removed or moved.

**Rule warning**:
A warning attached to a Rule, or to an Object for the mark "unused Object", as opposed to a validation error. It says that the Rule's effect differs from what the Rule states or deserves a second look, for example that the Rule writes nothing, allows everything, is not enforced on one Zone, or is blocked or bypassed by a Security layer.

**Folder**:
A named, contiguous run of Rules, one level deep, that keeps the Rule base in order. It has no effect on evaluation or translation; the Folder of a Rule is part of the Rule's position, not of its content.
_Avoid_: section, group (Address group and Service group hold Objects), tag

**Intra-zone default**:
The implicit allow for traffic that stays inside one Zone. It sits below every Rule and above the Deny-all rules, so a Rule can override it.
_Avoid_: intrazone rule

**Zone**:
A subnet that an administrator has put under the tool's management so that Rules can use it as source or destination. It has exactly one Managed NSG, and its addresses are the subnet's prefixes and its Extra prefixes. Each Zone has its own name, unique in the Rule base.
_Avoid_: segment, network, NSG

**Onboarding**:
Making a subnet a Zone through a Change set: the subnet gets its Managed NSG, created new or adopted in place. Environment onboarding is the setup that adds an Environment to the Instance.

**Extra prefixes**:
Prefixes that an administrator adds to a Zone because its Managed NSG sees them although they are not in the subnet, such as the pod range of an AKS cluster. They count as part of the Zone.
_Avoid_: secondary prefixes, additional ranges

**Coverage**:
The Zones that a Zone, Address object or Address group stands for. A Zone covers itself, a VNet covers the Zones inside it, a single IP or CIDR range covers every Zone whose addresses it overlaps, within its VNet binding if it has one, an ASG object or External ASG object covers the Zones that hold its ASG members, and an Address group covers the union of its members; a service tag and a subnet that is not a Zone cover no Zone.
_Avoid_: scope (reserved for access), footprint

**Object**:
An Address object, a Service object or a Service group. A Zone is not an Object.

**Address object**:
A named single IP, CIDR range, Azure service tag, subnet that is not a Zone, VNet, ASG object, External ASG object, or Address group. The built-in Address object any stands for every IPv4 and IPv6 address.
_Avoid_: host, network object

**VNet binding**:
An optional limit on a single IP or CIDR range Address object: it then covers only Zones in the named VNets. It keeps an address apart from the same address in an unconnected VNet.
_Avoid_: VNet scope (Scope is reserved for access), object scope

**ASG object**:
An Address object whose ASG members an administrator selects in the tool. The tool writes its network interface members into one Managed ASG per VNet that holds network interface members.
_Avoid_: ASG (the Azure resource), application group, dynamic group

**External ASG object**:
An Address object that stands for exactly one Unmanaged ASG, which others own together with its membership. The tool reads its ASG members but never changes them or the ASG.
_Avoid_: ASG reference (an NSG rule's reference to an ASG)

**ASG member**:
A network interface or private endpoint that belongs to an ASG object, or any network interface, including scale-set and AKS node interfaces, that belongs to the Unmanaged ASG of an External ASG object. A network interface is a member as a whole, with all its IP addresses.

**Address group**:
A named group of Address objects and Zones.

**Service object**:
A named protocol plus a port or port range. The built-in Service object any matches every protocol and port.
_Avoid_: port object, application

**Service group**:
A named group of Service objects.

### Azure side

**Environment**:
A named part of the Azure estate in the tool's tenant, defined as one management group or a list of subscriptions, that the tool manages with its own naming pattern, Deployment mode and, in Terraform mode, Terraform repository. Environments partition Azure, not the Rule base.
_Avoid_: stage, landing zone, tenant

**Tool identity**:
The single Azure identity through which the tool reads and changes Azure in every Environment. It holds Azure roles only; sign-in and directory lookups belong to the tool's app registration.
_Avoid_: service account, app identity

**Managed NSG**:
An NSG that the tool created, or that an administrator adopted in place, tagged as managed by the tool. The tool modifies no other NSG.
_Avoid_: tool NSG, owned NSG

**Unmanaged NSG**:
Any NSG that is not a Managed NSG, including every NIC-level NSG. Shown read-only.

**Managed ASG**:
An ASG that the tool created for one ASG object in one VNet, or that an administrator adopted into an ASG object, tagged as managed by the tool. It holds only network interfaces, and only on their IPv4 IP configurations.
_Avoid_: tool ASG

**Unmanaged ASG**:
Any ASG that is not a Managed ASG. The tool never changes it.

**Adopt in place**:
Making an existing Unmanaged NSG or Unmanaged ASG a Managed one without replacing it. It keeps its name, resource group and references and gets the marker tags.
_Avoid_: adopt (on its own: resolving Drift), take over

**Marker tags**:
The tags that the tool sets on a Managed NSG or Managed ASG to mark it as its own: `nsgfw-managed-by`, `nsgfw-version` and, on a Managed NSG, `nsgfw-zone`. They are the only tags on these resources that belong to the tool.
_Avoid_: ownership tags, labels

**Retired NSG**:
A Managed NSG whose Zone was removed. It stays associated with its subnet and holds only the Platform exceptions and the Deny-all rules, so the subnet stays protected.
_Avoid_: orphaned NSG, released NSG

**NSG rule**:
A security rule inside an Azure NSG. The Translation engine generates NSG rules from Rules.
_Avoid_: Rule (reserved for Rule base entries)

**ASG reference**:
An NSG rule's reference to an ASG as its source or destination, in place of IP addresses.

**IP fallback**:
Writing the IP addresses of ASG members into an NSG rule where an ASG reference cannot stand for them, such as on an NSG in another VNet.

**Deny-all rules**:
The explicit deny-all NSG rules, inbound and outbound, at the lowest custom priority of a Managed NSG; an Application Gateway v2 Zone has no outbound one, because Azure forbids it. They turn Azure's permissive defaults into the implicit deny that firewall administrators expect.
_Avoid_: implicit deny, cleanup rule

**Egress posture**:
A Zone setting that says who decides outbound traffic to the Internal address space. Destination-enforced, the default, lets it out, so the inbound NSG rules of the destination Zone decide; strict lets out only what a Rule allows, so both Zones decide.
_Avoid_: outbound mode, egress policy

**Internal address space**:
The instance-wide list of prefixes that count as internal, by default the private IPv4 ranges and the IPv6 unique local addresses (fc00::/7).
_Avoid_: VirtualNetwork (the service tag), private space

**Inherited defaults**:
A Zone setting that keeps what the Azure default rules allowed before onboarding: inbound from `VirtualNetwork`, outbound to `VirtualNetwork` and outbound to `Internet`, each on its own. It applies on the Zone's own Managed NSG only, below the Intra-zone default and above the Deny-all rules.
_Avoid_: baseline rules, legacy defaults

**Platform exceptions**:
The fixed allow NSG rules above every Rule in each Managed NSG that let Azure platform traffic, such as Azure Load Balancer health probes, pass. No Rule can override them.
_Avoid_: required exceptions, infrastructure rules

**Azure default rules**:
The fixed rules that Azure adds to every NSG, such as AllowVnetInBound and AllowInternetOutBound. Shown read-only.

**Security layer**:
A set of rules outside the tool's control that also decides the traffic of a Zone: the Azure Virtual Network Manager security admin rules applied to the Zone's VNet, which Azure evaluates before any NSG, and the NIC-level NSGs of the network interfaces in the Zone, which traffic must pass in addition to the Managed NSG. Shown read-only.
_Avoid_: overlay, other layers

**Flow view**:
The list of flows that a Zone's Managed NSG or one of its Security layers allowed or denied, each with the Rule, default or layer rule that decided it, read from the VNet flow logs that the operator has enabled. Shown read-only.
_Avoid_: traffic log, flow log (the Azure resource)

**Hits**:
The number of flows that matched the NSG rules of a Rule, from the same data as the Flow view.
_Avoid_: hit count, policy hit

**Azure inventory**:
The facts about Azure that the Translation engine needs besides the Rule base, such as the address spaces and peerings of VNets, the prefixes of subnets, the IPs of network interfaces and private endpoints and the members of External ASG objects. Every Version records the Azure inventory it was translated against; the existing NSGs that Import reads are not part of it.
_Avoid_: snapshot, cache, live state

**Observed Azure inventory**:
The same kind of facts as the Azure inventory, as the tool last read them from Azure, kept per Environment. Unlike the Azure inventory, it belongs to no Version.

**Pinned Azure facts**:
The facts about an Azure resource that a Change set takes from the observed Azure inventory when it first references a resource that the Azure inventory of its base Version does not hold. At the Commit they become part of the new Version's Azure inventory.

**Translation engine**:
The part of the tool that converts the Rule base into Managed NSGs, NSG rules, ASGs and subnet associations.

### Change workflow

**Change set**:
A set of pending edits to the Rule base, based on one Version and isolated from every other Change set until its Commit. It carries an ID, a mandatory description and an optional ticket reference, and it is Open, Submitted, Approved, Committed or Discarded.
_Avoid_: draft, candidate configuration, transaction, session

**Author**:
Every person who made at least one edit in a Change set or took over a Change set that the tool prepared, and the tool itself for a Change set it prepared. Not the same as the Change set owner, who manages the Change set.
_Avoid_: creator

**Change set owner**:
The one person who manages a Change set: adds co-editors, submits it for Approval and discards it. Always written in full, because "owner" alone is the Rule's owner.
_Avoid_: owner, assignee

**Co-editor**:
A person whom the Change set owner added to a Change set, who may edit it and commit it once it is Approved. A Change set owner who hands the Change set over becomes a co-editor.
_Avoid_: collaborator, contributor

**Current Change set**:
The one Change set of a person that receives their edits. A person may have several open Change sets and switches which one is current.
_Avoid_: active Change set, working copy

**Rebase**:
Moving a Change set that is not yet committed onto the latest Version after another Commit.
_Avoid_: merge, sync, update

**Affected Zones**:
The Zones that a Change set touches, by which its Approval is decided. They follow from the Coverage of every Rule it changes, directly or through a changed Object or Zone, and from the Zones whose ASG members or settings it changes or that it onboards or removes; [ADR 0008](docs/adr/0008-approval-by-affected-zones.md) holds the exact rule.
_Avoid_: blast radius, impacted NSGs

**Preview**:
The list of NSGs, NSG rules, subnet associations and ASGs that a Change set will create, change or delete.
_Avoid_: diff, plan

**Policy finding**:
A result of the policy pre-check for a write that a Change set or a Deployment plans: the Azure Policy assignment, its effect and its reason, and the Rule that caused it where the tool can tell.
_Avoid_: policy hit (hits are flow-log counts), violation

**Pre-check waiver**:
An admin's decision, with a mandatory reason, that one deny Policy finding on one resource does not block one Change set. The tool then sends the write, and Azure decides.
_Avoid_: override (confusable with Overwrite), exemption (Azure Policy's own construct)

**Review**:
The view of a whole Change set, with its edits, Preview, write order, Affected Zones and Policy findings, that its Authors check before Submit and on which its approvers decide.

**Submit**:
Handing a Change set over for Approval, which moves it from Open to Submitted.

**Approval**:
Consent that an approver gives to a Change set; it counts for every Affected Zone in which that person holds the approver Role. The Approval level, set per Scope, says what a Zone needs: none, approver (an Author may approve) or four-eyes (an approver who is not an Author).

**Commit**:
Turning a Change set into the next Version and starting a Deployment to each affected Environment. The Version exists from the moment of the Commit, whether or not its Deployments succeed.
_Avoid_: push, apply, publish

**Deployment**:
The delivery of one Version to one Environment through that Environment's Deployment mode, with its own result. It counts as deployed only when Azure shows its target.
_Avoid_: rollout, push

**Target**:
The content a Deployment aims at for each resource: the translation of the latest Version.

**Deployment history**:
The record of every Deployment per Environment, also an Overwrite or a catch-up that has no new Version, with each of its writes. It holds what the audit log leaves out, such as each successful write.
_Avoid_: deployment log, job history

**Crossing flow**:
A flow between two Zones, in one Environment or in two, that closes on one of the two Managed NSGs and opens on the other between the Deployed state and the latest Version. Besides the dependencies between resources, only Crossing flows and member steps order the writes of a Deployment.
_Avoid_: Dominance gap (the first, coarser rule), Tighten phase, Loosen phase (the superseded phases of ADR 0009)

**Membership atom**:
One network interface joining or leaving one Managed ASG: the unit in which the tool plans and writes ASG membership.

**Member step**:
One of the two steps in which a Deployment writes membership atoms: the first holds the atoms that only close traffic, the last holds all others, and the NSG writes they can affect come in between.

**Settle time**:
The wait between a write and the write that the order puts after it, counted from the moment Azure reports the first one done. Azure can report a write done before the network enforces it, so the wait keeps a closing change ahead of the opening one.
_Avoid_: propagation delay, cool-down

**Deployed state**:
For each Azure resource the tool manages, the content the tool last confirmed as its own in Azure: what Azure stored after the tool's last successful write, or, for a resource adopted in place and not yet written, its content at adoption. In a Terraform Environment, the content of the merged Data contract that the tool has seen in Azure.
_Avoid_: actual state, current state

**Emergency Commit**:
A Commit that an admin makes without the required Approval, with a mandatory reason. The Approval follows afterwards.
_Avoid_: break-glass, bypass

**Version**:
A stored, committed state of the Rule base that can be rolled back to, together with the Azure inventory it was translated against. It records what was decided; whether Azure matches it is the result of its Deployments.
_Avoid_: revision, snapshot

**Restore**:
A Change set that returns the Rule base to an earlier Version; it removes or re-creates a Zone only as a separate step that its Author ticks. It does not return the Azure facts adopted since.
_Avoid_: rollback (the umbrella for Restore and Revert)

**Revert**:
A Change set that undoes the edits of one earlier Commit on top of the latest Version, Folder edits included; it undoes the onboarding or removal of a Zone only as a separate step that its Author ticks.
_Avoid_: rollback, undo

**Re-translation**:
A Change set without edits that the tool prepares when a new engine version translates the unchanged Rule base into different NSG rules.
_Avoid_: migration, redeploy

**Deployment mode**:
How the Deployments of an Environment reach Azure: ARM mode or Terraform mode.

**ARM mode**:
The Deployment mode in which the tool writes to Azure directly through the Azure Resource Manager API.

**Terraform mode**:
The Deployment mode in which the tool writes a Data contract in a pull request to the Environment's Terraform repository, whose pipeline applies it.

**Data contract**:
The data files the tool writes into a Terraform repository, which the repository's own Terraform code reads: one file per Terraform root module with the target of every Managed NSG, subnet association, Managed ASG and ASG membership there. The tool owns these files and nothing else in the repository.
_Avoid_: template, generated code

**Import**:
Converting the NSG rules of an existing NSG into Rules when its subnet is onboarded, as edits in the onboarding Change set. Each NSG rule becomes one Rule that records where it came from, or is dropped with an Import note.
_Avoid_: migration, discovery

**Import snapshot**:
The NSG rules of an existing NSG as Import read them into an onboarding Change set. It is not part of the Azure inventory.
_Avoid_: legacy copy

**Import note**:
A flag that Import sets where an NSG rule did not map cleanly, naming the source NSG, NSG rule, priority and direction. It is blocking (no Submit and no Commit until resolved), warning (behaviour changes or is approximated) or info (redundant or dropped).

**Drift**:
A difference between Azure and the Deployed state, caused outside the tool, for example in the portal, the CLI or other IaC. A resource that a Deployment has not reached yet is pending, not drifted, and a tag that others set on a Managed NSG or Managed ASG is not Drift.

**Adopt**:
Resolving Drift, or a change of Azure facts that would change the translation, such as a new subnet prefix, by changing the Rule base or the Azure inventory of the next Version to match Azure, through a Change set that the tool prepares. [ADR 0008](docs/adr/0008-approval-by-affected-zones.md) lists the Adopts that the tool commits on its own.
_Avoid_: accept, import, adopt in place (taking over a resource)

**Overwrite**:
Resolving Drift by writing the Deployed state back to Azure, without a Change set and without Approval. Tags that others set on the resource stay.
_Avoid_: revert (a Change set), repair

### Access

**Role**:
Viewer, editor, approver or admin, which an admin assigns in the tool to an Entra principal in one Scope. Each Role includes the Roles before it, and a Role in a Scope holds in every Scope below it. The Entra app role InstanceAdmin, maintained outside the tool, grants admin in the instance Scope.
_Avoid_: permission, app role (the Entra construct)

**Scope**:
The instance, an Environment, a subscription, a VNet or a Zone, used to limit a Role or an Approval requirement.
_Avoid_: Coverage (the Zones a Rule's source or destination stands for)

**Audit log**:
The append-only, tamper-evident record of who did what in the tool, when and why, and with what result. Successful writes to Azure are recorded in the Deployment history instead.
_Avoid_: activity log (Azure's own log), history

### Instance and operations

**Instance**:
One Rule base with its database, identified by the Instance ID stored there and run by one installation at a time.
_Avoid_: tenant, deployment (a Deployment delivers a Version)

**Handover**:
The confirmation, with a checklist, that the tool takes over an NSG, an ASG or a subnet's NSG association that other IaC or another Instance has managed, and that the other side has stopped writing.
_Avoid_: takeover, release

**Recovery mode**:
The restricted state that an Instance enters when its database may not match Azure, for example after a recovery from backup or under another Tool identity than the one it recorded, or when an admin starts it. In it, only holders of the Entra app role InstanceAdmin can sign in, and nothing reaches Azure through Commits or on the tool's own initiative.
_Avoid_: restore mode (a Restore is a Change set), safe mode, maintenance mode

**Tool path**:
A flow that the tool itself needs: from its own source prefixes to one of its dependencies, such as its database, its Key Vault, a DNS server or a proxy.
_Avoid_: self path, management path

**Small profile**:
The first stage of the MVP that ships, with a reduced feature set such as one Environment in ARM mode. Later MVP stages add the rest.
