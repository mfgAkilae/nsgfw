# NSG and ASG rule semantics and limits

Research for GitHub issue #2. Retrieval date for every source: 2026-11-09. Sources are listed at the end with the "last updated" date that each page showed on that day. Citations use the IDs `[S1]` to `[S28]`.

## Ticket question

What do current Microsoft docs say about how NSG rules are evaluated and constrained, and what are today's limits, so that the Translation engine is designed on verified facts?

## Summary of answers

- **Evaluation order.** Inbound: subnet NSG first, then NIC NSG. Outbound: NIC NSG first, then subnet NSG. Traffic must be allowed by both levels. The same order applies to intra-subnet traffic. Peered VNets have no special NSG behaviour; NSGs in either VNet apply, and the `VirtualNetwork` service tag includes the peered address space while "allow access" is set on the peering. Azure Virtual Network Manager security admin rules are evaluated before any NSG rule. [S1][S2][S13][S14][S22]
- **Priorities.** Custom rules take 100–4096; lower number wins; first match stops processing. The docs disagree on the scope of uniqueness: "same priority and direction" in one page, "unique within the NSG" in another. The six Azure default rules sit at 65000, 65001 and 65500 per direction and cannot be deleted. [S1][S6][S16][S19]
- **Augmented rules.** The REST schema has list fields for address prefixes, port ranges and ASGs, in source and destination. Ports accept single values, ranges `a-b`, comma lists and `*`. Protocol is one value per rule: `Tcp`, `Udp`, `Icmp`, `Esp`, `Ah` or `*`. Microsoft Learn says only one service tag per rule, and that ASGs and IP ranges cannot be mixed in the same source or destination. Whether a service tag can sit inside the prefix list together with CIDRs is not documented. [S1][S6][S7][S16][S19][S20]
- **ASGs.** All NICs of one ASG must be in one VNet. If a rule has ASGs as both source and destination, all their NICs must be in the same VNet. The ASG must be in the same region as the NIC. Nothing in the docs covers cross-subscription ASG use; one troubleshooting page states that the NSG and the ASG members must be in the same VNet. [S3][S6][S7][S11][S19]
- **Platform traffic.** 168.63.129.16 (WireServer, DNS, DHCP, health probes) and 169.254.169.254 (IMDS) are not subject to NSGs by default, except through the service tags `AzurePlatformDNS`, `AzurePlatformIMDS`, `AzurePlatformLKM` (deny rules) and `AzureLoadBalancer` (health probes). [S1][S8][S9][S10][S26]
- **Statefulness.** NSGs are stateful through flow records. By default rule changes affect only new connections. The NSG property `flushConnection` makes Azure re-evaluate existing flows when rules are updated. [S1][S17][S27]
- **Limits (per subscription per region, Resource Manager).** 5,000 NSGs; 2,000 rules per NSG; 6,000 IP addresses and ranges for source or destination "in a security group"; 3,000 ASGs; 20 ASGs per IP configuration; 10 ASGs per rule; 100 ASGs across all rules of one NSG; 4,000 IP configurations per ASG. The limits page states these are already at maximum and not adjustable. No limit is published for service tags per rule or ports per rule. [S5]

## Findings per Covers bullet

### 1. Evaluation order

**Subnet NSG vs. NIC NSG**

- Inbound: Azure first processes the NSG associated with the subnet, then the NSG associated with the network interface. [S2][S13][S14]
- Outbound: Azure first processes the NSG associated with the network interface, then the NSG associated with the subnet. [S2][S13][S14]
- If the first NSG denies the traffic, the second NSG never evaluates it. To allow traffic, both NSGs must allow it. A deny in either NSG blocks it. [S2][S14]
- If no NSG is associated with the subnet or the NIC, Azure does not filter that leg. In the how-it-works example, VM3 has no subnet NSG, so traffic reaches the subnet and only the NIC NSG (NSG2) processes it. [S2]
- The same how-it-works page states for VM4 (no NSG on subnet or NIC): "All network traffic is blocked through a subnet and network interface if they don't have a network security group associated to them. The virtual machine with a standard public IP address is secure by default." In the same diagram, the outbound text for VM4 says "Traffic flows freely". See Uncertain, item U1. [S2]
- Each subnet and each NIC can have zero or one NSG. One NSG can be associated with any number of subnets and NICs. [S2][S12]
- An NSG that is associated with a subnet must exist in the same subscription and location as the virtual network. [S21]
- Microsoft recommends associating an NSG with either the subnet or the NIC, not both, because overlapping levels are hard to troubleshoot. [S2]
- The effective security rules of a NIC are the combination of the NIC NSG and the subnet NSG. They can be read with the portal, `Get-AzEffectiveNetworkSecurityGroup` or `az network nic list-effective-nsg`. [S12][S14]

