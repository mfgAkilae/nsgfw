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

**Intra-zone default**:
The implicit allow for traffic that stays inside one Zone. It sits below every Rule and above the Deny-all rules, so a Rule can override it.
_Avoid_: intrazone rule

**Zone**:
A subnet that an administrator has onboarded so that Rules can use it as source or destination. Zones are the primary way to choose where traffic comes from and where it goes. Each Zone has its own name, unique in the Rule base, and exactly one Managed NSG. A subnet that cannot carry a Managed NSG, such as GatewaySubnet, never becomes a Zone.
_Avoid_: segment, network, NSG

**Coverage**:
The Zones that a Zone, Address object or Address group stands for. A Zone covers itself, a VNet covers the Zones inside it, a single IP or CIDR range covers every Zone whose prefixes it overlaps, an ASG object or External ASG object covers the Zones that hold its ASG members, and an Address group covers the union of its members. A service tag and a subnet that is not a Zone cover no Zone. The Translation engine places a Rule only on the Managed NSGs in the Coverage of its source and destination, so the NSGs together decide every flow the way one firewall would.
_Avoid_: scope (reserved for access), footprint

**Address object**:
A named single IP, CIDR range, Azure service tag, subnet that is not a Zone, VNet, ASG object, External ASG object, or Address group. The built-in Address object any stands for every IPv4 and IPv6 address.
_Avoid_: host, network object

**ASG object**:
An Address object whose ASG members an administrator selects in the tool. The tool writes them into one Managed ASG per VNet that holds ASG members. Its membership changes only through Change sets.
_Avoid_: ASG (the Azure resource), application group, dynamic group

**External ASG object**:
An Address object that stands for exactly one Unmanaged ASG. Others own that ASG and its membership. The tool reads its ASG members but never changes them or the ASG.
_Avoid_: ASG reference (an NSG rule's reference to an ASG)

**ASG member**:
A network interface or private endpoint that belongs to an ASG object, or any network interface, including scale-set and AKS node interfaces, that belongs to the Unmanaged ASG of an External ASG object.
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
The single Azure identity through which the tool reads and changes Azure in every Environment: a managed identity when the tool runs in Azure, a service principal with a certificate when it runs on-premises.
_Avoid_: service account, app identity

**Managed NSG**:
An NSG that the tool created, or that an administrator explicitly imported, tagged as managed by the tool. The tool modifies no other NSG.
_Avoid_: tool NSG, owned NSG

**Unmanaged NSG**:
Any NSG that is not a Managed NSG, including every NIC-level NSG. Shown read-only.

**Managed ASG**:
An ASG that the tool created for one ASG object in one VNet, or that an administrator adopted into an ASG object, tagged as managed by the tool. Each Managed ASG belongs to exactly one ASG object.
_Avoid_: tool ASG

**Unmanaged ASG**:
Any ASG that is not a Managed ASG. The tool never changes it.

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

**Platform exceptions**:
The fixed allow NSG rules above every Rule in each Managed NSG that let Azure platform traffic, such as Azure Load Balancer health probes, pass. No Rule can override them.
_Avoid_: required exceptions, infrastructure rules

**Azure default rules**:
The fixed rules that Azure adds to every NSG, such as AllowVnetInBound and AllowInternetOutBound. Shown read-only.

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
Moving an open Change set onto the latest Version after another Commit. It conflicts when both changed the same Rule, Object or Zone, or the neighbours of a Rule it placed.
_Avoid_: merge, sync, update

**Affected Zones**:
The Zones a Change set touches for Approval: the Coverage of source and destination of every Rule it changes directly or through a changed Object or Zone, before and after the change, plus the Zones of added or removed ASG members and the Zones it onboards, removes or changes.
_Avoid_: blast radius, impacted NSGs

**Preview**:
The list of NSGs, NSG rules, subnet associations and ASGs that a Change set will create, change or delete.
_Avoid_: diff, plan

**Approval**:
Consent from an approver before a Commit. Each Affected Zone needs the Approval level that its Scope requires: none, approver (an Author may approve) or four-eyes (an approver who is not an Author). One approver's Approval counts for every Affected Zone in which that person holds the approver Role.

**Commit**:
Turning an approved Change set into the next Version and starting a Deployment to each affected Environment. The Version exists from the moment of the Commit, whether or not its Deployments succeed. A Commit runs at once or at a time the committer chooses.
_Avoid_: push, apply, publish

**Deployment**:
The delivery of one Version to one Environment through that Environment's Deployment mode. A Commit starts one Deployment per affected Environment, and each Deployment has its own result. A Deployment starts from the Deployed state, so a newer Version's Deployment supersedes an unfinished Deployment to the same Environment and also delivers what that one did not. In a Terraform Environment a Deployment arrives as one pull request, or as a Tighten pull request followed by a Loosen pull request. It is deployed only when Azure shows its target, not when a pull request merges.
_Avoid_: rollout, push

**Tighten phase**:
The phase of a Deployment that writes only what closes traffic. A Managed NSG whose change both closes and opens traffic gets an interim content in this phase that allows only what both the old and the new content allow.

**Loosen phase**:
The phase of a Deployment that writes everything that opens traffic. It starts only after the Tighten phase has finished. Together, the two phases make sure that Azure never allows traffic that both the old and the new Version deny, and that newly allowed traffic opens only after all newly denied traffic is closed.

**Deployed state**:
For each Azure resource the tool writes, the content the tool last wrote to it successfully. In a Terraform Environment, it is the content of the tool's merged Data contract that the tool has seen in Azure.
_Avoid_: actual state, current state

**Emergency Commit**:
A Commit that an admin makes without the required Approval, with a mandatory reason. It stays open until an approver approves it afterwards.
_Avoid_: break-glass, bypass

**Version**:
A stored, committed state of the Rule base that can be rolled back to. It records what was decided; whether Azure matches it is the result of its Deployments.
_Avoid_: revision, snapshot

**Restore**:
A Change set that returns the Rule base to an earlier Version. It restores Rules, Objects, Zones and ASG members, not the Azure facts adopted since.
_Avoid_: rollback (the umbrella for Restore and Revert)

**Revert**:
A Change set that undoes the edits of one earlier Commit on top of the latest Version.
_Avoid_: rollback, undo

**Deployment mode**:
How a Commit reaches Azure: directly through the Azure Resource Manager API, or as a Data contract in a pull request to the Environment's Terraform repository, whose pipeline applies it.

**Data contract**:
The data the tool writes into a Terraform repository: one file per Terraform root module with the target content of every Managed NSG, subnet association, Managed ASG and ASG membership there. The tool owns these files and nothing else in the repository. The repository's own Terraform code reads them.
_Avoid_: template, generated code

**Import**:
Converting existing NSGs and NSG rules into the Rule base.

**Drift**:
A difference between Azure and the Deployed state, caused outside the tool, for example in the portal, the CLI or other IaC. A resource that a Deployment has not reached yet is pending, not drifted.

### Access

**Role**:
Viewer, editor, approver or admin, each limited to a Scope.

**Scope**:
An Environment, subscription, VNet or Zone that limits a Role or an Approval requirement. Environment is the coarsest Scope.
