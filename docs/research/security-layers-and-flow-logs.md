# Research: Other security layers and flow-log rule identity

Ticket: GitHub issue #7, `mfgAkilae/nsgfw`.
Retrieval date for every source below: 2026-11-09.

## Ticket question

How can nsgfw read and display the layers that override or add to NSG rules, and what identifies an NSG rule in flow logs?

Covers:

- Azure Virtual Network Manager (AVNM) security admin rules: API and Resource Graph access, evaluation order relative to NSGs, semantics of Allow, Deny and Always Allow, deployment scope.
- NIC-level NSGs: discovery and how they combine with subnet NSGs.
- Network Watcher effective security rules and IP flow verify: inputs, scope, latency, permissions.
- VNet flow logs and NSG flow logs: which field identifies the matching rule, so that every NSG rule maps to exactly one Rule; retirement status of NSG flow logs.

Design constraint checked against: every NSG rule that nsgfw generates belongs to exactly one Rule of the Rule base, so that later flow-log hit counts can be attributed per Rule.

### Method and source notes

- Microsoft Learn pages were read from their Markdown source in `github.com/MicrosoftDocs/azure-docs` (branch `main`), which publishes them. The citations below give the Learn URL. Three statements were spot-checked against the live Learn pages and matched (NSG flow log retirement text, the `rule` field description for AVNM, the 65-character rule name note).
- REST API facts come from `github.com/Azure/azure-rest-api-specs`, latest stable Microsoft.Network version `2026-03-01`: [networkManager.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkManager.json), [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json), [virtualNetwork.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json), [common.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/common.json) and the `examples/` folder next to them.
- No Azure API was called. No blog or forum is used as a source.
- Out of scope here: Azure Firewall and user-defined routes (listed in the brief as other layers, but not in the Covers list of this ticket).
- The ticket names branch `research/security-layers-and-flow-logs` for this file. This research run was not allowed to create branches, so the file was written in the current working tree; branch and commit are left to the orchestrator.

## Summary

- AVNM security admin rules apply per virtual network and are evaluated before any NSG rule. `Deny` and `AlwaysAllow` end evaluation, so the NSG never sees that traffic; `Allow` hands the traffic on to the NSGs. nsgfw can read them through the AVNM REST API (configuration, rule collections, rules; per-VNet effective rules) and through Azure Resource Graph table `networkresources`.
- For inbound traffic the documented order is: admin rules, then the subnet NSG, then the NIC NSG. For outbound traffic Microsoft documents NIC NSG, then subnet NSG; the position of admin rules for outbound traffic is only stated as "before NSG rules" without a direction. One Network Watcher page says the NIC/subnet order is "platform dependent".
- NIC NSGs can be found from `properties.networkSecurityGroup` on the NIC and from the read-only `properties.networkInterfaces` and `properties.subnets` lists on the NSG. Traffic has to pass both the subnet NSG and the NIC NSG.
- Effective security rules (per NIC), IP flow verify (per VM, TCP/UDP, IPv4) and NSG diagnostics (VM, NIC, VMSS NIC, Application Gateway v2) all include AVNM admin rules. All three are long-running POST operations; no latency is documented beyond "a few seconds" in a tutorial.
- In flow logs an NSG rule is identified only by name, not by resource ID or priority: VNet flow logs carry `flowRecords.flows[].aclID` (identifier of the evaluating NSG or AVNM) plus `flowGroups[].rule` (rule name). NSG flow logs carry the NSG `resourceId` per record plus `rule` with prefix `UserRule_` or `DefaultRule_`. Traffic Analytics carries `AclGroup` (NSG name path) and `AclRule` (rule name).
- NSG flow logs retire on September 30, 2027; creation of new NSG flow logs is no longer supported. VNet flow logs are the documented replacement and also log AVNM admin rule decisions.

## Findings

### 1. AVNM security admin rules

#### 1.1 What they are and where they apply

- Security admin rules are global rules in a security admin configuration. A configuration contains rule collections; each rule collection contains rules and is associated with network groups. The rules apply to all virtual networks in those network groups once the configuration is deployed. Network groups can only contain virtual networks within the scope of the network manager. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins)
- "Currently, you apply security admin rules at the virtual network level." NSGs are associated at subnet and NIC level. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins)
- REST model: `networkManagers/{nm}/securityAdminConfigurations/{config}/ruleCollections/{collection}/rules/{rule}`. A rule collection has `appliesToGroups[].networkGroupId`. A rule (`kind: Custom`) has `description` (max 140 chars), `protocol`, `sources[]`, `destinations[]` (each `addressPrefix` + `addressPrefixType` of `IPPrefix`, `ServiceTag` or `NetworkGroup`), `sourcePortRanges[]`, `destinationPortRanges[]`, `access`, `priority`, `direction`, read-only `resourceGuid`. [networkManager.json, `AdminPropertiesFormat`, `AdminRuleCollectionPropertiesFormat`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkManager.json); enums in [common.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/common.json)
- `access` enum: `Allow`, `Deny`, `AlwaysAllow`. `direction` enum: `Inbound`, `Outbound`. Rule `kind` enum: `Custom`, `Default`. [common.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/common.json)
- Priority: integer 1–4096, lower value means higher priority. The spec adds: "The priority number must be unique for each rule in the collection." [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins); [networkManager.json, `AdminPropertiesFormat.priority`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkManager.json)
- Protocols: TCP, UDP, ICMP, ESP, AH, Any. Sources and destinations: IPv4/IPv6 addresses or CIDR blocks, or service tags; the service tags AzurePlatformDNS, AzurePlatformIMDS and AzurePlatformLKM are not supported. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins); [Limitations](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-limitations)
- Network groups as source or destination (public preview): the network manager aggregates the CIDR ranges of the group; only the `Manual` aggregation option is supported, so CIDR changes take effect only when the configuration is redeployed; max 100 VNets or subnets per referenced group. [Using network groups with security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admin-rules-network-group)
- Limits: max 20,000 IP prefixes in all security admin rules combined; max 100 security admin rules "in one level of Azure Virtual Network Manager". [Limitations](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-limitations)