**Inbound vs. outbound**

- Each NSG rule has a direction, `Inbound` or `Outbound`. Azure evaluates inbound and outbound rules separately. [S6][S14][S16]
- For inbound traffic, NSGs process traffic after Azure translates public IP addresses to private IP addresses. For outbound traffic, NSGs process traffic before Azure translates private IP addresses to public IP addresses. To match a VM, a rule must use its private IP. [S1][S7]
- For VMs in a load-balanced pool, the source port and address are those of the originating computer, not the load balancer. The destination port and address are those of the destination computer. [S1]
- When an NSG and a UDR apply to a subnet: inbound NSG rules are processed; for outbound traffic NSG outbound rules are processed, followed by UDR rules. [S13]

**Intra-subnet traffic**

- The subnet-before-NIC order (inbound) and NIC-before-subnet order (outbound) also applies to intra-subnet traffic. [S2]
- A subnet NSG affects traffic between VMs inside that subnet. By default, VMs in the same subnet communicate because of a default rule. If a rule that denies all inbound and outbound traffic is added to the subnet NSG, VMs in that subnet cannot reach each other. [S2]
- Inference (not stated verbatim): traffic between two VMs in the same subnet with a subnet NSG passes that NSG twice, once as outbound traffic of the source and once as inbound traffic of the destination. The docs say only that "the same order of evaluation applies"; see Uncertain, item U2. [S2]

**Traffic between peered VNets**

- NSGs in either peered VNet can block access to the other VNet or to subnets. Full connectivity is the default. [S15]
- The peering setting "Allow the peered virtual network to access 'vnet-1'" is selected by default. While it is selected, the `VirtualNetwork` service tag includes the virtual network and the peered virtual network. [S22]
- The REST property for this setting is `allowVirtualNetworkAccess`: "Whether the VMs in the local virtual network space would be able to access the VMs in remote virtual network space." [S19]
- The `VirtualNetwork` service tag covers: the VNet address space, all connected on-premises address spaces, peered virtual networks, virtual networks connected to a virtual network gateway, the virtual IP of the host, and address prefixes used on user-defined routes. "This tag might also contain default routes." [S8]
- Subnet peering exists: only selected subnets are peered instead of the whole address space. [S15]
- The docs describe no peering-specific evaluation order. Peered traffic is subject to the same order as any traffic: source NIC NSG and source subnet NSG (outbound), then destination subnet NSG and destination NIC NSG (inbound). This sequence is assembled from the per-direction rules above and is not stated in one sentence anywhere. [S2][S15]

**Rules evaluated before NSGs**

- Security admin rules from Azure Virtual Network Manager always have higher priority than NSG rules and are evaluated first. "Allow" admin rules continue to NSG evaluation. "Always allow" admin rules deliver the traffic and skip NSG rules. "Deny" admin rules block the traffic. Traffic that matches "Always allow" or "Deny" admin rules never reaches NSG rules. [S1]

### 2. Priorities

- Custom rule priority: an integer between 100 and 4096. Lower numbers have higher priority. Rules are processed in priority order and processing stops at the first match. [S1][S6][S16][S20]
- That range gives 3,997 possible priority values. (Arithmetic from the documented range.)
- Uniqueness, three wordings:
  - Overview: "You can't create two security rules with the same priority and direction." [S1]
  - Manage page (portal table): "A value between 100 and 4096 that is unique for all security rules within the NSG." [S6]
  - REST and swagger: "The priority number must be unique for each rule in the collection." [S16][S19]
  - See Uncertain, item U3.
- Microsoft recommends gaps between priorities, for example 100, 200, 300. [S6]
- Rules are matched on the five-tuple: source, source port, destination, destination port, protocol. [S1][S7]
- Rule name: unique within the NSG, up to 80 characters, begins with a word character, ends with a word character or `_`, may contain word characters, `.`, `-`, `_`. [S1][S6]
- Rule description: up to 140 characters. [S6][S16]

**Azure default rules**

Azure creates these rules in every NSG. They cannot be removed, but custom rules with a higher priority (lower number) override them. [S1][S6][S14]

