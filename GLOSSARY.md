# nsgfw

nsgfw manages Azure Network Security Groups the way a classic firewall console manages a firewall: administrators edit one central Rule base of Objects, Zones and ordered Rules, and the tool translates it into NSGs. Administrators never create or edit an NSG directly.

## Language

### Rule base

**Rule base**:
The central, ordered set of Rules together with the Objects and Zones they reference. It is the only source from which the tool derives Managed NSGs. There is exactly one Rule base per tool instance, and it spans all Environments.
_Avoid_: policy, ruleset, NSG configuration

**Rule**:
One ordered entry in the Rule base, with name, source, destination, service, action (allow or deny), enabled flag, comment, ticket reference, owner (an Entra user or group) and optional expiry date. Source, destination and service each hold one or more Objects or Zones and match any of them; there is no negation. Rules are evaluated top-down and the first match wins.
_Avoid_: NSG rule, security rule, policy

**Rule ID**:
The identifier a Rule gets when it is created. It never changes when the Rule is renamed, edited or moved, and it is never reused. The name of every NSG rule that the Translation engine generates for the Rule carries it.
_Avoid_: rule number (the Rule's current position in the Rule base)

**Folder**:
A named, contiguous run of Rules in the Rule base that administrators use to keep it in order. Folders are one level deep, their names are unique, a Rule belongs to at most one Folder, and a Rule may stand outside every Folder. A Folder may be empty. It carries only its name and has no effect on how a Rule is evaluated or translated, so the Folder of a Rule is part of its position, not of its content. Creating, renaming or removing a Folder and moving a Rule in or out at the same position are edits in a Change set that need no Approval and keep the Approvals already given. Moving a Folder moves each of its Rules.
_Avoid_: section, group (Address group and Service group hold Objects), tag

**Intra-zone default**:
The implicit allow for traffic that stays inside one Zone. It sits below every Rule and above the Deny-all rules, so a Rule can override it.
_Avoid_: intrazone rule

**Zone**:
A subnet that an administrator has onboarded so that Rules can use it as source or destination. Zones are the primary way to choose where traffic comes from and where it goes. Each Zone has its own name, unique in the Rule base, and exactly one Managed NSG. Its addresses are the subnet's prefixes and its Extra prefixes. A subnet that cannot carry a Managed NSG, such as GatewaySubnet, a subnet that forwards traffic for others, or a subnet whose NSG a service maintains, never becomes a Zone.
_Avoid_: segment, network, NSG

**Extra prefixes**:
Prefixes that an administrator adds to a Zone because its Managed NSG sees them although they are not in the subnet, such as the pod range of an AKS cluster. They count as part of the Zone, and several Zones can have the same ones. One may overlap the subnet of another Zone, such as a load balancer frontend there; the console warns, because Address objects that overlap it then cover both Zones.
_Avoid_: secondary prefixes, additional ranges

**Coverage**:
The Zones that a Zone, Address object or Address group stands for. A Zone covers itself, a VNet covers the Zones inside it, a single IP or CIDR range covers every Zone whose addresses it overlaps, within its VNet binding if it has one, an ASG object or External ASG object covers the Zones that hold its ASG members, and an Address group covers the union of its members. A service tag and a subnet that is not a Zone cover no Zone. The Translation engine places a Rule only on the Managed NSGs in the Coverage of its source and destination, so the NSGs together decide every flow the way one firewall would.
_Avoid_: scope (reserved for access), footprint

**Address object**:
A named single IP, CIDR range, Azure service tag, subnet that is not a Zone, VNet, ASG object, External ASG object, or Address group. The built-in Address object any stands for every IPv4 and IPv6 address.
_Avoid_: host, network object

**VNet binding**:
An optional limit on a single IP or CIDR range Address object: it then covers only Zones in the named VNets. It keeps an address apart from the same address in an unconnected VNet. Import sets one on a new object whose prefix also matches Zones in VNets that the onboarded Zone is not connected to: the Zone's VNet and its peered VNets.
_Avoid_: VNet scope (Scope is reserved for access), object scope

**ASG object**:
An Address object whose ASG members an administrator selects in the tool. The tool writes them into one Managed ASG per VNet that holds ASG members. Its membership changes only through Change sets.
_Avoid_: ASG (the Azure resource), application group, dynamic group

**External ASG object**:
An Address object that stands for exactly one Unmanaged ASG. Others own that ASG and its membership. The tool reads its ASG members but never changes them or the ASG. A network interface is a member when its IPv4 IP configuration is in the ASG, whatever its IPv6 IP configuration holds.
_Avoid_: ASG reference (an NSG rule's reference to an ASG)

**ASG member**:
A network interface or private endpoint that belongs to an ASG object, or any network interface, including scale-set and AKS node interfaces, that belongs to the Unmanaged ASG of an External ASG object. A network interface is a member as a whole, with all its IP addresses; an ASG reference stands for its IPv4 addresses, and its IPv6 addresses always reach NSGs through the IP fallback. A private endpoint member counts by its IP addresses and never sits in a Managed ASG.
_Avoid_: member (on its own: the entries of an Address group)

**Address group**:
A named group of Address objects and Zones.

**Service object**:
A named protocol plus a port or port range. The built-in Service object any matches every protocol and port.
_Avoid_: port object, application

**Service group**:
A named group of Service objects.

### Azure side

**Environment**:
A named part of the Azure estate in the tool's tenant, defined as one management group or a list of subscriptions, that the tool manages with its own naming pattern, Deployment mode and, in Terraform mode, Terraform repository. Each subscription belongs to at most one Environment. Environments partition Azure, not the Rule base.
_Avoid_: stage, landing zone, tenant

**Tool identity**:
The single Azure identity through which the tool reads and changes Azure in every Environment: a user-assigned managed identity when the tool runs in Azure, the service principal of the tool's app registration, with a certificate, when it runs on-premises. It holds Azure roles only. Sign-in and directory lookups belong to the tool's app registration.
_Avoid_: service account, app identity

**Managed NSG**:
An NSG that the tool created, or that an administrator adopted in place, tagged as managed by the tool. The tool modifies no other NSG.
_Avoid_: tool NSG, owned NSG

**Unmanaged NSG**:
Any NSG that is not a Managed NSG, including every NIC-level NSG. Shown read-only.

**Managed ASG**:
An ASG that the tool created for one ASG object in one VNet, or that an administrator adopted into an ASG object, tagged as managed by the tool. It holds only network interfaces, and only through their IPv4 addresses. Each Managed ASG belongs to exactly one ASG object.
_Avoid_: tool ASG

**Unmanaged ASG**:
Any ASG that is not a Managed ASG. The tool never changes it.

**Adopt in place**:
Making an existing Unmanaged NSG or Unmanaged ASG a Managed one without replacing it. It keeps its name, resource group and references and gets the marker tags.
_Avoid_: adopt (on its own: resolving Drift), take over

**Retired NSG**:
A Managed NSG whose Zone was removed. It stays associated with its subnet and holds only the Platform exceptions and the Deny-all rules, so the subnet stays protected. If the subnet becomes a Zone again, the Retired NSG becomes its Managed NSG again.
_Avoid_: orphaned NSG, released NSG

**NSG rule**:
A security rule inside an Azure NSG. The Translation engine generates NSG rules from Rules.
_Avoid_: Rule (reserved for Rule base entries)

**Augmented rule**:
An NSG rule that lists several prefixes, port ranges or ASGs in one field, used to save rule slots. Several service tags need several NSG rules.

**Deny-all rules**:
The explicit deny-all NSG rules, inbound and outbound, at the lowest custom priority of every Managed NSG. Where Azure forbids the outbound one, as in an Application Gateway v2 subnet, the Zone keeps outbound open. They turn Azure's permissive defaults into the implicit deny that firewall administrators expect.
_Avoid_: implicit deny, cleanup rule

**Egress posture**:
A Zone setting that says who decides outbound traffic to the Internal address space. Destination-enforced, the default, lets it out, so the inbound NSG rules of the destination Zone decide. Strict lets out only what a Rule allows, so both Zones decide.
_Avoid_: outbound mode, egress policy

**Internal address space**:
The instance-wide list of prefixes that count as internal, by default the private IPv4 ranges and the IPv6 unique local addresses (fc00::/7). A Zone with the destination-enforced Egress posture lets outbound traffic to it pass. It changes through a Change set.
_Avoid_: VirtualNetwork (the service tag), private space

**Inherited defaults**:
A Zone setting that keeps what the Azure default rules allowed before onboarding: inbound from `VirtualNetwork`, outbound to `VirtualNetwork` and outbound to `Internet`, each on its own. It applies on the Zone's own Managed NSG only, below the Intra-zone default and above the Deny-all rules, and is removed through a Change set.
_Avoid_: baseline rules, legacy defaults

**Platform exceptions**:
The fixed allow NSG rules above every Rule in each Managed NSG that let Azure platform traffic, such as Azure Load Balancer health probes, pass. No Rule can override them.
_Avoid_: required exceptions, infrastructure rules

**Azure default rules**:
The fixed rules that Azure adds to every NSG, such as AllowVnetInBound and AllowInternetOutBound. Shown read-only.

**Security layer**:
A set of rules outside the tool's control that also decides the traffic of a Zone: the Azure Virtual Network Manager security admin rules applied to the Zone's VNet, which Azure evaluates before any NSG, and the NIC-level NSGs of the network interfaces in the Zone, which traffic must pass in addition to the Managed NSG. Shown read-only. A Rule gets a warning where a Security layer blocks traffic that the Rule allows, or lets through traffic that the Rule denies.
_Avoid_: overlay, other layers

**Flow view**:
The list of flows that a Zone's Managed NSG or one of its Security layers allowed or denied, each with the Rule, default or layer rule that decided it, read from the VNet flow logs that the operator has enabled. Shown read-only.
_Avoid_: traffic log, flow log (the Azure resource)

**Hits**:
The number of flows that matched the NSG rules of a Rule, from the same data as the Flow view.
_Avoid_: hit count, policy hit

**Azure inventory**:
The facts about Azure that the Translation engine needs besides the Rule base: the address spaces and peerings of VNets, the prefixes of subnets, the IPs of network interfaces and private endpoints, the members of External ASG objects and the Environment of each subscription. Every Version records the Azure inventory it was translated against. A change in Azure reaches it only through Adopt.
_Avoid_: snapshot, cache, live state

**Translation engine**:
The part of the tool that converts the Rule base into Managed NSGs, NSG rules, ASGs and subnet associations.

### Change workflow

**Change set**:
A named set of pending edits to the Rule base, based on one Version and isolated from every other Change set until its Commit. An administrator can have several open Change sets.
_Avoid_: draft, candidate configuration, transaction, session

**Author**:
Every person who made at least one edit in a Change set, or the tool itself for a Change set it prepared. Under four-eyes, no Author may approve it.
_Avoid_: Change set owner, creator

**Change set owner**:
The one person who manages a Change set: adds co-editors, submits it for Approval and discards it. Always written in full, because "owner" alone is the Rule's owner.
_Avoid_: owner, assignee

**Rebase**:
Moving an open Change set onto the latest Version after another Commit. It conflicts when both changed the same Rule, Object or Zone, or renamed, moved or removed the same Folder, or when the other Commit changed the order between a Rule it placed and an overlapping Rule with the other action.
_Avoid_: merge, sync, update

**Affected Zones**:
The Zones a Change set touches for Approval. For every Rule it changes directly or through a changed Object or Zone, before and after the change, they are the Coverage of the destination, and from the Coverage of the source the Zones with a strict Egress posture, or all of them when the destination reaches outside Zones. To these come the Zones of added or removed ASG members and the Zones it onboards, removes or changes. A change of a Zone's Egress posture or Inherited defaults affects only that Zone, and a change of the Internal address space affects every destination-enforced Zone.
_Avoid_: blast radius, impacted NSGs

**Preview**:
The list of NSGs, NSG rules, subnet associations and ASGs that a Change set will create, change or delete.
_Avoid_: diff, plan

**Policy finding**:
A result of the policy pre-check for a write that a Change set or a Deployment plans: the Azure Policy assignment, its effect and its reason, and the Rule that caused it where the tool can tell. A deny finding blocks Submit and Commit unless it has a Pre-check waiver. Audit and modify findings are information only.
_Avoid_: policy hit (hits are flow-log counts), violation

**Pre-check waiver**:
An admin's decision, with a mandatory reason, that one deny Policy finding on one resource does not block one Change set. The tool then sends the write, and Azure decides.
_Avoid_: override (confusable with Overwrite), exemption (Azure Policy's own construct)

**Approval**:
Consent from an approver before a Commit. Each Affected Zone needs the Approval level that its Scope requires: none, approver (an Author may approve) or four-eyes (an approver who is not an Author). One approver's Approval counts for every Affected Zone in which that person holds the approver Role.

**Commit**:
Turning an approved Change set into the next Version and starting a Deployment to each affected Environment. The Version exists from the moment of the Commit, whether or not its Deployments succeed. A Commit runs at once, at a time the committer chooses, or right after an open Re-translation in the Environments it changes.
_Avoid_: push, apply, publish

**Deployment**:
The delivery of one Version to one Environment through that Environment's Deployment mode. A Commit starts one Deployment per affected Environment, and each Deployment has its own result. A Deployment starts from the Deployed state, so a newer Version's Deployment supersedes an unfinished Deployment to the same Environment and also delivers what that one did not. Its writes follow their dependencies and its Crossing flows, in any order otherwise. In a Terraform Environment a Deployment arrives as one pull request, or as one pull request per step of its write order. It is deployed only when Azure shows its target, not when a pull request merges.
_Avoid_: rollout, push

**Crossing flow**:
A flow between two Zones that a Deployment closes on one of the two Managed NSGs and opens on the other. The NSG that closes it is written first, and the other one a Settle time later; without Crossing flows the order of writes does not matter.
_Avoid_: Dominance gap (the first, coarser rule), Tighten phase, Loosen phase (the superseded phases of ADR 0009)

**Settle time**:
The wait between a write and the write that the order puts after it, counted from the moment Azure reports the first one done. Azure can report a write done before the network enforces it, so the wait keeps a closing change ahead of the opening one. Only writes ordered by a Crossing flow or by the ASG member steps wait; one setting for the whole instance.
_Avoid_: propagation delay, cool-down

**Deployed state**:
For each Azure resource the tool writes, the content the tool last wrote to it successfully. In a Terraform Environment, it is the content of the tool's merged Data contract that the tool has seen in Azure.
_Avoid_: actual state, current state

**Emergency Commit**:
A Commit that an admin makes without the required Approval, with a mandatory reason. It stays open until an approver approves it afterwards.
_Avoid_: break-glass, bypass

**Version**:
A stored, committed state of the Rule base that can be rolled back to, together with the Azure inventory it was translated against. It records what was decided; whether Azure matches it is the result of its Deployments.
_Avoid_: revision, snapshot

**Restore**:
A Change set that returns the Rule base to an earlier Version. It restores Rules, Objects, Zones, Folders and ASG members, not the Azure facts adopted since.
_Avoid_: rollback (the umbrella for Restore and Revert)

**Revert**:
A Change set that undoes the edits of one earlier Commit on top of the latest Version, Folder edits included.
_Avoid_: rollback, undo

**Re-translation**:
A Change set that the tool prepares when a new engine version translates the unchanged Rule base into different NSG rules. It holds no edits, only the new output, and its Affected Zones are the Zones whose resources it changes. While it is open, other Commits wait in the Environments where it changes something. An approver cannot reject it. An Emergency Commit, a disabled expired Rule and an automatic Adopt take it along, and its Affected Zones there need Approval afterwards.
_Avoid_: migration, redeploy

**Deployment mode**:
How a Commit reaches Azure: directly through the Azure Resource Manager API, or as a Data contract in a pull request to the Environment's Terraform repository, whose pipeline applies it.

**Data contract**:
The data the tool writes into a Terraform repository: one file per Terraform root module with the target content of every Managed NSG, subnet association, Managed ASG and ASG membership there. The tool owns these files and nothing else in the repository. The repository's own Terraform code reads them.
_Avoid_: template, generated code

**Import**:
Converting the NSG rules of an existing NSG into Rules when its subnet is onboarded, as edits in the onboarding Change set. Each NSG rule becomes one Rule that records where it came from. By default Import keeps the subnet's current behaviour, with Inherited defaults in place of the Azure default rules it relied on.
_Avoid_: migration, discovery

**Import note**:
A flag on an imported Rule where the NSG rule did not map cleanly, naming the source NSG, NSG rule, priority and direction. It is blocking (no submit until resolved), warning (behaviour changes or is approximated) or info (redundant or dropped), and it stays after the Commit until an admin acknowledges it.

**Drift**:
A difference between Azure and the Deployed state, caused outside the tool, for example in the portal, the CLI or other IaC. A resource that a Deployment has not reached yet is pending, not drifted. Drift is resolved by Adopt or Overwrite.

**Adopt**:
Resolving Drift, or a change of the Azure inventory such as a new subnet prefix, by changing the Rule base to match Azure, through a Change set that the tool prepares. The tool adopts on its own what only closes traffic, a deleted ASG member, a changed IP of an ASG member, and every change of an Object that an admin set to adopt automatically.
_Avoid_: accept, import, adopt in place (taking over a resource)

**Overwrite**:
Resolving Drift by writing the Deployed state back to Azure. It needs no Approval. An Environment can let the tool do it on its own for a lost subnet association or marker tag.
_Avoid_: revert (a Change set), repair

### Access

**Role**:
Viewer, editor, approver or admin, which an admin assigns in the tool to an Entra user, group, service principal or managed identity in one Scope. Each Role includes the Roles before it, and a Role in a Scope holds in every Scope below it. The Entra app role InstanceAdmin, maintained outside the tool, grants admin in the instance Scope.
_Avoid_: permission, app role (the Entra construct)

**Scope**:
The instance, an Environment, a subscription, a VNet or a Zone, used to limit a Role or an Approval requirement. The instance is the root Scope for Roles; Approval requirements are set from Environment down, below the instance default.
_Avoid_: Coverage (the Zones a Rule's source or destination stands for)

**Audit log**:
The append-only, tamper-evident record of who did what in the tool, when and why, and with what result. It is never edited or pruned. Successful writes to Azure are recorded in the Deployment history instead.
_Avoid_: activity log (Azure's own log), history

### Instance and operations

**Instance**:
One installation of nsgfw with its own database, one Rule base and one Tool identity. Its identity lives in the database: a database recovered from backup is the same Instance, an empty database is a new one. Managed NSGs and Managed ASGs carry the ID of their Instance.
_Avoid_: tenant, deployment (a Deployment delivers a Version)

**Handover**:
An admin's confirmation, with a checklist, that the tool takes over an NSG, an ASG or a subnet's NSG association that other IaC or another Instance has managed, when the subnet is onboarded. The other side must stop writing; if it does not, its writes show up as Drift.
_Avoid_: takeover, release

**Recovery mode**:
The restricted state an Instance enters when its database is older than Azure, for example after a recovery from backup, when it runs under another Tool identity than the one it recorded, or when an admin starts it. Only holders of the Entra app role InstanceAdmin can sign in, nothing reaches Azure through Commits or on the tool's own initiative, and an admin ends it with a reason.
_Avoid_: restore mode (a Restore is a Change set), safe mode, maintenance mode

**Tool path**:
A flow that the tool itself needs: from its own source prefixes to one of its dependencies, such as its database, its Key Vault, a DNS server or a proxy. A Change set that would close one needs the committer's confirmation with a reason.
_Avoid_: self path, management path