#### 1.2 Semantics of Allow, Deny and Always Allow

- **Allow**: evaluated first, then NSG rules evaluate the traffic ("This action allows network security group rules to handle the traffic differently if needed"). [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins)
- **Deny**: evaluation ends after the admin rule; the traffic is not delivered. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins); [NSG overview, Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#security-admin-rules)
- **Always Allow**: evaluation ends after the admin rule; the traffic goes directly to the resource, "regardless of other rules with lower priority or user-defined network security groups". [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins)
- "traffic matching security admin rules of "Always allow" or "Deny" action types don't reach network security group rules for further evaluation." [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#security-admin-rules)
- Within admin rules, the smaller priority number is evaluated first; the documented exception pattern is an Allow at priority 10 for a small network group above a Deny at priority 100 for all VNets. Traffic allowed by the admin Allow rule is next evaluated by the NSGs. [Enforcement](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-enforcement)
- Microsoft's diagram "The order of network traffic evaluation" shows: Traffic → Security admin rules → (Allow) NSG rules → (Allow) target subnet; (Deny) stops; (Always Allow) goes straight to the target subnet. [Security admin rules, diagram `traffic-evaluation.png`](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins#how-security-admin-rules-and-network-security-groups-nsgs-are-evaluated)

#### 1.3 Where admin rules do not apply

- By default not applied to virtual networks that contain Azure SQL Managed Instance or Azure Databricks. With `applyOnNetworkIntentPolicyBasedServices` = `AllowRulesOnly`, only Allow rules apply there. Enum values: `None`, `All`, `AllowRulesOnly`. If several network managers set this differently on one VNet, the setting of the manager with the highest scope is used. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins#nonapplication-of-security-admin-rules); [common.json, `NetworkIntentPolicyBasedService`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/common.json)
- Not applied to subnets containing Application Gateway (unless only network-isolated gateways), Bastion, Azure Firewall, Route Server, VPN Gateway, Virtual WAN, ExpressRoute Gateway. Other subnets in the same VNet still receive them. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins#nonapplication-of-security-admin-rules)
- Not applied to private endpoints in the scope of a managed VNet. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins); [AVNM FAQ](https://learn.microsoft.com/en-us/azure/virtual-network-manager/faq)

#### 1.4 Deployment scope

- A network manager's scope is a set of management groups and/or subscriptions; a management group includes all child subscriptions. Cross-tenant scope is possible with a separate approval flow. Configurations apply only to resources inside the scope; an out-of-scope VNet can be a network group member but receives no configuration. [Scopes](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-network-manager-scope); [Cross-tenant](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-cross-tenant)
- Several network managers can have overlapping scopes only when they have different features enabled. On a configuration conflict between managers for the same resource, the configuration of the manager with the higher scope applies. [Scopes, Hierarchy](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-network-manager-scope#hierarchy)
- Configurations take effect only after deployment (commit) to selected regions. Only one security admin configuration per network manager per region; use several rule collections instead. The goal-state model replaces the region's set of deployed configurations with each commit. [Deployments](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-deployments); [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins)
- Timing: base apply time "a few minutes". Static members update immediately; Azure Policy-based members take a few minutes below 1,000 subscriptions and up to a 24-hour notification window above 1,000 subscriptions. Deployment uses eventual consistency. [Deployments](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-deployments#deployment-latency-and-timing); [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins)
- The deployment status reflects overall success only, not per VNet or subnet. [Deployments](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-deployments#deployment-status-and-monitoring)

#### 1.5 Read access: REST API

All from [networkManager.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkManager.json) (`2026-03-01`):

| Purpose | Operation | Notes |
| --- | --- | --- |
| Rules applied to one VNet (all managers) | `POST .../virtualNetworks/{vnet}/listNetworkManagerEffectiveSecurityAdminRules` | Body `QueryRequestOptions` (`skipToken`), query `$top`. Response items: `id` (full rule resource ID), `kind`, `properties` (rule fields), `configurationDescription`, `ruleCollectionDescription`, `ruleCollectionAppliesToGroups`, `ruleGroups`. |
| Rules deployed by one manager | `POST .../networkManagers/{nm}/listActiveSecurityAdminRules` | Body `ActiveConfigurationParameter` (`regions[]`, `skipToken`). Response items add `commitTime` and `region`. |
| Authored configuration | `GET .../securityAdminConfigurations`, `.../ruleCollections`, `.../rules` | Shows what is authored, not what is deployed. |
| Commits | `GET .../networkManagers/{nm}/commits[/{commitName}]` | `CommitProperties`: `commitType`, `configurationIds[]`, `targetLocations[]`, read-only `activeLocations[]`. |

Permissions ([Azure permissions for Networking](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/networking)):

- `Microsoft.Network/virtualNetworks/listNetworkManagerEffectiveSecurityAdminRules/read` — "This read permission, not listNetworkManagerEffectiveSecurityAdminRules/action, is required to call List Network Manager Effective Security Admin Rules."
- `Microsoft.Network/networkManagers/listActiveSecurityAdminRules/read` — same wording for List Active Security Admin Rules.
- `Microsoft.Network/networkManagers/read`, `.../securityAdminConfigurations/read`, `.../securityAdminConfigurations/ruleCollections/read`, `.../securityAdminConfigurations/ruleCollections/rules/read`.

#### 1.6 Read access: Azure Resource Graph

- AVNM data lives in the ARG table `networkresources`. Security-admin-related types: `microsoft.network/effectivesecurityadminrules`, `microsoft.network/networkmanagers/securityadminconfigurations/snapshots`, `.../rulecollections/snapshots`, `.../rulecollections/rules/snapshots`, `microsoft.network/networkmanagers/securityadminregionalgoalstates`. [Query AVNM with ARG](https://learn.microsoft.com/en-us/azure/virtual-network-manager/query-azure-resource-graph)
- The effective admin rules of a VNet have ID `{vnetId}/providers/Microsoft.Network/effectiveSecurityAdminRules/default`; the sample query reads `properties.effectiveSecurityAdminConfigurations` and handles both `effectiveSecurityAdminConfigurations` and `EffectiveSecurityAdminConfigurations` casing. Regional goal states expose `commitId`, `commitTimestamp`, `securityAdminConfigurations`, `securityAdminRuleCollections`, `securityAdminRules`, `status`, `errorMessage`, again in two casings. [Query AVNM with ARG](https://learn.microsoft.com/en-us/azure/virtual-network-manager/query-azure-resource-graph)
- Network group membership per VNet: type `microsoft.network/networkgroupmemberships`, ID `{virtualNetworkId}/providers/Microsoft.Network/networkGroupMemberships/default`, property `GroupMemberships[].NetworkGroupId`. [View applied configurations](https://learn.microsoft.com/en-us/azure/virtual-network-manager/how-to-view-applied-configurations)
- ARG returns only resources the caller can read. [Query AVNM with ARG](https://learn.microsoft.com/en-us/azure/virtual-network-manager/query-azure-resource-graph)
- The `networkresources` table also lists `microsoft.network/networkmanagers/securityuserconfigurations/...`, `securityuserregionalgoalstates` and `microsoft.network/virtualnetworks/subnets/effectivesecurityuserrules`. [Supported tables and resource types](https://learn.microsoft.com/en-us/azure/governance/resource-graph/reference/supported-tables-resources)

#### 1.7 Related: security user configurations

- The stable API `2026-03-01` contains `securityUserConfigurations/{config}/ruleCollections/{collection}/rules/{rule}` and `ConfigurationType` value `SecurityUser`. [networkManager.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkManager.json); [common.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/common.json)
- No Microsoft Learn concept page for security user rules was found in the `articles/virtual-network-manager` folder. Their evaluation semantics are therefore not documented in the sources read (see Uncertain).

#### 1.8 Related: rule impact analyzer

- AVNM and Traffic Analytics offer a portal "rule impact analyzer" that simulates admin rules (and, from Traffic Analytics, NSG rules) against recorded flows. It needs Traffic Analytics on VNet flow logs and excludes VNets with subnet- or NIC-level flow logs, with flow log filtering, or AKS injection. [Simulate security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/how-to-simulate-security-admin-rules); [Rule Impact Analyzer](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-rule-impact-analyzer)

### 2. NIC-level NSGs

#### 2.1 Discovery

- The NIC resource has `properties.networkSecurityGroup` (reference to the NSG) and read-only `properties.virtualMachine`. The subnet resource has `properties.networkSecurityGroup`. [virtualNetwork.json, `NetworkInterfacePropertiesFormat`, `SubnetPropertiesFormat`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json)
- The NSG resource has read-only `properties.networkInterfaces[]`, `properties.subnets[]`, `properties.flowLogs[]` and `properties.resourceGuid`. [virtualNetwork.json, `NetworkSecurityGroupPropertiesFormat`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json)
- ARG `Resources` table holds NSGs as type `microsoft.network/networksecuritygroups`; Microsoft's starter query filters on `properties.networkInterfaces` and `properties.subnets`. [Resource Graph starter queries, "Show unassociated network security groups"](https://learn.microsoft.com/en-us/azure/governance/resource-graph/samples/starter#show-unassociated-network-security-groups)
- The same NSG can be associated with any number of subnets and NICs. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works)

#### 2.2 How NIC NSGs combine with subnet NSGs

- Inbound: Azure first processes the subnet NSG, then the NIC NSG; same order for intra-subnet traffic. Traffic denied by the subnet NSG is never evaluated by the NIC NSG. To allow a port, both NSGs must allow it. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works#inbound-traffic)
- Outbound: Azure first processes the NIC NSG, then the subnet NSG. If the NIC NSG denies, the subnet NSG never sees the traffic. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works#outbound-traffic)
- No NSG on subnet or NIC: inbound to a VM with a Standard public IP is blocked; outbound flows freely. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works)
- Microsoft's tip: avoid associating NSGs with both a subnet and its NICs. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works#intra-subnet-traffic)
- Contradicting statement in the NSG flow logs best practices: "The exact sequence of rule processing by network security groups at NIC and subnet levels is platform dependent and varies from case to case. Traffic flows are logged against the network security group that's processed last." [NSG flow logs, Best practices](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview#best-practices)

### 3. Network Watcher: effective security rules, IP flow verify, NSG diagnostics

Network Watcher is enabled automatically per region when a VNet is created or updated, unless the subscription opted out (opt-out is permanent). Instance name `NetworkWatcher_{region}`. [Enable or disable Network Watcher](https://learn.microsoft.com/en-us/azure/network-watcher/network-watcher-create)

#### 3.1 Effective security rules

- Shows the aggregated rules of the NIC NSG and the subnet NSG, plus AVNM admin rules applied to the VNet. [Effective security rules overview](https://learn.microsoft.com/en-us/azure/network-watcher/effective-security-rules-overview)
- API: `POST .../networkInterfaces/{nic}/effectiveNetworkSecurityGroups`, long-running (`200`/`202`, `final-state-via: location`). Input: the NIC only. Output per `EffectiveNetworkSecurityGroup`: `networkSecurityGroup.id`, `association` (`subnet`, `networkInterface`, `networkManager`), `effectiveSecurityRules[]`, `tagMap`. [virtualNetwork.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json)
- `EffectiveNetworkSecurityRule` fields: `name`, `protocol`, port ranges, address prefixes, `expandedSourceAddressPrefix`, `expandedDestinationAddressPrefix`, `access`, `priority`, `direction`. The example returns names as `securityRules/<name>` and `defaultSecurityRules/<name>`. [virtualNetwork.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json); [example `NetworkInterfaceEffectiveNSGList.json`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/examples/NetworkInterfaceEffectiveNSGList.json)
- Scope: one NIC per call. Output only if an NSG is associated with the NIC or its subnet, and the VM must be running. [Diagnose a VM network traffic filter problem](https://learn.microsoft.com/en-us/azure/virtual-network/diagnose-network-traffic-filter-problem)
- After an association change, "wait a few seconds for the output to reflect the update". [Diagnose a VM network traffic filter problem](https://learn.microsoft.com/en-us/azure/virtual-network/diagnose-network-traffic-filter-problem)
- Permission: `Microsoft.Network/networkInterfaces/effectiveNetworkSecurityGroups/action`. [Network interface permissions](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-network-interface#permissions); [Azure permissions for Networking](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/networking)

#### 3.2 IP flow verify

- Checks whether a packet to or from a VM is allowed, using all NSGs on the VM's subnet and NIC plus AVNM rules on the VM's VNet. Returns allowed/denied and the name of the deciding rule. [IP flow verify overview](https://learn.microsoft.com/en-us/azure/network-watcher/ip-flow-verify-overview)
- API: `POST .../networkWatchers/{nw}/ipFlowVerify`, long-running (`200`/`202`, `final-state-via: location`). Inputs (`VerificationIPFlowParameters`): `targetResourceId` (VM), `direction`, `protocol`, `localPort`, `remotePort` (single port; `*` partly supported), `localIPAddress`, `remoteIPAddress` (IPv4 only), `targetNicResourceId` (required if the VM has several NICs and IP forwarding is enabled on any). Output (`VerificationIPFlowResult`): `access`, `ruleName`. [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json)
- The REST result has no NSG ID; the portal shows a link to the NSG. CLI examples return `RuleName` as `defaultSecurityRules/AllowInternetOutBound`. [IP flow verify overview](https://learn.microsoft.com/en-us/azure/network-watcher/ip-flow-verify-overview); [Diagnose with Azure CLI](https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-vm-network-traffic-filtering-problem-cli)
- Scope and limits: needs a Network Watcher in the VM's subscription and region; tests only TCP and UDP; tests only rules on a VM's NIC, not VMSS (use NSG diagnostics for ICMP and VMSS). [IP flow verify overview](https://learn.microsoft.com/en-us/azure/network-watcher/ip-flow-verify-overview)
- Latency: not specified; the CLI tutorial says "After a few seconds, you get a similar output". [Diagnose with Azure CLI](https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-vm-network-traffic-filtering-problem-cli)
- Permission: `Microsoft.Network/networkWatchers/ipFlowVerify/action` and `.../ipFlowVerify/read`. [Network Watcher RBAC permissions](https://learn.microsoft.com/en-us/azure/network-watcher/rbac-permissions#ip-flow-verify)

#### 3.3 NSG diagnostics (network configuration diagnostic)

- Simulates a flow and returns every evaluated NSG with the matched rule. Targets: VMs, NICs, VMSS NICs, Application Gateway v2 (except private deployments). [NSG diagnostics overview](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-diagnostics-overview)
- API: `POST .../networkWatchers/{nw}/networkConfigurationDiagnostic`, long-running. Input: `targetResourceId`, `verbosityLevel`, `profiles[]` with `direction`, `protocol` (spec: `*`, TCP, UDP), `source` and `destination` (`*`, IP/CIDR or service tag), `destinationPort`. Output per evaluated NSG: `networkSecurityGroupId`, `appliedTo` (NIC or subnet ID), `matchedRule` (`ruleName`, `action`), `rulesEvaluationResult[]`. [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json)
- In Microsoft's example the inbound result lists, in this order: the network manager (`networkSecurityGroupId` = network manager resource ID, `appliedTo` = VNet ID, rule name without prefix), the subnet NSG (`DefaultRule_AllowVnetInBound`), the NIC NSG (`UserRule_DenyVnetInBound`). [Diagnose network security rules](https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-network-security-rules)
- Permission: `Microsoft.Network/networkWatchers/networkConfigurationDiagnostic/action` (and `/read`). [Azure permissions for Networking](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/networking)

### 4. Flow logs and rule identity

#### 4.1 VNet flow logs

- Target: VNet, subnet or NIC; if several levels are configured, NIC > subnet > VNet. [Manage VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-manage)
- Record fields: `time`, `flowLogVersion`, `flowLogGUID`, `macAddress` (NIC where captured), `category` (`FlowLogFlowEvent`), `flowLogResourceID`, `targetResourceID`, `operationName`, `flowRecords.flows[]`. Each `flows[]` entry ("multiple entries for access control lists") has `aclID` and `flowGroups[]`; each flow group has `rule` and `flowTuples[]`. [VNet flow logs, Log format](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#log-format)
- `aclID`: "Identifier of the resource that's evaluating traffic, either a network security group or Virtual Network Manager." `unspecified` for traffic denied because of encryption. [VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#log-format)
- `rule`: "Name of the rule that allowed or denied the traffic." For AVNM-evaluated flows, the name of the security admin rule. [VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#log-format); [Monitoring AVNM with VNet flow logs](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-virtual-network-flow-logs)
- Tuple order (version 2): time stamp, source IP, destination IP, source port, destination port, protocol (IANA number), direction (`I`/`O`), flow state (`B`/`C`/`E`/`D`), encryption, packets sent, bytes sent, packets received, bytes received. Version 5 adds PLS link identifier, source NAT IP, source NAT port; version 5 is regional (WCUS, East Asia, Canary). [VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#log-format)
- Flow state `D` = denied. A `D` under a security admin rule name is how an AVNM block appears. [Monitoring AVNM with VNet flow logs](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-virtual-network-flow-logs)
- Collection every minute; written to a storage account in the same region as the VNet. [VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview)
- "Platform rule" entries represent traffic handled by the platform, not by NSG or AVNM rules; workload traffic can appear under a platform rule in some cases (recreated load-balanced connections, return traffic without rule evaluation). [VNet flow logs, Platform Rules](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#platform-rules)
- Filtering: the flow log resource has `enabledFilteringCriteria` (SrcIP, SrcPort, DstIP, DstPort, Protocol, Encryption, Direction, Action) and `recordTypes` (any combination of B, C, E, D). [networkWatcher.json, `FlowLogPropertiesFormat`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json)
- ICMP is not logged by NSG flow logs or VNet flow logs. [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions)
- Incompatible services include Container Instances, Container Apps, Logic Apps, Functions, DNS Private Resolver, App Service, SQL Managed Instance, NetApp Files and others. [VNet flow logs, Incompatible services](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#incompatible-services)

#### 4.2 NSG flow logs

- Retirement: "Network security group (NSG) flow logs retire on September 30, 2027. Because the feature is retiring, it no longer supports new NSG flow logs creation." After that date Azure no longer supports Traffic Analytics for NSG flow logs and deletes existing NSG flow log resources; stored records stay and follow their retention. [NSG flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview); [Migrate to VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-migrate)
- Record fields: `time`, `systemId` ("System ID of the network security group"), `category`, `resourceId` (resource ID of the NSG), `operationName`, `properties.Version`, `properties.flows[]` with `rule` and `flows[]` (`mac`, `flowTuples`). Tuple protocol is `T`/`U`; decision `A`/`D`; flow state only in version 2. [NSG flow logs, Log format](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview#log-format)
- Rule names appear as `UserRule_<name>` and `DefaultRule_<name>` (for example `UserRule_default-allow-rdp`, `DefaultRule_DenyAllInBound`). [NSG flow logs, Sample log records](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview#sample-log-records); [Read flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/flow-logs-read)
- Deny rules are terminating and logged by the denying NSG. Allow rules are non-terminating; "The last network security group that allows traffic logs the traffic". "A flow is associated with only one network security group rule." [NSG flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview)
- Naming: "The network security group name must be up to 80 characters, and a network security group rule name must be up to 65 characters. If the names exceed their character limits, they might be truncated during logging." NSG rule names themselves may be up to 80 characters. [NSG flow logs, Best practices](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview#best-practices); [NSG overview, Security rules](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#security-rules)
- Non-default inbound TCP rules are implemented statelessly; those flows become non-terminating and their byte and packet counts are not recorded, unless `FlowTimeoutInMinutes` is set on the VNet. [NSG flow logs, Non-default inbound TCP rules](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview#non-default-inbound-tcp-rules)
- Running NSG flow logs and VNet flow logs on the same workload can give duplicate logging or only VNet flow logs; Microsoft recommends disabling NSG flow logs first. [VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview)
- AVNM admin rules are not supported by NSG flow logs. [VNet flow logs, Supported scenarios](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#supported-scenarios)

#### 4.3 Traffic Analytics (Log Analytics)

- VNet flow logs land in table `NTANetAnalytics` (replaces `AzureNetworkAnalytics_CL` used for NSG flow logs). Rule fields: `AclGroup` (`<SubscriptionID>/<resourcegroup_Name>/<NSG_Name>`) and `AclRule` (NSG rule name). Other fields: `FlowDirection`, `FlowStatus` (`A`/`D`), `TargetResourceId`, `TargetResourceType`, `MACAddress`, `SrcSubnet`, `DestSubnet`, `AllowedInFlows`, `DeniedInFlows`, `AllowedOutFlows`, `DeniedOutFlows`, byte and packet counts. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- NSG flow logs fields: `NSGList_s`, `NSGRule_s`, `NSGRules_s` (`<Index>|<NSG_Rule_Name>|<Direction>|<Status>|<FlowCount>`), `NSGRuleType_s` (`User Defined` or `Default`). [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- Aggregation: flows with the same source IP, destination IP, destination port, NSG name, NSG rule, direction and protocol are merged (source port excluded). Processing interval 60 minutes by default, or 10 minutes. [Traffic analytics schema, Data aggregation](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#data-aggregation)
- Traffic Analytics discovers new VMs, NICs, VNets and subnets every 6 hours; flows of newer resources can appear as "Unknown". [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions)
- Management-group-inherited permissions are not supported for enabling Traffic Analytics. [Network Watcher RBAC permissions](https://learn.microsoft.com/en-us/azure/network-watcher/rbac-permissions#traffic-analytics)

#### 4.4 What identifies an NSG rule, per source

| Source | NSG identification | Rule identification | Priority in record |
| --- | --- | --- | --- |
| VNet flow log (raw) | `flows[].aclID` (GUID-like identifier of NSG or AVNM) | `flowGroups[].rule` (name) | No |
| NSG flow log (raw) | `resourceId` (NSG resource ID), `systemId` | `rule` = `UserRule_<name>` / `DefaultRule_<name>` | No |
| Traffic Analytics, VNet flow logs | `AclGroup` = subscription/resource group/NSG name | `AclRule` (name) | No |
| Traffic Analytics, NSG flow logs | `NSGList_s` | `NSGRule_s`, `NSGRules_s` | No |
| Effective security rules API | `networkSecurityGroup.id`, `association` | `securityRules/<name>`, `defaultSecurityRules/<name>` | Yes |
| IP flow verify API | none in REST result | `ruleName` (CLI shows `defaultSecurityRules/<name>`) | No |
| NSG diagnostics API | `networkSecurityGroupId` (NSG or network manager ID), `appliedTo` | `matchedRule.ruleName` (`UserRule_<name>`, `DefaultRule_<name>`, admin rule name) | No |

Sources: rows as cited in sections 3 and 4.

## Evaluation order

### Inbound

1. AVNM security admin rules of the VNet, lowest priority number first. `Deny` stops the traffic. `AlwaysAllow` delivers it without NSG evaluation. `Allow` (or no match) continues. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins); [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#security-admin-rules)
2. Subnet NSG, lowest priority number first, first match wins; default rules at 65000+. Deny stops the traffic. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works#inbound-traffic); [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#security-rules)
3. NIC NSG, same rule logic. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works#inbound-traffic)

The NSG diagnostics example lists exactly this order (network manager, subnet NSG, NIC NSG). [Diagnose network security rules](https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-network-security-rules)

### Outbound

1. AVNM security admin rules: documented only as "evaluated before NSG rules", without a direction-specific statement. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins); [AVNM FAQ](https://learn.microsoft.com/en-us/azure/virtual-network-manager/faq)
2. NIC NSG. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works#outbound-traffic)
3. Subnet NSG. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works#outbound-traffic)

Caveat: the NSG flow logs page calls the NIC/subnet sequence "platform dependent". [NSG flow logs, Best practices](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview#best-practices)

## Example flow-log record

VNet flow log, version 2 tuple format, trimmed from Microsoft's sample. Identifiers replaced with placeholders. Source: [Monitoring AVNM with VNet flow logs](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-virtual-network-flow-logs#example-flow-log-record) and [VNet flow logs, Sample log record](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#sample-log-record).

```json
{
  "records": [
    {
      "time": "2022-09-14T09:00:52.5625085Z",
      "flowLogVersion": 4,
      "flowLogGUID": "<flow-log-guid>",
      "macAddress": "112233445566",
      "category": "FlowLogFlowEvent",
      "flowLogResourceID": "/SUBSCRIPTIONS/<sub>/RESOURCEGROUPS/NETWORKWATCHERRG/PROVIDERS/MICROSOFT.NETWORK/NETWORKWATCHERS/NETWORKWATCHER_<REGION>/FLOWLOGS/VNETFLOWLOG",
      "targetResourceID": "/subscriptions/<sub>/resourceGroups/myResourceGroup/providers/Microsoft.Network/virtualNetworks/myVNet",
      "operationName": "FlowLogFlowEvent",
      "flowRecords": {
        "flows": [
          {
            "aclID": "<nsg-or-network-manager-identifier>",
            "flowGroups": [
              {
                "rule": "DefaultRule_AllowInternetOutBound",
                "flowTuples": [
                  "1663146003599,10.0.0.6,192.0.2.180,23956,443,6,O,B,NX,0,0,0,0",
                  "1663146003606,10.0.0.6,192.0.2.180,23956,443,6,O,E,NX,3,767,2,1580"
                ]
              }
            ]
          },
          {
            "aclID": "<nsg-or-network-manager-identifier>",
            "flowGroups": [
              {
                "rule": "BlockHighRiskTCPPortsFromInternet",
                "flowTuples": [
                  "1663145998065,203.0.113.153,10.0.0.6,55188,22,6,I,D,NX,0,0,0,0"
                ]
              }
            ]
          }
        ]
      }
    }
  ]
}
```

Fields that identify the matching rule: `flowRecords.flows[].aclID` (which NSG or network manager decided) together with `flowRecords.flows[].flowGroups[].rule` (rule name). `BlockHighRiskTCPPortsFromInternet` is a security admin rule name; `DefaultRule_AllowInternetOutBound` is an NSG default rule. Microsoft's sample uses the same `aclID` value for both groups. The sample on the AVNM page and the "Version 2" tab of the VNet flow log page both show `"flowLogVersion": 4`.

For comparison, the NSG flow log equivalent: `records[].resourceId` (NSG resource ID) plus `properties.flows[].rule` such as `UserRule_ssh-rule`. [Read flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/flow-logs-read)

## Uncertain — candidates for an empirical check

1. **Value of `aclID`.** Docs say "identifier of the resource" but do not say whether it equals the NSG's `resourceGuid`, the network manager's `resourceGuid`, or another ID. Microsoft's sample uses the same `aclID` for an NSG default rule and a security admin rule. Check: compare `aclID` with `properties.resourceGuid` of the subnet NSG, the NIC NSG and the network manager.
2. **Rule name format in VNet flow logs for user NSG rules.** NSG flow logs and NSG diagnostics use `UserRule_<name>`; VNet flow log docs show only `DefaultRule_*`, admin rule names and a rule called `Internet`, never a user NSG rule. Check: log a flow that matches a custom NSG rule and inspect `rule`.
3. **Truncation of long rule names.** The 65-character truncation note exists only for NSG flow logs; NSG rule names may have 80 characters. Unknown for VNet flow logs and for Traffic Analytics `AclRule`. Check: create a rule with a 70–80 character name and inspect raw logs and `NTANetAnalytics`.
4. **Which NSG(s) log an allowed flow in VNet flow logs when both a subnet NSG and a NIC NSG exist,** and whether an AVNM `Allow` match also produces an entry. NSG flow logs log allowed traffic only at the last NSG that allows it; the VNet flow log docs only say `flows[]` has "multiple entries for access control lists". Check: flow through subnet NSG + NIC NSG + AVNM `Allow`, count `flows[]` entries per tuple.
5. **Outbound position of AVNM admin rules** relative to the NIC NSG. Only "before NSG rules" is documented; the diagram shows inbound to a subnet. Check: outbound flow denied by NIC NSG and matched by an admin `AlwaysAllow` or `Deny`; run NSG diagnostics with direction `Outbound` and inspect the order of `evaluatedNetworkSecurityGroups`.
6. **NIC vs subnet order.** "How NSGs filter traffic" gives a fixed order; the NSG flow log best practices call it "platform dependent". Check: deny at both levels and see which NSG appears in VNet flow logs and NSG diagnostics, inbound and outbound.
7. **Effective security rules API and AVNM.** The schema has `association.networkManager`, but no doc describes how admin rules appear in `effectiveSecurityRules` (name format, priority values, `AlwaysAllow` mapping to `access`). The spec example puts NIC, subnet and network manager in one association. Check: call the API on a NIC in a VNet with deployed admin rules.
8. **IP flow verify `ruleName` for AVNM and NIC rules.** Only default-rule examples exist (`defaultSecurityRules/<name>`). Unknown whether the REST result identifies which NSG or network manager matched. Check: verify flows that match a NIC NSG rule, a subnet NSG rule and an admin rule.
9. **Latency of effective security rules, IP flow verify and NSG diagnostics.** Not documented; all are long-running operations (`202` + `Location`). Only "a few seconds" appears in a tutorial. Check: measure in the test subscription, also under throttling.
10. **NSG diagnostics protocol support.** The spec lists `*`, TCP, UDP; the IP flow verify page sends ICMP tests to NSG diagnostics and the portal offers ICMP. Check: run an ICMP profile through the REST API.
11. **Priority ties across rule collections and across network managers.** Priority is unique per rule collection; ordering of equal priorities in different collections, and the combination of admin rules from two network managers on the same VNet, are not documented beyond "the configuration from the network manager with the higher scope is applied" on conflict. The meaning of "100 security admin rules in one level" is also undefined.
12. **`kind: Default` admin rules** with a `flag` (example value `AllowVnetInbound`) exist in the API, but no Learn page read here describes them.
13. **Security user configurations** (`securityUserConfigurations`, ARG `effectivesecurityuserrules` on subnets) are in the stable API and ARG, but undocumented on Learn in the pages read. Unknown whether they act as another layer that nsgfw would need to show.
14. **ARG property casing.** Microsoft's AVNM queries handle both `effectiveSecurityAdminConfigurations` and `EffectiveSecurityAdminConfigurations` (and similar). Which casing current data uses is not stated.
15. **`flowLogVersion` labelling.** The VNet flow log "Version 2" sample shows `flowLogVersion: 4`, while the field table speaks of versions 2 and 5. Which values occur for which tuple layout is unclear.

## Facts that open design tickets depend on

- Flow logs and Traffic Analytics identify an NSG rule only by its name (plus NSG identity), never by rule resource ID or priority. [VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#log-format); [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- NSG rule names are unique within one NSG, up to 80 characters, start with a word character, end with a word character or `_`, and may contain word characters, `.`, `-` and `_`. [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#security-rules)
- NSG flow logs may truncate rule names longer than 65 characters and NSG names longer than 80 characters. [NSG flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview#best-practices)
- NSG flow logs prefix rule names with `UserRule_` or `DefaultRule_`; the effective security rules API and IP flow verify CLI output use `securityRules/` and `defaultSecurityRules/`. [NSG flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview#sample-log-records); [example `NetworkInterfaceEffectiveNSGList.json`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/examples/NetworkInterfaceEffectiveNSGList.json); [Diagnose with Azure CLI](https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-vm-network-traffic-filtering-problem-cli)
- In NSG flow logs one flow is associated with only one NSG rule: denied traffic at the denying NSG, allowed traffic at the last NSG that allows it. [NSG flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview)
- A flow matched by an AVNM `Deny` or `AlwaysAllow` rule is never evaluated by any NSG, so it cannot be attributed to an NSG rule. [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#security-admin-rules)
- Traffic Analytics merges flows per source IP, destination IP, destination port, NSG name, NSG rule, direction and protocol, over 10- or 60-minute intervals. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#data-aggregation)
- Flow logs do not record ICMP. [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions)
- Flow logs can be filtered at the source (`enabledFilteringCriteria`, `recordTypes`), and some workload traffic is logged under platform rules. [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json); [VNet flow logs, Platform Rules](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#platform-rules)
- NSG flow logs: no new creation; retirement on September 30, 2027, after which NSG flow log resources are deleted. VNet flow logs are the replacement and the only flow log type that covers AVNM admin rules. [NSG flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview); [VNet flow logs, Supported scenarios](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#supported-scenarios)
- AVNM admin rules apply per VNet; only one security admin configuration per network manager per region; configurations take effect only after commit; network managers form a hierarchy where the higher scope wins on conflict. [Security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins); [Deployments](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-deployments); [Scopes](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-network-manager-scope#hierarchy)
- Deployed admin rules per VNet are readable with `listNetworkManagerEffectiveSecurityAdminRules` (permission `.../listNetworkManagerEffectiveSecurityAdminRules/read`) and through ARG `networkresources`. [networkManager.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkManager.json); [Azure permissions for Networking](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/networking); [Query AVNM with ARG](https://learn.microsoft.com/en-us/azure/virtual-network-manager/query-azure-resource-graph)
- Effective security rules work per NIC and need a running VM; IP flow verify works per VM, TCP/UDP, IPv4, and needs a Network Watcher in the VM's subscription and region. [Diagnose a VM network traffic filter problem](https://learn.microsoft.com/en-us/azure/virtual-network/diagnose-network-traffic-filter-problem); [IP flow verify overview](https://learn.microsoft.com/en-us/azure/network-watcher/ip-flow-verify-overview)
- Inbound traffic needs an allow at both subnet NSG and NIC NSG; Microsoft advises against using both levels. [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works)

### Side observations outside the ticket scope

- The NSG overview states: "you can't specify multiple service tags or application groups in a single rule." The brief describes augmented rules with "several prefixes, ports or service tags per rule". [NSG overview, Security rules](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#security-rules)
- NSG rule changes affect only new connections. The NSG resource has a `flushConnection` property that re-evaluates existing flows when rules are updated. [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview#security-rules); [virtualNetwork.json, `NetworkSecurityGroupPropertiesFormat`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json)