| Direction | Name | Priority | Source | Source ports | Destination | Destination ports | Protocol | Access |
|---|---|---|---|---|---|---|---|---|
| Inbound | AllowVNetInBound | 65000 | VirtualNetwork | 0-65535 | VirtualNetwork | 0-65535 | Any | Allow |
| Inbound | AllowAzureLoadBalancerInBound | 65001 | AzureLoadBalancer | 0-65535 | 0.0.0.0/0 | 0-65535 | Any | Allow |
| Inbound | DenyAllInbound | 65500 | 0.0.0.0/0 | 0-65535 | 0.0.0.0/0 | 0-65535 | Any | Deny |
| Outbound | AllowVnetOutBound | 65000 | VirtualNetwork | 0-65535 | VirtualNetwork | 0-65535 | Any | Allow |
| Outbound | AllowInternetOutBound | 65001 | 0.0.0.0/0 | 0-65535 | Internet | 0-65535 | Any | Allow |
| Outbound | DenyAllOutBound | 65500 | 0.0.0.0/0 | 0-65535 | 0.0.0.0/0 | 0-65535 | Any | Deny |

Source of the table: [S1]. Names are spelled as on that page.

- In this table `Any` covers TCP, UDP and ICMP; `0.0.0.0/0` means all addresses; clients may show it as `*` or `Any`. [S1]
- The REST example response `DefaultSecurityRuleList.json` (API 2026-03-01) shows the same six rules with `*` for addresses and ports. It spells the names `AllowVnetInBound`, `AllowAzureLoadBalancerInBound`, `DenyAllInBound`, `AllowVnetOutBound`, `AllowInternetOutBound`, `DenyAllOutBound`. [S20] The troubleshooting page uses the same spelling. [S14] See Uncertain, item U4.
- In the REST model, default rules are in the read-only array `defaultSecurityRules`, separate from `securityRules`. [S19]

### 3. Augmented rules

**Fields that accept lists (REST `SecurityRulePropertiesFormat`, API 2026-03-01)** [S16][S19]

| Field | Type | Description in schema |
|---|---|---|
| `sourceAddressPrefix` | string | CIDR or source IP range; `*` matches all; default tags such as `VirtualNetwork`, `AzureLoadBalancer`, `Internet` can be used |
| `sourceAddressPrefixes` | string[] | "The CIDR or source IP ranges." |
| `sourceApplicationSecurityGroups` | ApplicationSecurityGroup[] | ASGs as source |
| `sourcePortRange` | string | integer or range between 0 and 65535; `*` matches all |
| `sourcePortRanges` | string[] | source port ranges |
| `destinationAddressPrefix` | string | as `sourceAddressPrefix` |
| `destinationAddressPrefixes` | string[] | "CIDR or destination IP ranges." |
| `destinationApplicationSecurityGroups` | ApplicationSecurityGroup[] | ASGs as destination |
| `destinationPortRange` | string | as `sourcePortRange` |
| `destinationPortRanges` | string[] | destination port ranges |
| `protocol` | enum, required | `Tcp`, `Udp`, `Icmp`, `Esp`, `Ah`, `*` |
| `access` | enum, required | `Allow`, `Deny` |
| `direction` | enum, required | `Inbound`, `Outbound` |
| `priority` | int32, required | 100–4096 |
| `description` | string | up to 140 characters |

- Augmented rules combine several ports and several explicit IP addresses and ranges in one rule, in the source, destination and port fields. [S1]
- Augmented rules exist only for NSGs created through the Resource Manager deployment model. [S1]
- The schema does not state how the singular and plural forms interact (for example, both set at once). See Uncertain, item U5.

**Service tags in one rule**

- Overview: "Augmented security rules allow specifying multiple individual IP addresses and ranges in a single rule. However, you can't specify multiple service tags or application groups in a single rule." [S1]
- Design guide: augmented rules support "multiple IPs and port ranges per rule, and up to 10 application security groups, but only one service tag per rule." [S7]
- Azure CLI `--source-address-prefixes`: "Space-separated list of CIDR prefixes or IP ranges. Alternatively, specify ONE of 'VirtualNetwork', 'AzureLoadBalancer', 'Internet' or '*' to match all IPs. Besides, it also supports all available Service Tags". [S18]
- Overview, same page: "combine augmented security rules with service tags or application security groups" to simplify maintenance. It does not say whether that means the same rule or separate rules. [S1]
- Service tags may be regional, for example `Storage.WestUS`, where the tag supports regional scope. The Service Tag Discovery API is the source of truth for the tags usable in NSG rules in a region; new data takes up to four weeks to reach all regions. [S8]
- Custom service tags cannot be created. [S7]

**Service tags mixed with IP prefixes**

- No primary source states whether a service tag may appear inside `sourceAddressPrefixes` or `destinationAddressPrefixes` together with CIDRs. The schema describes the arrays as CIDR or IP ranges only. See Uncertain, item U6. [S19]

