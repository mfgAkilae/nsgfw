# nsgfw

nsgfw manages Azure Network Security Groups the way a classic firewall console manages a firewall: administrators edit one central Rule base of Objects, Zones and ordered Rules, and the tool translates it into NSGs. Administrators never create or edit an NSG directly.

## Language

### Rule base

**Rule base**:
The central, ordered set of Rules together with the Objects and Zones they reference. It is the only source from which the tool derives Managed NSGs. There is exactly one Rule base per tool instance, and it spans all Environments.
_Avoid_: policy, ruleset, NSG configuration

**Rule**:
One ordered entry in the Rule base, with name, source, destination, service, action (allow or deny), enabled flag, comment, ticket reference, owner and optional expiry date. Rules are evaluated top-down and the first match wins.
_Avoid_: NSG rule, security rule, policy

**Zone**:
A subnet used as the source or destination of Rules. Zones are the primary way to choose where traffic comes from and where it goes. Each Zone has exactly one Managed NSG.
_Avoid_: segment, network, NSG

**Address object**:
A named single IP, CIDR range, Azure service tag, subnet, VNet, or Address group.
_Avoid_: host, network object

**Address group**:
A named group of Address objects.

**Service object**:
A named protocol plus a port or port range.
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

**NSG rule**:
A security rule inside an Azure NSG. The Translation engine generates NSG rules from Rules.
_Avoid_: Rule (reserved for Rule base entries)

**Augmented rule**:
An NSG rule with several prefixes, ports or service tags, used to save rule slots.

**Deny-all rules**:
The explicit deny-all NSG rules, inbound and outbound, at the lowest custom priority of every Managed NSG, together with their required exceptions such as AzureLoadBalancer health probes.
_Avoid_: implicit deny, cleanup rule

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
