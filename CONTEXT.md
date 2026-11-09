# nsgfw

nsgfw manages Azure Network Security Groups the way a classic firewall console manages a firewall: administrators edit one central Rule base of Objects, Zones and ordered Rules, and the tool translates it into NSGs. Administrators never create or edit an NSG directly.

## Language

### Rule base

**Rule base**:
The central, ordered set of Rules together with the Objects and Zones they reference. It is the only source from which the tool derives Managed NSGs. There is exactly one Rule base per tool instance, and it spans all Environments.
_Avoid_: policy, ruleset, NSG configuration

**Rule**:
One ordered entry in the Rule base, with name, source, destination, service, action (allow or deny), enabled flag, comment, ticket reference, owner and optional expiry date. Source, destination and service each hold one or more Objects or Zones and match any of them; there is no negation. Rules are evaluated top-down and the first match wins.
_Avoid_: NSG rule, security rule, policy

**Intra-zone default**:
The implicit allow for traffic that stays inside one Zone. It sits below every Rule and above the Deny-all rules, so a Rule can override it.
_Avoid_: intrazone rule

**Zone**:
A subnet that an administrator has onboarded so that Rules can use it as source or destination. Zones are the primary way to choose where traffic comes from and where it goes. Each Zone has its own name, unique in the Rule base, and exactly one Managed NSG. A subnet that cannot carry a Managed NSG, such as GatewaySubnet, never becomes a Zone.
_Avoid_: segment, network, NSG

**Coverage**:
The Zones that a Zone, Address object or Address group stands for. A Zone covers itself, a VNet covers the Zones inside it, a single IP or CIDR range covers every Zone whose prefixes it overlaps, an Address object backed by an ASG covers the Zones that hold its member NICs, and an Address group covers the union of its members. A service tag and a subnet that is not a Zone cover no Zone. The Translation engine places a Rule only on the Managed NSGs in the Coverage of its source and destination, so the NSGs together decide every flow the way one firewall would.
_Avoid_: scope (reserved for access), footprint

**Address object**:
A named single IP, CIDR range, Azure service tag, subnet that is not a Zone, VNet, or Address group. The built-in Address object any stands for every IPv4 and IPv6 address.
_Avoid_: host, network object

**Address group**:
A named group of Address objects and Zones.

**Service object**:
A named protocol plus a port or port range. The built-in Service object any matches every protocol and port.
_Avoid_: port object, application

**Service group**:
A named group of Service objects.

### Azure side

**Environment**:
A named part of the Azure estate in the tool's tenant, defined as one management group or a list of subscriptions, that the tool manages with its own naming pattern, Deployment mode and Terraform templates. Each subscription belongs to at most one Environment. Environments partition Azure, not the Rule base.
_Avoid_: stage, landing zone, tenant

**Tool identity**:
The single Azure identity through which the tool reads and changes Azure in every Environment: a managed identity when the tool runs in Azure, a service principal with a certificate when it runs on-premises.
_Avoid_: service account, app identity

**Managed NSG**:
An NSG that the tool created, or that an administrator explicitly imported, tagged as managed by the tool. The tool modifies no other NSG.
_Avoid_: tool NSG, owned NSG

**Unmanaged NSG**:
Any NSG that is not a Managed NSG, including every NIC-level NSG. Shown read-only.

**Retired NSG**:
A Managed NSG whose Zone was removed. It stays associated with its subnet and holds only the Platform exceptions and the Deny-all rules, so the subnet stays protected. If the subnet becomes a Zone again, the Retired NSG becomes its Managed NSG again.
_Avoid_: orphaned NSG, released NSG

**NSG rule**:
A security rule inside an Azure NSG. The Translation engine generates NSG rules from Rules.
_Avoid_: Rule (reserved for Rule base entries)

**Augmented rule**:
An NSG rule with several prefixes, ports or service tags, used to save rule slots.

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
Pending edits to the Rule base that are not yet deployed to Azure.
_Avoid_: draft, candidate configuration, transaction

**Preview**:
The list of NSGs, NSG rules, subnet associations and ASGs that a Change set will create, change or delete.
_Avoid_: diff, plan

**Approval**:
Consent from an approver before a Commit. The required level is configurable per Scope, from none to four-eyes.

**Commit**:
Delivering an approved Change set to Azure through the Deployment mode of each affected Environment. Every Commit creates a Version.
_Avoid_: push, apply, publish

**Version**:
A stored, committed state of the Rule base that can be rolled back to.
_Avoid_: revision, snapshot

**Deployment mode**:
How a Commit reaches Azure: directly through the Azure Resource Manager API, or as generated Terraform code in a pull request.

**Import**:
Converting existing NSGs and NSG rules into the Rule base.

**Drift**:
A difference between Azure and the last committed Version, caused outside the tool, for example in the portal, the CLI or other IaC.

### Access

**Role**:
Viewer, editor, approver or admin, each limited to a Scope.

**Scope**:
An Environment, subscription, VNet or Zone that limits a Role or an Approval requirement. Environment is the coarsest Scope.