**ASGs mixed with IP prefixes**

- Troubleshooting page: "A single rule can't combine ASG references with IP address ranges for the same source or destination." Resolution: "Use separate rules if you need to combine ASG and IP-based rules." [S11]
- The wording "for the same source or destination" leaves open whether an ASG source with an IP-prefix destination is valid in one rule. The ASG overview example uses `Internet` (service tag) as source with an ASG as destination in one rule. [S3] See Uncertain, item U7.
- Overview says "you can't specify multiple ... application groups in a single rule" [S1], while the limits page allows 10 ASGs per rule as source or destination [S5] and the design guide says "up to 10 application security groups" [S7]. The Azure CLI help for `--source-asgs` says "temporarily this argument only supports one application security group name or ID." [S18] See Uncertain, item U8.

**Protocol**

- One protocol value per rule. REST and CLI values: `Tcp`, `Udp`, `Icmp`, `Esp`, `Ah`, `*`. [S16][S18][S19]
- ESP and AH are not available in the portal, but can be set through ARM templates. [S1]
- The portal offers Any, TCP, UDP, ICMP; ICMP covers ICMPv4 and ICMPv6. [S6]
- The default-rules note says `Any` encompasses TCP, UDP and ICMP. Whether `*` also matches ESP, AH or other IP protocols is not stated. See Uncertain, item U9. [S1]
- No field for ICMP type or code exists in the schema. [S19]

**Port syntax**

- A single port (`80`), a range (`10000-10005`), a comma-separated mix (`80, 10000-10005`) in the portal, or `*` for any port. [S1][S6]
- REST: `sourcePortRange` / `destinationPortRange` take "Integer or range between 0 and 65535"; the plural fields are arrays of such strings. [S16][S19]
- CLI: space-separated list of ports or port ranges between 0 and 65535; `*` matches all. [S18]
- The overview and manage pages say the number of ports per rule is limited and point to the limits page [S1][S6]; the limits page lists no port limit [S5]. See Uncertain, item U10.

### 4. ASG constraints

- All network interfaces assigned to an ASG must exist in the same virtual network as the first network interface assigned to it. NICs from different VNets cannot join the same ASG. [S3][S7]
- If ASGs are the source and the destination of one NSG rule, the NICs of both ASGs must be in the same virtual network. Example from the docs: AsgLogic in VNet1 and AsgDb in VNet2 cannot be source and destination of the same rule. [S3][S6][S7]
- A NIC can be added only to ASGs "in the same virtual network and location as the NIC". [S23]
- The portal tells the user to select an ASG that exists in the same region as the network interface. [S6]
- Troubleshooting page, cause list: "The ASG and the NSG are in different virtual networks. Network interfaces in an ASG and the NSG that references them must exist in the same virtual network." Resolution: "Verify the ASG and NSG are in the same virtual network." [S11] An NSG is a regional resource and is not part of a VNet; it is associated with subnets and NICs [S2][S21]. See Uncertain, item U11.
- A NIC can be a member of several ASGs, up to the limit of 20 ASGs per IP configuration. ASG membership is set per IP configuration (`NetworkInterfaceIPConfiguration.applicationSecurityGroups`). [S3][S5][S19]
- An NSG rule that references an ASG applies only to NICs that are members of that ASG, even if the NSG is associated with the subnet. [S3]
- ASGs as source and destination in one rule: allowed, with the same-VNet condition above. The ASG overview example `Allow-Database-BusinessLogic` uses AsgLogic as source and AsgDb as destination. [S3]
- Peered VNet, other region, other subscription: no primary source states whether an NSG rule can reference an ASG whose members are in a peered VNet, in another region, or in another subscription. Facts that bound the question: ASG members must be in one VNet [S3]; the ASG must be in the NIC's region [S6][S23]; a NIC can only join a VNet in its own subscription and location [S23]. See Uncertain, item U11.
- Portal: an ASG cannot be assigned while creating a NIC; CLI and PowerShell can. The portal does not display a NIC's ASG membership; CLI and PowerShell do. [S23]

### 5. Platform traffic that NSGs do not filter

- DHCP, DNS, IMDS and health monitoring use the host's virtual IPs 168.63.129.16 and 169.254.169.254. "By default, these services aren't subject to the configured network security groups unless targeted by service tags specific to each service." To override, create deny rules with the service tags `AzurePlatformDNS`, `AzurePlatformIMDS`, `AzurePlatformLKM`. [S1]

**168.63.129.16 (WireServer)** [S9]

