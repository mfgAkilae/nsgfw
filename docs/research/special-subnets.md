# Research: Special subnets and mandatory platform rules

Ticket: GitHub issue #3, "Research: Special subnets and mandatory platform rules".
Retrieval date for every source: 2026-11-09. All sources are Microsoft Learn pages unless marked otherwise.

## Question

Which Azure subnet types cannot carry an NSG, or need specific NSG rules to keep working, and what do Microsoft docs require for each?

Scope (from the ticket): GatewaySubnet, AzureFirewallSubnet, AzureFirewallManagementSubnet, AzureBastionSubnet, RouteServerSubnet; Application Gateway v2, API Management, SQL Managed Instance, AKS, App Service Environment, Azure Databricks, Azure NetApp Files and other delegated subnets; private endpoints and `privateEndpointNetworkPolicies`; the outbound traffic that typical workloads need once a deny-all outbound rule exists.

## Summary

- **NSG not supported:** GatewaySubnet (VPN and ExpressRoute gateways) and RouteServerSubnet. On AzureFirewallSubnet, subnet-level NSGs are "disabled". For AzureFirewallManagementSubnet, Microsoft Learn says nothing; only a Microsoft Q&A answer says that NSGs are not supported (unverified). Azure NetApp Files subnets with *Basic* network features also do not take an NSG.
- **NSG required by the service:** SQL Managed Instance, API Management (classic tiers with VNet injection, and the v2 tiers with VNet injection or integration), Azure Databricks (the service provisions the NSG rules).
- **Azure writes rules into the customer's NSG:** SQL Managed Instance (network intent policy, reserved rule-name prefix, non-compliant changes are rejected) and Azure Databricks (the service auto-provisions and manages its rules through delegation). Delegation in general lets a service add "Network Intent Policies" that can block changes at PUT time.
- **NSG allowed, but the docs forbid a deny-all outbound rule:** Application Gateway v2 without network isolation. Azure rejects such a rule with an error. With "private Application Gateway deployment" (network isolation), deny-all outbound is allowed, and only the AzureLoadBalancer inbound rule is required.
- **NSG allowed with a full documented rule set:** AzureBastionSubnet, App Service Environment v3, AKS, Azure Container Apps, PostgreSQL and MySQL flexible server, and others (tables below).
- **Private endpoints:** NSG rules apply to private endpoint traffic only when `privateEndpointNetworkPolicies` is `Enabled` or `NetworkSecurityGroupEnabled`. The docs say that network policies are disabled by default.
- **Platform traffic outside NSGs:** DHCP, DNS, IMDS and health monitoring via 168.63.129.16 and 169.254.169.254 are not subject to NSGs, unless the AzurePlatformDNS, AzurePlatformIMDS or AzurePlatformLKM service tags target them. Many workload dependencies are documented only as FQDNs (Windows Update, AKS, parts of API Management). NSG rules cannot express FQDNs.

## General NSG facts that apply to every table