- Used in all regions and national clouds; the address does not change; only the Azure platform can source traffic from it; it is not subject to user-defined routes.
- VM Agent: outbound 80/tcp and 32526/tcp to 168.63.129.16. "The communication on these ports with 168.63.129.16 isn't subject to the configured network security groups."
- DNS: "By default DNS communication isn't subject to the configured network security groups unless targeted using the AzurePlatformDNS service tag." To block, an outbound deny rule to `AzurePlatformDNS` with source Any, ports `*`, protocol Any.
- Health probes from Azure Load Balancer originate from 168.63.129.16. The default rule allows them through the `AzureLoadBalancer` tag. Blocking them makes probes fail.

**IMDS 169.254.169.254**

- Non-routable; reachable only from inside the VM; traffic never leaves the host. [S10]
- Not subject to NSGs by default; the outbound tag `AzurePlatformIMDS` can deny it. [S1][S8]

**DNS**

- `AzurePlatformDNS`: the default infrastructure DNS. Recommended direction: outbound. Not regional. Microsoft warns to test before use. [S8]
- Name-resolution page: "After custom DNS servers are set on a network, the traffic through port 53 bypasses the NSGs of the subnet and the NIC." Same paragraph: NSGs act as firewalls for DNS resolver endpoints and must allow UDP 53 (optionally TCP 53) to the listener endpoints. See Uncertain, item U12. [S24]

**KMS (Windows licensing)**

- Windows VMs send activation requests outbound on port 1688 to KMS host servers. "For deployments using default route 0.0.0.0/0 configuration, this platform rule is disabled." [S1]
- `AzurePlatformLKM`: Windows licensing or key management service. Recommended direction: outbound. Not regional. [S8]
- Azure Global KMS: `azkms.core.windows.net` and `kms.core.windows.net`, IPs 20.118.99.224 and 40.83.235.53. Activation requests must come from an Azure public IP; forced tunneling breaks activation unless a custom route sends KMS traffic to the internet. [S25]
- See Uncertain, item U13.

**Load balancer health probes**

- All IPv4 probes originate from 168.63.129.16. IPv6 probes use the link-local source `fe80::1234:5678:9abc`. For a dual-stack load balancer, an NSG must be configured for the IPv6 probe to work. [S26]
- 168.63.129.16 must be allowed in NSGs and local firewalls; the `AzureLoadBalancer` tag identifies it and the default rule allows it. [S26]
- `AzureLoadBalancer` tag: translates to 168.63.129.16; it includes only probe traffic, not real traffic to the backend. [S8]
- Blocking the probe IP or port with NSG rules "is an unsupported scenario and can cause the NSG rules to take delayed effect". [S26]

**Other platform facts**

- Outbound SMTP port 25 is blocked for many subscription types (pay-as-you-go, MSDN, Free trial, CSP and others) independent of NSG rules. [S1]
- Services deployed into subnets (for example HDInsight, App Service Environment, VM Scale Sets) need certain ports; denying them breaks the service. [S1]

### 6. Statefulness

- NSGs are stateful. A flow record is created for existing connections; traffic is allowed or denied based on the connection state of the flow record. An outbound allow needs no inbound rule for the response, and vice versa. [S1]
- "When you remove a security rule that allowed a connection, existing connections remain uninterrupted. Network security group rules only affect new connections. New or updated rules in a network security group apply exclusively to new connections". Example: an open SSH session survives removal of the allow rule; a new SSH connection is blocked. [S1]
- NSG property `flushConnection` (boolean): "When enabled, flows created from Network Security Group connections will be re-evaluated when rules are updates. Initial enablement will trigger re-evaluation." Present in API 2026-03-01 and in the Bicep/ARM/Terraform AzAPI reference. [S17][S19]
- PowerShell `New-AzNetworkSecurityGroup -FlushConnection` enables it at creation. [S27]
- The NSG overview does not mention `flushConnection`. See Uncertain, item U14. [S1]
- Flow timeout settings determine how long a flow record remains active; the overview points to NSG flow logs for configuration. NSG flow logs retire on 2027-09-30 and no new ones can be created; VNet flow logs replace them. [S1][S14]
- Concurrent TCP or UDP flows per NIC of a VM: 500,000. [S5]

### 7. Limits

The networking limits table on the subscription limits page applies "only for networking resources managed through Azure Resource Manager per region per subscription". Its note: "We have increased all default limits to their maximum limits. If there's no maximum limit column, the resource doesn't have adjustable limits." The NSG and ASG table has no maximum-limit column. [S5]

Current usage against these limits can be read per region with the REST operation Usages - List. [S28]

## Table of limits

| Limit | Value | Adjustable | Source |
|---|---|---|---|
| Network security groups (per subscription per region) | 5,000 | No (table has no maximum column; defaults already raised to maximum) | [S5] |
| NSG rules per NSG | 2,000 | No | [S5] |
| IP addresses and ranges specified for source or destination in a security group (applies separately to source and destination) | 6,000 | No | [S5] |
| Application security groups (per subscription per region) | 3,000 | No | [S5] |
| ASGs per IP configuration, per NIC | 20 | No | [S5] |
| ASGs referenced as source/destination per NSG rule | 10 | No | [S5] |
| ASGs within all security rules of one NSG | 100 | No | [S5] |
| IP configurations per ASG | 4,000 | No | [S5] |
| Service tags per rule | 1 (documented as a rule, not listed as a limit) | Not stated | [S1][S7] |
| Ports or port ranges per rule | Not published | Not stated | [S1][S5] |
| NSGs per subnet / per NIC | 1 / 1 | No | [S2][S7][S12] |
| Custom rule priority range | 100–4096 | No | [S1][S16] |
| Rule name length | 80 characters | No | [S1][S6] |
| Rule description length | 140 characters | No | [S6][S16] |
| Network interface cards (per subscription per region) | 65,536 | No | [S5] |
| Subnets per virtual network | 3,000 | No | [S5] |
| Virtual network peerings per virtual network | 650 | No | [S5] |
| Concurrent TCP or UDP flows per NIC | 500,000 | No | [S5] |
| NSGs (classic deployment model) | 200 | No (maximum 200) | [S5] |
| NSG rules per NSG (classic deployment model) | 200 default | Yes, up to 1,000 | [S5] |

Divergent values in other Microsoft pages:

- Design guide: "NICs per ASG — Varies by subscription — Contact support", while the limits page lists 4,000 IP configurations per ASG. [S5][S7]
- Design guide: "The limit of 2,000 rules for each NSG includes both custom rules and default rules." The limits page does not say this. [S5][S7]
- Design guide lists "NSGs per subscription 5,000" and "ASGs per subscription 3,000" without "per region"; the limits page says per region per subscription. [S5][S7]
- Manage page: "Azure limits the number of rules per NSG that you can create for each Azure location and subscription." [S6]

## Uncertain — candidates for an empirical check

- **U1. No NSG at all.** How-it-works says traffic to VM4 is blocked when neither subnet nor NIC has an NSG and ties this to "standard public IP ... secure by default", yet says outbound traffic from VM4 flows freely and VM3 receives traffic without a subnet NSG. Check: VM-to-VM traffic inside a VNet with no NSG on either side, and inbound from the internet to a Standard public IP with no NSG. [S2]
- **U2. Intra-subnet path.** Check that traffic between two VMs in the same subnet is evaluated against the subnet NSG's outbound rules (source) and inbound rules (destination), and that a subnet-level deny-all at a custom priority blocks intra-subnet traffic. [S2]
- **U3. Priority uniqueness scope.** "Same priority and direction" [S1] vs. "unique for all security rules within the NSG" [S6] vs. "unique for each rule in the collection" [S16][S19]. Check: create an inbound and an outbound rule with the same priority in one NSG.
- **U4. Default rule names.** `AllowVNetInBound` / `DenyAllInbound` [S1][S7] vs. `AllowVnetInBound` / `DenyAllInBound` [S14][S20]. Check: read `defaultSecurityRules` of a new NSG through the API.
- **U5. Singular vs. plural fields.** Behaviour when both `sourceAddressPrefix` and `sourceAddressPrefixes` (or port equivalents) are set, and how the API returns a rule created with one list element. [S19]
- **U6. Service tag inside a prefix list.** Whether `sourceAddressPrefixes` / `destinationAddressPrefixes` accept a service tag together with CIDRs, and whether two service tags in one array are rejected. [S1][S7][S18][S19]
- **U7. ASG plus prefix on different sides.** Whether ASG as source with CIDR or service tag as destination (and the reverse) is valid in one rule; whether ASG plus CIDR on the same side is rejected by the API. [S3][S11]
- **U8. Several ASGs per side.** Overview says multiple ASGs per rule are not possible; limits page and design guide say 10; CLI help says only one "temporarily". Check: create a rule with 2 and with 10 ASGs in `sourceApplicationSecurityGroups`. [S1][S5][S7][S18]
- **U9. Protocol `*`.** Whether `*` matches ESP, AH and other IP protocols, or only TCP, UDP and ICMP. [S1]
- **U10. Port limits.** Maximum number of entries in `sourcePortRanges` / `destinationPortRanges`. [S1][S5]
- **U11. ASG scope across VNets, regions, subscriptions.** Whether an NSG associated with a subnet in VNet A can reference, in a single-sided rule, an ASG whose members are in peered VNet B (same region; other region; other subscription); whether the ASG resource may live in a different subscription from the NIC or NSG; and what "the ASG and the NSG are in different virtual networks" means for an NSG that is not part of any VNet. [S3][S6][S11][S23]
- **U12. DNS to custom DNS servers.** Whether port 53 traffic to customer DNS servers bypasses NSGs, as one sentence says, or is filtered, as the same paragraph implies. [S24]
- **U13. KMS platform rule.** What "this platform rule is disabled" with a 0.0.0.0/0 default route means, and whether KMS traffic is otherwise filtered by NSGs or only by `AzurePlatformLKM` deny rules. [S1][S8][S25]
- **U14. `flushConnection`.** Default value; whether re-evaluation drops flows that the new rules deny; time to take effect; whether it applies when the change is a rule-level PUT or only an NSG-level PUT. [S17][S19][S27]
- **U15. Effect delay of rule changes.** The load balancer page says blocking probes can make NSG rules "take delayed effect". No page gives a propagation time for ordinary rule changes. [S26]
- **U16. 6,000 addresses "in a security group".** Whether the limit counts per rule or per NSG, and how a service tag or an ASG counts against it. [S5]
- **U17. 2,000 rules per NSG.** Whether the six default rules count against the 2,000, as the design guide says. [S5][S7]
- **U18. IP configurations per ASG.** 4,000 [S5] vs. "varies by subscription" [S7].
- **U19. Mixed address families.** No source states whether IPv4 and IPv6 prefixes can be mixed in one rule. Not researched further.