| Fact | Source |
|---|---|
| Custom rule priority is 100–4096. Default rules use 65000, 65001 and 65500 in both directions. Default rules can't be removed, only overridden by higher-priority rules. | [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) |
| A rule's source or destination can be Any, an IP address, a CIDR block, a service tag or an ASG. FQDNs are not in this list. | [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) |
| Augmented rules allow several IP addresses and ranges, and several ports, in one rule. However, "you can't specify multiple service tags or application groups in a single rule". | [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) |
| Rule changes affect only new connections. Existing flows continue. | [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) |
| Inbound: the subnet NSG is evaluated first, then the NIC NSG. Outbound: NIC NSG first, then subnet NSG. The same order applies to intra-subnet traffic. A deny-all rule in a subnet NSG blocks traffic between VMs in the same subnet. | [How NSGs filter traffic](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works) |
| "Virtual IP of the host node": DHCP, DNS, IMDS and health monitoring use 168.63.129.16 and 169.254.169.254. "By default, these services aren't subject to the configured network security groups unless targeted by service tags specific to each service" (AzurePlatformDNS, AzurePlatformIMDS, AzurePlatformLKM). | [NSG overview, "Azure platform considerations"](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) |
| The VM agent talks to WireServer (168.63.129.16) on TCP 80 and 32526. This traffic "isn't subject to the configured network security groups". DNS to 168.63.129.16 is not subject to NSGs unless a rule targets the AzurePlatformDNS tag. | [IP address 168.63.129.16](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16) |
| Load Balancer health probes come from 168.63.129.16. The AzureLoadBalancer tag stands for this address and covers probe traffic only. The default rule AllowAzureLoadBalancerInBound allows it. If an NSG blocks it, probes fail. | [IP address 168.63.129.16](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16), [Service tags](https://learn.microsoft.com/en-us/azure/virtual-network/service-tags-overview) |
| Windows licensing: KMS requests leave on port 1688. "For deployments using default route 0.0.0.0/0 configuration, this platform rule is disabled." | [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) |
| The VirtualNetwork service tag contains the VNet address space, connected on-premises ranges, peered VNets, the host virtual IP, "and address prefixes used on user-defined routes. This tag might also contain default routes." | [Service tags](https://learn.microsoft.com/en-us/azure/virtual-network/service-tags-overview) |
| Outbound TCP port 25 is blocked for most subscription types, independent of NSGs. | [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) |
| Standard Load Balancers and Standard public IPs are closed to inbound traffic by default. An NSG must permit the traffic. "Traffic is blocked if no NSG exists on a subnet or NIC." | [Load Balancer overview](https://learn.microsoft.com/en-us/azure/load-balancer/load-balancer-overview) |
| Azure Virtual Network Manager (AVNM) security admin rules are evaluated before NSG rules. "Always allow" and "Deny" admin rules end evaluation, so the NSG never sees that traffic. | [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) |
| By default, AVNM security admin rules are not applied to VNets that contain SQL Managed Instance or Azure Databricks; the docs say that "the service's network intent policy enforces these requirements". Admin rules also skip subnets with Application Gateway (without network isolation), Bastion, Azure Firewall, Route Server, VPN Gateway, Virtual WAN and ExpressRoute Gateway. | [AVNM security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins) |
| Subnet delegation lets a service "Add to the service a set of Network Intent Policies post deployment". These policies ensure that "any actions that can affect functioning of the injected service can be blocked at PUT". | [Subnet delegation overview](https://learn.microsoft.com/en-us/azure/virtual-network/subnet-delegation-overview) |
| A complete list of delegations is available from the "Available Delegations API". | [Services deployable into a VNet](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-for-azure-services) |

## Platform subnets

### GatewaySubnet (VPN Gateway and ExpressRoute gateway)

| Aspect | Finding |
|---|---|
| NSG status | **Not supported.** "NSGs on the gateway subnet aren't supported. Associating a network security group to this subnet might cause your virtual network gateway (VPN and ExpressRoute gateways) to stop functioning as expected." |
| Mandatory inbound rules | Not applicable (no NSG). |
| Mandatory outbound rules | Not applicable. The docs add: "Gateways require access to the management controllers in order to function properly." UDRs with 0.0.0.0/0 on the gateway subnet are also not supported. |
| Rules Azure adds itself | None documented. |
| Sources | [ExpressRoute virtual network gateways, "Gateway subnet"](https://learn.microsoft.com/en-us/azure/expressroute/expressroute-about-virtual-network-gateways), [VPN Gateway settings, "Gateway subnet"](https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-about-vpn-gateway-settings) |

### AzureFirewallSubnet

| Aspect | Finding |
|---|---|
| NSG status | **Not supported (disabled).** "Azure Firewall is a managed service with multiple protection layers, including platform protection with NIC-level NSGs (not viewable). Subnet-level NSGs aren't required on the AzureFirewallSubnet and are disabled to prevent service interruptions." The security baseline says the same. |
| Mandatory inbound / outbound rules | Not applicable. |
| Rules Azure adds itself | Platform NIC-level NSGs that the customer can't see. |
| Sources | [Azure Firewall FAQ](https://learn.microsoft.com/en-us/azure/firewall/firewall-faq), [Azure Firewall security baseline](https://learn.microsoft.com/en-us/security/benchmark/azure/baselines/azure-firewall-security-baseline) |

### AzureFirewallManagementSubnet

| Aspect | Finding |
|---|---|
| NSG status | **Not documented on Microsoft Learn (unverified).** The only statement found is in a Microsoft Q&A thread (community answer, secondary source): attaching an NSG failed with an error, and the responder states that the subnet does not support NSG association. |
| Related documented constraints | Minimum size /26. The service associates a system-provided route table. "The only route allowed on this subnet is a default route to the Internet". Gateway route propagation must be disabled. Basic SKU and Secured Hub firewalls always have a management NIC. |
| Mandatory inbound / outbound rules | Not documented. |
| Rules Azure adds itself | System-provided route table (route, not NSG rule). |
| Sources | [Azure Firewall Management NIC](https://learn.microsoft.com/en-us/azure/firewall/management-nic), [Microsoft Q&A thread (secondary, unverified)](https://learn.microsoft.com/en-us/answers/questions/5918576/nist-800-171-rev-2-policy-assignment-error-subnets) |

### AzureBastionSubnet

| Aspect | Finding |
|---|---|
| NSG status | **Allowed.** "If you apply an NSG, you must configure all required ingress and egress rules. Omitting any rule can prevent Bastion from receiving platform updates and block VM connectivity." |
| Mandatory inbound rules | TCP 443 from `Internet` (or specific public IPs); TCP 443 from `GatewayManager`; ports 8080 and 5701 (any protocol) from `VirtualNetwork` to `VirtualNetwork`; TCP 443 from `AzureLoadBalancer`. Ports 3389 and 22 are not required inbound on AzureBastionSubnet. |
| Mandatory outbound rules | Ports 22 and 3389 to `VirtualNetwork` (or to the target VM subnets; with the custom-port feature, use `VirtualNetwork`); ports 8080 and 5701 `VirtualNetwork` to `VirtualNetwork`; TCP 443 to `AzureCloud`; port 80 to `Internet` (session validation, shareable link, certificate validation). |
| Target VM subnet | Inbound 3389 and 22 (or custom ports) from the AzureBastionSubnet range. |
| Private-only Bastion | "Ensure your network security rules do not block port 443 access to the AzureBastionSubnet for inbound Virtual Network traffic." |
| Rules Azure adds itself | None documented. |
| Sources | [Configure NSG rules for Azure Bastion](https://learn.microsoft.com/en-us/azure/bastion/bastion-nsg), [Bastion private-only deployment](https://learn.microsoft.com/en-us/azure/bastion/private-only-deployment) |

### RouteServerSubnet

| Aspect | Finding |
|---|---|
| NSG status | **Not supported.** "No, Azure Route Server doesn't support network security group association to the RouteServerSubnet subnet." UDRs are also not supported. |
| Mandatory inbound / outbound rules | Not applicable. |
| Rules Azure adds itself | None documented. |
| Sources | [Azure Route Server FAQ](https://learn.microsoft.com/en-us/azure/route-server/route-server-faq) |

## Services in dedicated or delegated subnets

### Application Gateway v2

| Aspect | Finding |
|---|---|
| NSG status | **Allowed with restrictions.** The restrictions are relaxed for "private Application Gateway deployment" (feature `EnableApplicationGatewayNetworkIsolation` in `Microsoft.Network`, generally available although the portal labels it preview). |
| Platform ports | "Application gateways use TCP ports 65502 and 54321, and UDP port 12345, for Azure platform health monitoring and operations. Ensure that NSGs ... don't block this traffic." Direction and source are not stated. |
| Mandatory inbound rules (standard deployment) | Client traffic to the listener ports (destination: the gateway subnet prefix; also the frontend IPs if public and private listeners share a port). `GatewayManager` to any destination on TCP 65200–65535 (v2; v1 uses 65503–65534). `AzureLoadBalancer` any; "You must not override it with a manual Deny rule". After these: "You can block all other incoming traffic by using a Deny All rule." |
| Mandatory outbound rules (standard deployment) | Outbound to `Internet` for all destinations. "Outbound NSG rules that deny any outbound connectivity must not be created." Azure rejects such a rule: "Failed to create security rule 'DenyAnyCustomAnyOutbound'. Error: Network security group <NSG-name> blocks outgoing Internet traffic on subnet <AppGWSubnetId>, associated with Application Gateway <AppGWResourceId>. This isn't permitted for Application Gateways that have fast update enabled or have V2 Sku." |
| Private deployment (network isolation) | NSGs "no longer require inbound rules for GatewayManager, and they don't require outbound access to the Internet. The only required rule is Allow inbound from AzureLoadBalancer". A deny-all outbound rule is supported. Gateways created before the feature was registered keep the old behaviour. A subnet that mixes old and new gateways keeps the restrictions. |
| Rules Azure adds itself | None documented. Azure validates NSG rules (see the error above). |
| Sources | [Application Gateway infrastructure configuration](https://learn.microsoft.com/en-us/azure/application-gateway/configuration-infrastructure), [Private Application Gateway deployment](https://learn.microsoft.com/en-us/azure/application-gateway/application-gateway-private-deployment) |

### API Management, classic tiers (Developer, Premium) with VNet injection

| Aspect | Finding |
|---|---|
| NSG status | **Required.** "It is required to assign a Network Security Group to your VNet in order for the Azure Load Balancer to work." The docs recommend service tags over IP addresses. |
| Mandatory inbound rules (bold "required" in the source) | `Internet` to `VirtualNetwork` TCP [80], 443 (external mode only); `ApiManagement` to `VirtualNetwork` TCP 3443 (management endpoint); `AzureLoadBalancer` to `VirtualNetwork` TCP 6390 (Azure infrastructure load balancer). For the Developer SKU, AzureLoadBalancer inbound is not required; it becomes critical for Premium. |
| Mandatory outbound rules (bold "required") | `Internet` TCP 80 (certificate validation and management); `Storage` TCP 443; `Sql` TCP 1433; `AzureKeyVault` TCP 443; `AzureMonitor` TCP 1886, 443. Storage, Sql and EventHub may use the regional tag of the instance region (plus the primary region in multi-region deployments). |
| Optional rules | `AzureActiveDirectory` 443, `AzureConnectors` 443, `EventHub` 5671/5672/443, `AzureTrafficManager` inbound 443 (multi-region, external), VNet-internal 10000, 6381–6383, UDP 4290, `AzureLoadBalancer` 6391. |
| FQDN-only dependencies | TLS chain validation (ports 80/443 to mscrl.microsoft.com, crl.microsoft.com, oneocsp.microsoft.com, cacerts.digicert.com, crl3.digicert.com, csp.digicert.com), DNS port 53, NTP UDP 123, Windows Update and Windows Defender FQDNs, internal diagnostics FQDNs, issuer.pki.azure.com. |
| Rules Azure adds itself | None documented. |
| Source | [API Management VNet configuration reference](https://learn.microsoft.com/en-us/azure/api-management/virtual-network-reference) |

### API Management, v2 tiers

| Aspect | Finding |
|---|---|
| Premium v2 with VNet injection | NSG **required** ("You must associate a network security group (NSG) with the subnet"). Mandatory outbound: `VirtualNetwork` to `AzureKeyVault` TCP 443. The docs explicitly allow NSG rules that "block outbound traffic to the internet". Delegation: `Microsoft.ApiManagement/service`. |
| Standard v2 / Premium v2 with VNet integration (outbound only) | NSG **required**; same Key Vault outbound rule. "Inbound NSG rules do not apply when a v2 tier instance is integrated in a virtual network". Delegation: `Microsoft.ApiManagement/service` (Premium v2) or `Microsoft.Web/serverFarms` (Standard v2). |
| Rules Azure adds itself | None documented. |
| Sources | [Inject APIM into a VNet (Premium v2)](https://learn.microsoft.com/en-us/azure/api-management/inject-vnet-v2), [Integrate APIM with a VNet for outbound connections](https://learn.microsoft.com/en-us/azure/api-management/integrate-vnet-outbound) |

### SQL Managed Instance

| Aspect | Finding |
|---|---|
| NSG status | **Required.** "A network security group must be associated with the SQL Managed Instance subnet." A route table is required too. The subnet is dedicated and delegated to `Microsoft.Sql/managedInstances`. |
| Mandatory inbound rules | Created and enforced by the service (see below). For clients: VNet-local endpoint TCP 1433, public endpoint TCP 3342, each "across the entire subnet range". |
| Mandatory outbound rules | Created and enforced by the service (see below). |
| Rules Azure adds itself | **Network intent policy** ("service-aided subnet configuration"). It is applied when the subnet is first delegated and removed with the last instance. Mandatory rules: `Microsoft.Sql-managedInstances_UseOnly_mi-healthprobe-in` (inbound), `…_mi-internal-in` (inbound), `…_mi-internal-out` (outbound), plus a route `…_mi-subnet-<range>-to-vnetlocal`. Optional: `Microsoft.Sql-managedInstances_UseOnly_mi-optional-azure-out` (outbound HTTPS to Azure), to be retired. Ports, sources and priorities of these rules are not documented. |
| Behaviour on change | "When you change the subnet's route table or update its network security group rules, the associated network intent policy checks if the effective routes and security rules comply ... If they don't, the network intent policy raises an error, preventing the change." The prefix `Microsoft.Sql-managedInstances_UseOnly_mi-` is reserved; "Service updates might delete all rules and routes with that prefix". Microsoft advises a separate NSG and route table per delegated subnet. |
| Other constraints | Peered VNets with MI subnets must use different NSGs and route tables, otherwise management fails. IPv6 prefixes in the NSG make the instance unavailable. Blocking the AzurePlatformDNS tag might make the instance unavailable. Azure Policy must not deny `Microsoft.Network/networkIntentPolicies`. |
| Sources | [SQL MI connectivity architecture](https://learn.microsoft.com/en-us/azure/azure-sql/managed-instance/connectivity-architecture-overview), [Service-aided subnet configuration](https://learn.microsoft.com/en-us/azure/azure-sql/managed-instance/subnet-service-aided-configuration-enable?view=azuresql) |

### Azure Kubernetes Service (AKS)

| Aspect | Finding |
|---|---|
| NSG status | **Allowed.** "AKS doesn't apply network security groups to its subnet or modify network security groups that you associate with a customer-provided subnet." The customer NSG must allow the node and pod traffic. |
| Mandatory inbound / intra-cluster rules | Node CIDR ↔ node CIDR, node CIDR → pod CIDR, pod CIDR ↔ pod CIDR: all ports and protocols (Azure CNI Overlay: pod traffic is not encapsulated, so subnet NSG rules apply). API Server VNet Integration: cluster subnet → API server subnet TCP 443 and 4443; Azure Load Balancer → API server subnet TCP 9988. |
| Mandatory outbound rules | UDP 1194 and TCP 9000 to `AzureCloud.<Region>` (not needed for private clusters or with konnectivity-agent); UDP 123 (NTP; not needed for nodes provisioned after March 2021); TCP and UDP 53 to custom DNS servers; TCP 443 to the API server public IP when pods call the API server. FQDN-only: `*.hcp.<location>.azmk8s.io`, `mcr.microsoft.com`, `*.data.mcr.microsoft.com`, `mcr-0001.mcr-msedge.net`, `management.azure.com`, `login.microsoftonline.com`, `packages.microsoft.com`, `acs-mirror.azureedge.net` / `packages.aks.azure.com`. |
| Rules Azure adds itself | Azure creates NSG rules for Kubernetes `LoadBalancer` services "on resources managed by AKS". With kubenet, AKS creates its own NSG and associates it "with the virtual NICs on your nodes". |
| Sources | [AKS network concepts](https://learn.microsoft.com/en-us/azure/aks/concepts-network), [Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/concepts-network-azure-cni-overlay), [kubenet](https://learn.microsoft.com/en-us/azure/aks/configure-kubenet), [AKS outbound rules](https://learn.microsoft.com/en-us/azure/aks/outbound-rules-control-egress) |

### App Service Environment v3

| Aspect | Finding |
|---|---|
| NSG status | **Allowed.** Subnet delegated to `Microsoft.Web/hostingEnvironments`. |
| Mandatory inbound rules | Minimum: `AzureLoadBalancer` → ASE subnet range, TCP 80 (internal health ping). For FTP, also port 21 from the load balancer (health ping for the FTP service). App ports as needed: 80, 443; FTP 21, 990, 10001–10020; remote debugging 4022, 4024, 4026; Web Deploy 8172. |
| Mandatory outbound rules | None documented for the platform. Route tables can be set "without restriction ... the only thing you have to worry about is your application dependencies" (for example CRL endpoints, Microsoft Entra ID). |
| Rules Azure adds itself | None documented. |
| Timing | "Changes to NSG rules can take up to 14 days to take effect due to HTTP connection persistence." |
| Source | [App Service Environment networking](https://learn.microsoft.com/en-us/azure/app-service/environment/networking) |

### Azure Databricks (VNet injection)

| Aspect | Finding |
|---|---|
| NSG status | **Required and service-managed.** Two dedicated subnets per workspace (host and container), delegated to `Microsoft.Databricks/workspaces`, not shared with other resources. "Azure Databricks auto-provisions and manages the NSG rules ... These rules are required for workspace operation. Do not modify or delete these rules." Databricks recommends a unique NSG per workspace. |
| Mandatory inbound rules | Any, `VirtualNetwork` → `VirtualNetwork`. Only if secure cluster connectivity (SCC) is disabled: TCP 22 and 5557 from `AzureDatabricks`. |
| Mandatory outbound rules | TCP 443, 3306, 8443–8451 to `AzureDatabricks`; TCP 443 to `Storage`; Any to `VirtualNetwork`; TCP 9093 to `EventHub`; TCP 3306 to `Sql` (being removed for new workspaces). Ports 111 and 2049 are recommended if outbound is restricted. |
| Rules Azure adds itself | All rules above (auto-provisioned). The AVNM docs list Databricks among services whose "network intent policy enforces these requirements". |
| Other | After March 31, 2026, new VNets require an explicit outbound method (NAT gateway recommended). |
| Sources | [Databricks VNet injection](https://learn.microsoft.com/en-us/azure/databricks/security/network/classic/vnet-inject), [AVNM security admin rules](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins) |

### Azure NetApp Files

| Aspect | Finding |
|---|---|
| NSG status | **Standard network features: allowed. Basic network features: not supported.** "If you're using Basic network features, you can't designate a network security group (NSG) or service endpoint in the delegated subnet. Doing so causes the subnet delegation to fail." From July 2026, new or modified volumes use Standard only; existing Basic volumes continue. NIC-level NSGs on ANF network interfaces are not supported. Delegation: `Microsoft.NetApp/volumes`, one per VNet. |
| Mandatory inbound / outbound rules | None documented on the pages reviewed. The subnet has "no connectivity to the Internet". |
| Rules Azure adds itself | None documented (a specific route for the subnet range is programmed). |
| Sources | [ANF network planning guidelines](https://learn.microsoft.com/en-us/azure/azure-netapp-files/azure-netapp-files-network-topologies), [Delegate a subnet to ANF](https://learn.microsoft.com/en-us/azure/azure-netapp-files/azure-netapp-files-delegate-subnet) |

### Other delegated subnets

| Service (delegation) | NSG status | Mandatory or documented rules | Source |
|---|---|---|---|
| App Service / Functions VNet integration (`Microsoft.Web/serverFarms`) | Allowed, outbound only | "The inbound rules don't apply". The NSG applies only to traffic routed through the integration. Functions content share routing needs outbound 443 and 445. | [App Service VNet integration](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration) |
| Azure Container Apps (delegation name not stated on the pages reviewed) | Allowed | Inbound (workload profiles): client → subnet 80/31080, 443/31443; `AzureLoadBalancer` → subnet TCP 30000–32767. Outbound: `MicrosoftContainerRegistry` 443, `AzureFrontDoor.FirstParty` 443, subnet ↔ subnet any, 168.63.129.16 TCP/UDP 53, `AzureActiveDirectory` 443 (managed identity), `AzureMonitor` 443 (if used), container registry, `Storage.<Region>` 443 (ACR). Consumption-only environments also need UDP 1194 / TCP 9000 to `AzureCloud.<Region>`, `AzureCloud` 443, `EventHub.<Region>` 5671/5672, UDP 123, plus all AKS outbound ports. Inbound lockdown via NSG is not supported for an external workload profile environment. | [Container Apps NSGs](https://learn.microsoft.com/en-us/azure/container-apps/firewall-integration) |
| PostgreSQL flexible server (`Microsoft.DBforPostgreSQL/flexibleServers`) | Allowed; ASGs in rules not supported | Allow destination port 5432 within the subnet, and outbound to `Storage`. The `Microsoft.Storage` service endpoint is configured automatically. | [PostgreSQL private networking](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-networking-private) |
| MySQL flexible server (`Microsoft.DBforMySQL/flexibleServers`) | Allowed | Must not block DNS to `AzurePlatformDNS` via NSG. | [MySQL VNet networking](https://learn.microsoft.com/en-us/azure/mysql/flexible-server/concepts-networking-vnet) |
| DNS Private Resolver (`Microsoft.Network/dnsResolvers`) | Not stated on the overview page | Dedicated subnet, /28 to /24, one endpoint per subnet. | [DNS Private Resolver overview](https://learn.microsoft.com/en-us/azure/dns/dns-private-resolver-overview) |
| Container Instances (delegated; name not stated on the page reviewed) | Allowed | "Use NSG rules to control container access to subnets or other network resources." | [ACI VNet concepts](https://learn.microsoft.com/en-us/azure/container-instances/container-instances-virtual-network-concepts) |
| Logic Apps Standard (VNet integration) | Allowed | Outbound to "all managed connector IP addresses in the corresponding region" for Azure-hosted managed connectors. | [Logic Apps Standard VNet](https://learn.microsoft.com/en-us/azure/logic-apps/secure-single-tenant-workflow-virtual-network-private-endpoint) |

## Private endpoints

| Aspect | Finding |
|---|---|
| NSG status | **Allowed, but effective only when network policies are enabled.** "By default, network policies are disabled for a subnet in a virtual network. To use network policies like user-defined routes and network security group support, network policy support must be enabled for the subnet. This setting only applies to private endpoints in the subnet ... For other resources in the subnet, access is controlled based on security rules in the network security group." |
| `privateEndpointNetworkPolicies` values | `Disabled`, `NetworkSecurityGroupEnabled`, `RouteTableEnabled`, `Enabled`. Set per subnet; applies to all private endpoints in the subnet. |
| Mandatory inbound rules | None. Note for Azure Cosmos DB: it "may require all destination ports to be open". |
| Mandatory outbound rules | None. "Outbound traffic denied from a private endpoint isn't a valid scenario, as the service provider can't originate traffic." |
| Limits | Max 50 IP configurations per ASG used in the NSG on a private endpoint subnet. Source × destination × port ranges up to 250 K per rule. Source port filtering is treated as `*`. Effective security rules and NSG flow logs are not available for private endpoint NICs. The docs list regions where a "Feature" is unavailable (West India, Australia Central 2, South Africa West, Brazil Southeast, all Government and China regions); see Uncertain. |
| Rules Azure adds itself | None. The private endpoint propagates a /32 route. |
| Sources | [Manage network policies for private endpoints](https://learn.microsoft.com/en-us/azure/private-link/disable-private-endpoint-network-policy), [Private endpoint overview, "Limitations"](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview) |

## Outbound dependencies of typical workloads under deny-all outbound

| Dependency | What the docs require | Expressible in an NSG rule? | Source |
|---|---|---|---|
| Azure DNS, DHCP, IMDS, WireServer (168.63.129.16, 169.254.169.254) | Needed by every VM (DNS, VM agent "Ready" signal, IMDS for managed identity tokens). | Not subject to NSGs unless a rule targets AzurePlatformDNS, AzurePlatformIMDS or AzurePlatformLKM. | [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview), [168.63.129.16](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16) |
| Windows activation (KMS) | TCP 1688 to `azkms.core.windows.net` (20.118.99.224, 40.83.235.53) or `kms.core.windows.net` (20.118.99.224). The request must come from an Azure public IP. Tag `AzurePlatformLKM`: "You can use this tag to disable the defaults for licensing." | Yes, by IP. Whether a deny-all rule blocks it is unclear (see Uncertain). | [KMS activation with forced tunneling](https://learn.microsoft.com/en-us/troubleshoot/azure/virtual-machines/windows/custom-routes-enable-kms-activation), [Service tags](https://learn.microsoft.com/en-us/azure/virtual-network/service-tags-overview) |
| Windows Update | FQDNs: `*.prod.do.dsp.mp.microsoft.com`, `emdl.ws.microsoft.com`, `*.dl.delivery.mp.microsoft.com`, `*.windowsupdate.com`, `*.delivery.mp.microsoft.com`, `*.update.microsoft.com`, `tsfe.trafficshaping.dsp.mp.microsoft.com` (HTTP or HTTPS depending on the endpoint; list varies by Windows version). The `AzureUpdateDelivery` service tag is deprecated; Microsoft points to Azure Firewall FQDN rules or WSUS. | No tag; FQDN only. | [Windows Update troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-client/installing-updates-features-roles/windows-update-issues-troubleshooting), [Service tags](https://learn.microsoft.com/en-us/azure/virtual-network/service-tags-overview) |
| Azure Monitor Agent | Service tags `AzureMonitor` and `AzureResourceManager` (both required), outbound 443. Endpoints: `global.handler.control.monitor.azure.com`, `<region>.handler.control.monitor.azure.com`, `<workspace-id>.ods.opinsights.azure.com`, `<dce>.<region>.ingest.monitor.azure.com`. Data collection endpoint public IPs are not covered by service tags (custom logs, IIS logs). | Mostly via tags. | [AMA network configuration](https://learn.microsoft.com/en-us/azure/azure-monitor/agents/azure-monitor-agent-network-configuration), [Service tags](https://learn.microsoft.com/en-us/azure/virtual-network/service-tags-overview) |
| Microsoft Entra ID | Tag `AzureActiveDirectory` (outbound; includes sign-in and Microsoft Graph). | Yes, by tag. | [Service tags](https://learn.microsoft.com/en-us/azure/virtual-network/service-tags-overview) |
| Azure Storage | Tag `Storage` (regional variants exist). It "represents the service, but not specific instances". The Windows VM agent downloads upgrades from Azure Storage. Service endpoint traffic also needs NSG outbound allow. | Yes, by tag. | [Service tags](https://learn.microsoft.com/en-us/azure/virtual-network/service-tags-overview), [Windows VM agent](https://learn.microsoft.com/en-us/azure/virtual-machines/extensions/agent-windows), [VNet FAQ](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq) |
| Explicit outbound method | For API versions released after March 31, 2026, new VNets default to private subnets (`defaultOutboundAccess = false`). "Certain services don't function on a virtual machine in a private subnet without an explicit method of egress (examples are Windows Activation and Windows Updates)." This is independent of NSGs. | Not an NSG matter. | [Default outbound access](https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/default-outbound-access) |

## Uncertain — candidates for an empirical check

1. **Association enforcement.** For GatewaySubnet and RouteServerSubnet, the docs say only "not supported". They don't say whether ARM rejects the association or accepts it and the service breaks. For AzureFirewallSubnet, "disabled" suggests rejection, but there is no documented error.
2. **AzureFirewallManagementSubnet.** Microsoft Learn says nothing about NSGs on this subnet. The only source is a Microsoft Q&A community answer.
3. **Deny-all and platform addresses.** The docs say that DNS, IMDS and WireServer traffic "aren't subject to the configured network security groups unless targeted by service tags". It is unclear whether a deny rule with destination `Any` (or `*`) counts as "targeting" them.
4. **KMS on port 1688.** The NSG overview describes a "platform rule" that is disabled with a 0.0.0.0/0 default route. It doesn't say whether an outbound deny-all NSG rule blocks KMS activation.
5. **SQL MI intent-policy rules.** Ports, sources, priorities and directions of the `…_mi-` rules are not documented. Open points: does a custom deny-all at priority 4096 pass the intent-policy check; does a full NSG PUT that omits the service rules fail; does the service recreate deleted rules; can nsgfw's own priorities collide with the service's priorities.
6. **Databricks auto-provisioned rules.** Priorities are not documented. It is also not documented whether changes or a full NSG PUT without them are rejected (as for SQL MI) or silently break the workspace.
7. **Application Gateway, mixed subnets.** The private-deployment page says that NSG and route table features work "only with the earlier gateway deployment" when old and new gateways share a subnet. The surrounding text suggests the opposite. The direction and source of the platform ports (TCP 65502, 54321; UDP 12345) are also not stated.
8. **Bastion validation.** It is not documented whether ARM rejects an NSG on AzureBastionSubnet that lacks the required rules, or accepts it.
9. **Private endpoint defaults.** The docs say that network policies are disabled by default. The default for subnets created through the portal or through newer API versions is not confirmed. It is also unclear what the "Feature unavailable in select regions" row in the NSG limitations table refers to.
10. **DNS Private Resolver.** NSG support on the delegated subnets is not stated on the overview page.
11. **AKS NSGs.** The kubenet page says that AKS associates its own NSG with node NICs. The concepts page says that AKS doesn't apply NSGs to its subnet. The NSG placement for Azure CNI variants, and how it interacts with a subnet NSG under deny-all, is not documented on the pages reviewed.
12. **APIM classic.** It is not documented whether deployment fails without an NSG, or only the load balancer misbehaves.
13. **ASE v3 outbound.** No platform outbound dependency is documented. It is unclear whether a deny-all outbound rule affects platform operations (for example the "platform outbound addresses" used to pull certificates from Key Vault).
14. **Azure NetApp Files.** No mandatory ports are documented for the delegated subnet. Client protocol ports (NFS, SMB) and AD DS ports were not covered here.
15. **Container Apps port range.** The source text renders the load balancer probe range as "30000-327672". Read here as 30000–32767 with footnote 2; confirm.

## Facts that open design tickets depend on

- An NSG rule can't hold more than one service tag or more than one ASG. Several IPs, ranges and ports per rule are allowed. ([NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview))
- NSG rule sources and destinations can't be FQDNs. Windows Update, many AKS endpoints and some API Management dependencies are documented only as FQDNs.
- Subnets that don't support an NSG: GatewaySubnet, RouteServerSubnet, AzureFirewallSubnet (disabled), ANF delegated subnets with Basic network features. AzureFirewallManagementSubnet is unverified.
- Subnets whose service requires an NSG: SQL Managed Instance, API Management (classic injection; v2 injection and integration), Azure Databricks.
- Subnets where Azure writes rules into the customer's NSG and may reject changes: SQL Managed Instance (reserved name prefix `Microsoft.Sql-managedInstances_UseOnly_mi-`, intent-policy check on every change), Azure Databricks (auto-provisioned rules, "do not modify or delete"). Delegation in general allows Network Intent Policies that block changes at PUT time.
- Application Gateway v2 without network isolation: Azure rejects an outbound deny-all rule with an error. With network isolation, only the AzureLoadBalancer inbound rule is mandatory.
- Services whose mandatory inbound rules include `AzureLoadBalancer`: Bastion (443), Application Gateway (any), API Management classic (6390), ASE v3 (80, and 21 for FTP), Container Apps (30000–32767).
- Services whose mandatory inbound rules include `GatewayManager`: Bastion (443), Application Gateway v2 without network isolation (65200–65535).
- Private endpoint traffic ignores the subnet NSG unless `privateEndpointNetworkPolicies` is `Enabled` or `NetworkSecurityGroupEnabled`.
- Platform traffic to 168.63.129.16 and 169.254.169.254 (DNS, DHCP, IMDS, WireServer) bypasses NSGs unless platform service tags are targeted.
- The VirtualNetwork tag includes UDR prefixes and "might also contain default routes".
- AVNM security admin rules are evaluated before NSGs. They are not applied, by default, to VNets with SQL MI or Databricks, or to subnets with Application Gateway (without network isolation), Bastion, Firewall, Route Server, VPN Gateway, Virtual WAN or ExpressRoute Gateway.
- NSG rule changes affect only new connections. On ASE v3, effects can take up to 14 days.
- SQL MI: peered VNets need a separate NSG per MI subnet. IPv6 prefixes in the NSG make the instance unavailable.
- Private endpoint subnets: max 50 IP configurations per ASG in the NSG; source × destination × ports up to 250 K per rule.
- New VNets (API versions after March 31, 2026) default to private subnets. Windows activation and Windows Update then need an explicit outbound method, independent of NSG rules.
- Outbound port 25 is blocked for most subscription types, independent of NSGs.