## Facts that open design tickets depend on

- Custom priorities are 100–4096 (3,997 values); first match wins; uniqueness is at least per direction and may be per NSG (U3). [S1][S6][S16]
- Default rules at 65000/65001/65500 cannot be deleted; `AllowVNetInBound` / `AllowVnetOutBound` allow all `VirtualNetwork` traffic, which includes peered VNets, gateway-connected networks, on-premises space and UDR prefixes. [S1][S8][S22]
- Inbound order is subnet NSG then NIC NSG; outbound order is NIC NSG then subnet NSG; both must allow. [S2][S14]
- A subnet NSG filters intra-subnet traffic; a deny-all in it stops VMs in the same subnet from talking. [S2]
- NSG must be in the same subscription and location as the VNet of the subnet it is associated with. [S21]
- One NSG per subnet and per NIC; one NSG can serve many subnets and NICs. [S2][S12]
- Security admin rules of Azure Virtual Network Manager are evaluated before NSG rules and can end evaluation. [S1]
- REST lists exist for address prefixes, port ranges and ASGs, per side; protocol is a single value. [S19]
- Learn documents at most one service tag per rule and no mixing of ASGs with IP ranges on the same side. [S1][S7][S11]
- ASG members must share one VNet; ASG-to-ASG rules need all members in one VNet; ASG and NIC must share a region. [S3][S6][S23]
- Platform traffic to 168.63.129.16 and 169.254.169.254 bypasses NSGs except through `AzurePlatformDNS`, `AzurePlatformIMDS`, `AzurePlatformLKM` deny rules and the `AzureLoadBalancer` tag. [S1][S9]
- An explicit inbound deny-all that does not exempt `AzureLoadBalancer` blocks health probes; IPv6 probes come from `fe80::1234:5678:9abc`. [S9][S26]
- Rule changes affect only new connections unless `flushConnection` is enabled on the NSG. [S1][S17]
- Limits per subscription per region: 5,000 NSGs, 2,000 rules per NSG, 6,000 addresses and ranges per side "in a security group", 3,000 ASGs, 10 ASGs per rule, 100 ASGs per NSG, 20 ASGs per IP configuration, 4,000 IP configurations per ASG; all non-adjustable. [S5]

## Sources

All retrieved on 2026-11-09. "Updated" is the page date shown on that day.

| ID | Title | URL | Updated |
|---|---|---|---|
| S1 | Azure network security groups overview | https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview | 2025-07-15 |
| S2 | How network security groups filter network traffic | https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works | 2025-07-29 |
| S3 | Application security groups | https://learn.microsoft.com/en-us/azure/virtual-network/application-security-groups | 2025-07-25 |
| S5 | Azure subscription and service limits, quotas, and constraints — Azure networking limits | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits | 2026-08-04 |
| S6 | Create, change, or delete a network security group | https://learn.microsoft.com/en-us/azure/virtual-network/manage-network-security-group | 2025-07-26 |
| S7 | Network security groups and application security groups (design guide) | https://learn.microsoft.com/en-us/azure/networking/design-guide/network-application-security-groups | 2026-07-01 |
| S8 | Virtual network service tags | https://learn.microsoft.com/en-us/azure/virtual-network/service-tags-overview | 2026-09-16 |
| S9 | What is IP address 168.63.129.16? | https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16 | 2025-07-25 |
| S10 | Azure Instance Metadata Service | https://learn.microsoft.com/en-us/azure/virtual-machines/instance-metadata-service | 2025-07-29 |
| S11 | Troubleshoot NSG misconfigurations that block traffic (ASG section) | https://learn.microsoft.com/en-us/troubleshoot/azure/virtual-network/virtual-network-troubleshoot-nsg-blocking-traffic | 2026-08-03 |
| S12 | Diagnose a virtual machine network traffic filter problem | https://learn.microsoft.com/en-us/azure/virtual-network/diagnose-network-traffic-filter-problem | 2026-10-08 |
| S13 | Azure Virtual Network FAQ | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq | 2026-07-08 |
| S14 | Troubleshoot NSG misconfigurations that block traffic (evaluation, default rules) | https://learn.microsoft.com/en-us/troubleshoot/azure/virtual-network/virtual-network-troubleshoot-nsg-blocking-traffic | 2026-08-03 |
| S15 | Azure virtual network peering | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-peering-overview | 2026-10-20 |
| S16 | Security Rules - Create Or Update (REST, api-version 2026-01-01) | https://learn.microsoft.com/en-us/rest/api/virtualnetwork/security-rules/create-or-update | page metadata 2026-10-23 |
| S17 | Microsoft.Network/networkSecurityGroups — Bicep, ARM template and Terraform AzAPI reference | https://learn.microsoft.com/en-us/azure/templates/microsoft.network/networksecuritygroups | 2024-12-09 (lists API versions up to 2026-03-01) |
| S18 | az network nsg rule (Azure CLI) | https://learn.microsoft.com/en-us/cli/azure/network/nsg/rule?view=azure-cli-latest | page metadata 2026-10-14 |
| S19 | azure-rest-api-specs, `virtualNetwork.json` and `common.json`, stable 2026-03-01 (definitions `SecurityRulePropertiesFormat`, `SecurityRuleProtocol`, `NetworkSecurityGroupPropertiesFormat`, `NetworkInterfaceIPConfigurationPropertiesFormat`, `VirtualNetworkPeeringPropertiesFormat`), last commit on `virtualNetwork.json` 2026-10-09 (`027ab51`) | https://github.com/Azure/azure-rest-api-specs/tree/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01 | 2026-10-09 |
| S20 | azure-rest-api-specs example `DefaultSecurityRuleList.json`, stable 2026-03-01 | https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/examples/DefaultSecurityRuleList.json | 2026-10-09 |
| S21 | Add, change, or delete a virtual network subnet | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-subnet | 2025-07-29 |
| S22 | Create, change, or delete an Azure virtual network peering | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-peering | 2025-07-29 |
| S23 | Create, change, or delete a network interface | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-network-interface | 2025-07-28 |
| S24 | Name resolution for resources in Azure virtual networks | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-name-resolution-for-vms-and-role-instances | 2025-07-24 |
| S25 | Windows activation fails in forced tunneling scenario (KMS) | https://learn.microsoft.com/en-us/troubleshoot/azure/virtual-machines/windows/custom-routes-enable-kms-activation | 2026-09-10 |
| S26 | Azure Load Balancer health probes | https://learn.microsoft.com/en-us/azure/load-balancer/load-balancer-custom-probe-overview | 2026-09-10 |
| S27 | New-AzNetworkSecurityGroup (Az.Network) | https://learn.microsoft.com/en-us/powershell/module/az.network/new-aznetworksecuritygroup | page metadata 2026-10-01 |
| S28 | Usages - List (REST) | https://learn.microsoft.com/en-us/rest/api/virtualnetwork/usages/list | page metadata 2026-10-23 |

Notes on method:

- Every fact above comes from the listed pages as fetched on 2026-11-09. No blog, forum or Microsoft Q&A answer is used as a source.
- Assumption: where the REST reference page (api-version 2026-01-01) and the swagger (2026-03-01) agree, the fact holds for both versions. No difference between them was found for the fields above.
- [S11] and [S14] are the same page, cited under two IDs for its two sections.
