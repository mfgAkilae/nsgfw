# Research: Reading the Flow view and rule hits from Traffic Analytics

Retrieval date for every source below: 2026-11-09. The run went past midnight UTC, so the last few fetches (pricing pages, live spot-checks) happened on 2026-11-10. Their content matched the 2026-11-09 Markdown sources wherever both were read.

## Question

What does nsgfw need to read the allowed and denied flows of a Zone, and the hits of an NSG rule, from VNet flow logs through Traffic Analytics?

Covers:

1. The Log Analytics table and fields for VNet flow logs (`NTANetAnalytics`), and how a flow maps to a subnet (Zone) and to an NSG rule name. How denied flows, AVNM admin rules and default rules appear.
2. The RBAC actions the reader needs to query a workspace and to discover the flow log configuration.
3. The query API: endpoint, token audience, limits, throttling. How fresh Traffic Analytics data is.
4. How the tool can tell, with read access only, that a Zone has no flow log or no Traffic Analytics.
5. Cost drivers for the operator.
6. NSG flow log retirement, and whether only VNet flow logs need support.

Builds on [_prior-security-layers-and-flow-logs.md](_prior-security-layers-and-flow-logs.md) (the flow-log rule identity, the 65-character note, retirement, AVNM in VNet flow logs). This file does not repeat those findings; it cross-checks and extends them.

### Method and source notes

- Network Watcher, RBAC and Resource Graph pages were read from their Markdown source in `github.com/MicrosoftDocs/azure-docs` (branch `main`). Azure Monitor pages were read from `github.com/MicrosoftDocs/azure-monitor-docs` (branch `main`). The citations give the Learn URL.
- The `NTANetAnalytics` table reference and the pricing pages were read live (WebFetch). The Traffic Analytics schema page was spot-checked live and matched its Markdown source.
- REST facts come from `github.com/Azure/azure-rest-api-specs`, Microsoft.Network stable `2026-03-01`: [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json), [virtualNetwork.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json) and the `examples/` folder.
- No Azure API was called. No blog or forum is used as a source. Statements marked **Inference** are mine, not Microsoft's.
- Both pricing pages show only `$-` placeholders where the prices should be. This file therefore names the meters and gives no prices.

## Summary

- Traffic Analytics writes VNet flow log data to the Log Analytics table `NTANetAnalytics`. Each row is an aggregate of flows with the same source IP, destination IP, destination port, NSG, NSG rule, direction and L4 protocol, over a 10- or 60-minute processing interval. Filter on `SubType == "FlowLog"`.
- Zone mapping: `SrcSubnet` and `DestSubnet` have the form `<ResourceGroup>/<VNet>/<Subnet>`, with no subscription. The subscription is in separate fields (`SrcSubscription`, `DestSubscription`).
- Rule mapping: `AclGroup` = `<SubscriptionID>/<ResourceGroup>/<NSG>` and `AclRule` = rule name. For an AVNM decision, the table reference says `AclGroup` is the network group and `AclRule` is the security admin rule name. The docs show no example of a user NSG rule value, so a `UserRule_` prefix and truncation in VNet flow logs remain unconfirmed.
- Denied flows are recorded: raw flow state `D`, and in `NTANetAnalytics` `FlowStatus` (`A`/`D`) plus the counters `AllowedInFlows`, `DeniedInFlows`, `AllowedOutFlows`, `DeniedOutFlows`. Flow logs do not record ICMP. A flow log can be filtered (`recordTypes`, `enabledFilteringCriteria`) so that denied flows are dropped.
- Reading needs `Microsoft.OperationalInsights/workspaces/read` + `.../workspaces/query/read` (Actions), plus table access. Table access is either the legacy Action `.../workspaces/query/NTANetAnalytics/read` or the DataAction `.../workspaces/tables/data/read`, optionally with an ABAC condition on the table name. All of these can sit in a custom role. Discovering the flow log needs `Microsoft.Network/networkWatchers/flowLogs/read` (and `networkWatchers/read`).
- `NTANetAnalytics` lists no resource types and no `_ResourceId` column. So nsgfw should plan on workspace-context queries with workspace or table permissions, not resource-context (see Open points).
- Query API: `POST https://api.loganalytics.azure.com/v1/workspaces/{workspaceId}/query` (the older `api.loganalytics.io` still works), token resource `https://api.loganalytics.io`. Limits: 500,000 rows, ~100 MiB, 3-minute default timeout (10-minute maximum), 200 requests per 30 seconds per user, 5 concurrent queries per user, then a FIFO queue (HTTP 429 after 3 minutes in the queue or when 200 queries are waiting).
- Freshness: flow logs write 1-minute blobs; Traffic Analytics picks them up every 60 minutes (default) or every 10 minutes; decoration and ingestion "can take up to 1 hour". Resource discovery runs every 6 hours, so new NICs and subnets can show as "Unknown".
- Discovery: flow logs are child resources of a Network Watcher (`Microsoft.Network/networkWatchers/flowLogs`). They show up in Azure Resource Graph table `resources` and carry `targetResourceId` (VNet, subnet or NIC), `enabled`, filters, and `flowAnalyticsConfiguration.networkWatcherFlowAnalyticsConfiguration` (`enabled`, `workspaceResourceId`, `workspaceId`, `trafficAnalyticsInterval`). Precedence is NIC > subnet > VNet.
- Costs: flow log collection per GB (5 GB/month free per subscription), Traffic Analytics processing per GB (no free tier; two rates for the 10- and 60-minute intervals), and blob storage. The Network Watcher pricing page says the Log Analytics workspace cost for Traffic Analytics is "absorbed in the Traffic Analytics pricing".
- NSG flow logs retire on 2027-09-30 and new ones can no longer be created. Their Traffic Analytics table `AzureNetworkAnalytics_CL` is replaced by `NTANetAnalytics`. Supporting VNet flow logs only is consistent with the docs.

## Findings

### 1. `NTANetAnalytics`: fields, Zone mapping, rule mapping

#### 1.1 Table and aggregation

- Traffic Analytics data for VNet flow logs lives in `NTANetAnalytics`, which "replaces *AzureNetworkAnalytics_CL* used in network security group flow logs". Public IP details are in `NTAIpDetails`. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- Table attributes: Resource types `-`, Category Network, Solution LogManagement, Basic table support No, Auxiliary/Lake support No, DCR workspace transformation Yes, Ingestion API No. [NTANetAnalytics reference](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/ntanetanalytics)
- Aggregation: "Flows that have the same `Source IP`, `Destination IP`, `Destination port`, `NSG name`, `NSG rule`, `Flow Direction`, and `Transport layer protocol (TCP or UDP)` are clubbed into a single flow by traffic analytics (Note: source port is excluded for aggregation)." In Log Analytics "user sees only the single, reduced record"; the full flows stay in the storage blobs. [Traffic analytics schema, Data aggregation](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#data-aggregation)
- `SubType`: the schema page says "Use only **FlowLog**, other values of **SubType** are for internal use". The table reference lists the values "Flowlog and StatusMessage" (different casing). Microsoft's sample queries filter `SubType == "FlowLog"`. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema); [NTANetAnalytics reference](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/ntanetanalytics); [Traffic analytics queries](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-queries)
- `FaSchemaVersion` is `3` for VNet flow logs ("Doesn't reflect virtual network flow log version"). [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)

#### 1.2 Fields relevant to the Flow view and hits

From [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema) (format column) and [NTANetAnalytics reference](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/ntanetanalytics) (type column):

| Field | Type | Documented format / meaning |
| --- | --- | --- |
| `TimeGenerated` | datetime | "The time when the data gets ingested into the log analytics workspace." |
| `TimeProcessed` | datetime | When Traffic Analytics processed the raw blobs. |
| `FlowIntervalStartTime`, `FlowIntervalEndTime` | datetime | Bounds of the processing interval. |
| `FlowStartTime`, `FlowEndTime` | datetime | First and last occurrence of the aggregated flow inside the interval. |
| `FlowType` | string | `IntraVNet`, `InterVNet`, `S2S`, `P2S`, `AzurePublic`, `ExternalPublic`, `MaliciousFlow`, `Unknown Private`, `Unknown`. |
| `SrcIp`, `DestIp` | string | "Blank in AzurePublic and ExternalPublic flows"; public IPs are in `SrcPublicIps`/`DestPublicIps` as bar-separated `<IP>\|<FLOW_STARTED_COUNT>\|<FLOW_ENDED_COUNT>\|<OUTBOUND_PACKETS>\|<INBOUND_PACKETS>\|<OUTBOUND_BYTES>\|<INBOUND_BYTES>`. |
| `DestPort` | int | Destination port. |
| `SrcPorts` | string | "Pipe Separated Source Ports" (table reference only). |
| `L4Protocol` | string | `T` = TCP, `U` = UDP. |
| `FlowDirection` | string | Schema: `I` = Inbound, `O` = Outbound, "in or out of the target resource per flow log". |
| `FlowStatus` | string | Schema: `A` = Allowed, `D` = Denied, "allowed or denied by target resource per flow log". |
| `AclGroup` | string | Schema: `<SubscriptionID>/<resourcegroup_Name>/<NSG_Name>`. Table reference: "the network security group associated with the network security group rule name (or) the network group associated with the security admin configuration which allowed or denied the connection." |
| `AclRule` | string | Schema: `NSG_Rule_Name`. Table reference: "the network security group rule name or the security admin rule name which allowed or denied the connection." |
| `SrcSubnet`, `DestSubnet` | string | `<ResourceGroup_Name>/<VirtualNetwork_Name>/<SubnetName>`: subnet of the source / destination IP. |
| `SrcSubscription`, `DestSubscription` | string | Subscription ID of the VNet / NIC / VM the IP belongs to. |
| `SrcNic`, `DestNic`, `SrcVm`, `DestVm` | string | `<resourcegroup_Name>/<Name>`. |
| `SrcNetworkGroups`, `DestNetworkGroups` | string | AVNM network groups of the VNet (table reference only). |
| `MacAddress` | string | MAC of the NIC where the flow was captured. |
| `AllowedInFlows`, `DeniedInFlows`, `AllowedOutFlows`, `DeniedOutFlows` | long | Flow counts "inbound/outbound to the network interface at which the flow was captured". |
| `CompletedFlows` | long | Non-zero when a flow got an end event. |
| `BytesSrcToDest`, `BytesDestToSrc`, `PacketsSrcToDest`, `PacketsDestToSrc` | long | Bytes / packets per direction. |
| `RecordCount` | long | "Count of individual records that were aggregated into this record" (table reference only). |
| `TargetResourceId` | string | Schema: `ResourceGroupName/ResourceName`; "the resource at which flow logging and traffic analytics is enabled". |
| `TargetResourceType` | string | `VirtualNetwork` / `Subnet` / `NetworkInterface` (schema); "VNET/SUBNET/NIC" (table reference). |
| `FlowLogResourceId` | string | Schema: `ResourceGroupName/NetworkWatcherName/FlowLogName`. |
| `FlowCapturedAtResourceId`, `FlowCapturedAtResourceType` | string | The flow-capturing device (table reference only). |
| `IsFlowCapturedAtUdrHop` | bool | True if the flow was captured at a UDR hop. |
| `FlowEncryption` | string | Encryption state of the flow. |
| `NsgList`, `NsgRule`, `NsgRuleType` | string | "This is a placeholder for NSG flow logging" (table reference). |

Note: the schema page documents `FlowDirection` as `I`/`O`, but Microsoft's own sample queries on the queries page filter `FlowDirection == "Outbound"` and `"Inbound"`. They also write `MacAddress` with colons (`A1:B1:C1:D1:E1:F1`), while raw VNet flow logs write it without (`112233445566`). [Traffic analytics queries](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-queries); [VNet flow logs, Sample log record](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#sample-log-record). See Open point 5.

#### 1.3 How a flow maps to a Zone

- `SrcSubnet` / `DestSubnet` name the subnet of the source / destination IP as `<ResourceGroup>/<VNet>/<Subnet>`. The subscription is not part of the value; it is in `SrcSubscription` / `DestSubscription`. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- **Inference:** for a Zone with subnet resource ID `/subscriptions/S/resourceGroups/RG/providers/Microsoft.Network/virtualNetworks/V/subnets/N`, inbound flows to the Zone are rows with `DestSubnet == "RG/V/N"` and `DestSubscription == "S"`. Outbound flows are rows with `SrcSubnet == "RG/V/N"` and `SrcSubscription == "S"`. Both directions match for intra-Zone traffic. Casing of the values is not documented (Open point 4).
- Traffic Analytics only maps IPs in subscriptions that have at least one flow log sending to the same workspace. Otherwise flows are tagged "Unknown". "A subscription is visible to traffic analytics in a Log Analytics workspace if it contains a flow log configured to that workspace." [Network Watcher FAQ, Traffic analytics](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics); [Traffic analytics schema, Notes](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#notes)
- Resource discovery runs every 6 hours. Resources created after the last scan are "temporarily labeled as *unknown*". [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics)
- `FlowDirection` and `FlowStatus` are relative to "the target resource per flow log". The four flow counters are relative to "the network interface at which the flow was captured". [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)

#### 1.4 How a flow maps to an NSG rule

- `AclGroup` identifies the NSG as `<SubscriptionID>/<resourcegroup_Name>/<NSG_Name>`, and `AclRule` holds the rule name. NSG rule names are unique within one NSG (prior research), so the pair (`AclGroup`, `AclRule`) points at exactly one NSG rule. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- The aggregation key contains "NSG name" and "NSG rule". So one `NTANetAnalytics` row never mixes two rules. [Traffic analytics schema, Data aggregation](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#data-aggregation)
- Raw VNet flow logs carry the rule as `flowGroups[].rule`. The documented examples are `DefaultRule_AllowInternetOutBound` (NSG default rule), `BlockHighRiskTCPPortsFromInternet` (AVNM security admin rule) and `Internet`. No example shows a user-defined NSG rule. [VNet flow logs, Sample log record](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#sample-log-record); [Monitoring AVNM with VNet flow logs](https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-virtual-network-flow-logs)
- The schema page shows `AclRule` only as `NSG_Rule_Name`. It does not say whether Traffic Analytics keeps or strips a `UserRule_` / `DefaultRule_` prefix. NSG flow logs (the retiring kind) use those prefixes. Their Traffic Analytics table split the rule type into `NSGRuleType_s` (`User Defined` / `Default`); `NTANetAnalytics` has no such field for VNet flow logs (`NsgRuleType` is "a placeholder for NSG flow logging"). [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema); [NTANetAnalytics reference](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/ntanetanalytics). See Open point 1.
- Rule name truncation: the docs still state the 65-character rule name limit only for NSG flow logs. Neither the VNet flow log page, the Traffic Analytics schema nor the `NTANetAnalytics` reference mentions a length limit or truncation for `rule` / `AclRule`. Microsoft documents no field length limit for `string` columns beyond the workspace-wide 32 KB per field value. [NSG flow logs, Best practices](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview#best-practices); [Azure Monitor service limits, Log Analytics workspaces](https://learn.microsoft.com/en-us/azure/azure-monitor/fundamentals/service-limits#log-analytics-workspaces). See Open point 2.

#### 1.5 Denied flows, AVNM admin rules, default and platform rules

- VNet flow logs record denied flows: flow state `D` (Deny) in the tuple. `recordTypes` is a filter over `B`, `C`, `E`, `D`; "If not specified, all network traffic will be logged." [VNet flow logs, Log format](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#log-format); [networkWatcher.json, `FlowLogPropertiesFormat.recordTypes`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json)
- In `NTANetAnalytics`, a denied flow has `FlowStatus` = `D` and counts in `DeniedInFlows` / `DeniedOutFlows`. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- `C` (Continue) records are "generated at every five-minute interval" for an ongoing flow. [networkWatcher.json, `recordTypes`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json)
- AVNM: VNet flow logs identify traffic that security admin rules allow or deny; NSG flow logs don't. In raw logs the admin rule name is in `rule` and `aclID` names the Virtual Network Manager. In `NTANetAnalytics`, `AclRule` is "the security admin rule name" and `AclGroup` is "the network group associated with the security admin configuration". [VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview); [NTANetAnalytics reference](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/ntanetanalytics)
- **Inference:** nsgfw cannot tell an AVNM row from an NSG row by `AclRule` alone. It has to classify by `AclGroup` (NSG path vs. network group), which the docs don't describe for AVNM. See Open point 3.
- Default rules appear in raw VNet flow logs as `DefaultRule_<name>` (for example `DefaultRule_AllowInternetOutBound`). [VNet flow logs, Sample log record](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#sample-log-record)
- Platform rules: "a platform rule represents network traffic that is processed by the Azure platform itself rather than by user‑configured rules". Workload traffic can sometimes appear under a platform rule ("load‑balanced connections are recreated", "return traffic does not require rule evaluation"). [VNet flow logs, Platform Rules](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#platform-rules)
- Traffic denied because of virtual network encryption has `aclID` and `rule` = `unspecified`. [VNet flow logs, Log format](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#log-format)
- Flow logs don't support ICMP. [Network Watcher FAQ, Flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#flow-logs). `L4Protocol` only knows `T` and `U`. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- Filtering: `enabledFilteringCriteria` can restrict logging by SrcIP, SrcPort, DstIP, DstPort, Protocol, Encryption, Direction and Action. [networkWatcher.json, `FlowLogPropertiesFormat`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json). **Inference:** nsgfw can read both filter properties and warn that the Flow view or hits are incomplete.

#### 1.6 Query shapes (untested sketches)

Field names as documented; values in angle brackets are placeholders. The open points on value formats apply.

```kusto
// Flow view of one Zone, allowed and denied, last 24 h
NTANetAnalytics
| where SubType == "FlowLog" and FlowStartTime > ago(24h)
| where (DestSubnet == "<rg>/<vnet>/<subnet>" and DestSubscription == "<sub>")
     or (SrcSubnet  == "<rg>/<vnet>/<subnet>" and SrcSubscription  == "<sub>")
| project FlowStartTime, FlowEndTime, FlowDirection, FlowStatus, SrcIp, SrcPublicIps, DestIp, DestPublicIps,
          DestPort, L4Protocol, AclGroup, AclRule,
          AllowedInFlows, DeniedInFlows, AllowedOutFlows, DeniedOutFlows, BytesSrcToDest, BytesDestToSrc

// Hits per NSG rule of one NSG
NTANetAnalytics
| where SubType == "FlowLog" and FlowStartTime > ago(30d)
| where AclGroup == "<sub>/<rg>/<nsg>"
| summarize Hits = sum(AllowedInFlows + DeniedInFlows + AllowedOutFlows + DeniedOutFlows),
            LastSeen = max(FlowEndTime) by AclRule
```

**Inference:** a rule with no row in the time range has no hits recorded. That is not the same as "no flow data": nsgfw has to decide separately (section 4) whether flow data exists for the Zone at all before it shows "0" instead of "—".

### 2. RBAC for the reader

#### 2.1 Querying the workspace

From [Manage access to Log Analytics workspaces](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access) and [Azure permissions for Monitor](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/monitor):

| Permission | Kind | Purpose |
| --- | --- | --- |
| `Microsoft.OperationalInsights/workspaces/read` | Action | "View workspace basic properties". |
| `Microsoft.OperationalInsights/workspaces/query/read` | Action | "Query logs by using any interface"; "Required for every user that can execute queries". |
| `Microsoft.OperationalInsights/workspaces/query/*/read` | Action | Access all tables. |
| `Microsoft.OperationalInsights/workspaces/query/NTANetAnalytics/read` | Action | "Read data from the NTANetAnalytics table" (table-specific; the access page calls this pattern the "legacy method"). |
| `Microsoft.OperationalInsights/workspaces/tables/query/read` | Action | "Run queries over the data of a specific table in the workspace" (listed in the permissions reference; no how-to page uses it). |
| `Microsoft.OperationalInsights/workspaces/tables/data/read` | DataAction | "Read data access to workspaces, or more fine-grained data entities, such as specific tables or rows". Used by granular RBAC with an ABAC condition on table name `Microsoft.OperationalInsights/workspaces/tables:<name>`. |

- Built-in role **Log Analytics Data Reader** = Actions `workspaces/query/read`, `workspaces/read` + DataAction `workspaces/tables/data/read`, described as "the bare minimum permissions needed to run queries". [Manage access, Log Analytics Data Reader](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access#log-analytics-data-reader)
- Custom roles can hold both forms. The granular RBAC example is a custom role with `actions` `workspaces/read`, `workspaces/query/read` and `dataActions` `workspaces/tables/data/read`. The legacy example is a custom role with Actions `workspaces/read`, `workspaces/query/read`, `workspaces/query/<Table>/read`. [Manage table-level access](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-table-access); [Granular RBAC](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/granular-rbac-log-analytics)
- Without a condition, `tables/data/read` "grants access to all data at the assigned scope". [Granular RBAC](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/granular-rbac-log-analytics)
- `DataActionsOnly` mode (workspace property `dataAuthorizationMode`): "control plane roles such as Reader and Monitoring Reader (and any custom role using control plane actions to grant access) no longer grant implicit data access. Only `DataActions` provide access to log data." [Manage access, DataActionsOnly mode](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access#dataactionsonly-mode). **Inference:** for nsgfw Reader to work on such workspaces it needs the DataAction `tables/data/read` (ideally with a condition limited to `NTANetAnalytics`), not only the legacy Action.
- Protected tables (preview): a table with `protectionLevel` = `Protected` returns no rows to callers without an explicit ABAC grant, and "The query doesn't return a 400 or 403 error." [Manage access, Protected tables](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access#protected-tables-preview). The same "silently filtered" behaviour applies to partial access in resource queries. [Querying logs for Azure resources, Partial access](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/azure-resource-queries#partial-access). **Inference:** an empty result is not proof of "no flows"; nsgfw can send `Prefer: include-permissions=true` to tell the cases apart.
- Considerations: "The standard Reader or Contributor roles, which include the _\*/read_ action, override table-level access control and give users access to all log data." "A user with table-level access but no workspace-level permissions can access log data from the API but not from the Azure portal." [Manage table-level access, Considerations](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-table-access#considerations)
- New RBAC grants can take up to 60 minutes to take effect for the API ("While permissions are propagating, REST API calls might fail with error code 403"; stated for the Application Insights REST API on the Log Analytics timeouts page). [Logs query API timeouts, Insufficient permissions](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/timeouts)

#### 2.2 Access mode and access control mode

- Access mode is per query. **Workspace-context**: all data in tables you have access to. **Resource-context**: only records associated with a resource. "Records are only available in resource-context queries if they're associated with the relevant resource. To check this association, run a query and verify that the `_ResourceId` column is populated." [Manage access, Access mode](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access#access-mode)
- Access control mode is a workspace setting (`properties.features.enableLogAccessUsingOnlyResourcePermissions`). `false` = "Require workspace permissions", the default for workspaces created before March 2019. `true` = "Use resource or workspace permissions", the default after March 2019. In the second mode, workspace-context queries check workspace permissions; resource-context queries check only resource permissions (`Microsoft.Insights/logs/*/read` or `Microsoft.Insights/logs/<table>/read`, DataAction `Microsoft.Insights/logs/data/read`). [Manage access, Access control mode](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access#access-control-mode); [Manage access, Resource permissions](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access#resource-permissions)
- `NTANetAnalytics` lists "Resource types: -", and its column list has no `_ResourceId`. [NTANetAnalytics reference](https://learn.microsoft.com/en-us/azure/azure-monitor/reference/tables/ntanetanalytics). **Inference:** resource-context queries (for example against a VNet or NSG resource ID) are unlikely to return Traffic Analytics rows. So nsgfw needs workspace-scoped permissions on the Environment's workspace (Open point 7).

#### 2.3 Discovering the flow log configuration

| Permission | Kind | Purpose | Source |
| --- | --- | --- | --- |
| `Microsoft.Network/networkWatchers/read` | Action | Get a network watcher. | [Network Watcher RBAC](https://learn.microsoft.com/en-us/azure/network-watcher/rbac-permissions#network-watcher) |
| `Microsoft.Network/networkWatchers/flowLogs/read` | Action | "Get flow log details". | [Network Watcher RBAC, Flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/rbac-permissions#flow-logs) |
| `Microsoft.Network/networkWatchers/queryFlowLogStatus/action` | Action (POST) | "Gets the status of flow logging on a resource." Optional; a POST, not a GET. | [Azure permissions for Networking](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/networking) |
| `Microsoft.Network/virtualNetworks/read`, `.../networkInterfaces/read`, `.../networkSecurityGroups/read` | Action | Read targets and their read-only back-references (`flowLogs[]` on VNet and NSG). | [Network Watcher RBAC, Traffic analytics](https://learn.microsoft.com/en-us/azure/network-watcher/rbac-permissions#traffic-analytics) |

- The Traffic analytics section of the RBAC page lists further permissions (`workspaces/sharedkeys/action`, DCR/DCE write and delete, storage `listKeys`). Those are for *enabling* Traffic Analytics, which is the operator's job, not nsgfw's. [Network Watcher RBAC, Traffic analytics](https://learn.microsoft.com/en-us/azure/network-watcher/rbac-permissions#traffic-analytics)
- Azure Resource Graph needs no extra action; it returns only resources the caller can read (prior research).

### 3. Query API, limits, freshness

#### 3.1 Endpoint and authentication

- Endpoint: `POST https://api.loganalytics.azure.com/v1/workspaces/{workspaceId}/query`, body `{"query": "...", "timespan": "PT12H"}`. `workspaceId` "is the GUID of the Log Analytics workspace". `v1` is in the path; there is no `api-version` parameter. "The `api.loganalytics.io` endpoint is being replaced by `api.loganalytics.azure.com`. The `api.loganalytics.io` endpoint will continue to be supported for the foreseeable future." [Logs query API overview](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/overview); [Request format](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/request-format); [Access the API](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/access-api)
- `timespan`: ISO 8601 duration or start/end pair; "If omitted, the query runs against all available data." Extra workspaces can be added for a cross-workspace query (max 100 resources per query). [Request format](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/request-format); [Service limits, Log queries](https://learn.microsoft.com/en-us/azure/azure-monitor/fundamentals/service-limits#log-queries-and-language)
- Token: client credentials flow, "Use `resource=https://api.loganalytics.io`". The API supports the client credentials, authorization code and implicit flows. [Access the API](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/access-api)
- The timeouts page also lists an error "Client credentials to direct API" and says "If you must use client credentials, use the Azure Resource Manager API endpoint". This contradicts the access page. [Logs query API timeouts, Common API errors](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/timeouts). See Open point 9.
- Resource-scoped queries: `https://api.loganalytics.azure.com/v1/subscriptions/<sid>/resourceGroups/<rg>/providers/<provider>/<type>/<name>/query`. [Querying logs for Azure resources](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/azure-resource-queries)
- `Prefer` header options: `wait=<seconds>` (timeout), `include-statistics=true`, `include-dataSources=true`, `include-permissions=true`. [Prefer options](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/prefer-options)

#### 3.2 Limits and throttling

From [Azure Monitor service limits](https://learn.microsoft.com/en-us/azure/azure-monitor/fundamentals/service-limits) (sections "Log queries and language" and "Log Analytics workspaces → Query API") and [Timeouts](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/timeouts):

| Limit | Value |
| --- | --- |
| Records per query | 500,000 |
| Data returned | ~104 MB (~100 MiB) raw; "up to 64 MB of compressed data" |
| Timeout | default 3 minutes; maximum 10 minutes via `Prefer: wait=`; exceeded → HTTP 504 |
| Request rate | 200 requests per 30 seconds per Microsoft Entra user or client IP |
| Concurrent queries (Analytics tables) | 5 per user; more go to a FIFO queue |
| Queue | max 200 queued; more → HTTP 429; queued > 3 minutes → HTTP 429 |
| Cross-resource | max 100 workspaces/resources per query |
| Field value size | 32 KB; longer values are truncated |

- **Inference:** nsgfw uses one identity for all users. These per-user limits therefore apply to the whole tool, not per operator. Server-side aggregation (`summarize`) keeps the row count well below 500,000.

#### 3.3 Freshness of Traffic Analytics data

- VNet flow logs are "collected at one-minute intervals" and appended to block blobs every minute; blob path `.../y=/m=/d=/h=/m=00/macAddress=/PT1H.json` (one blob per hour per MAC). [VNet flow logs, How logging works](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#how-logging-works); [Manage VNet flow logs, Download a flow log](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-manage#download-a-flow-log)
- Processing interval: 60 minutes by default, or 10 minutes ("accelerated processing"). Set per flow log (`trafficAnalyticsInterval`, portal "Every 1 hour" / "Every 10 mins"). [Traffic analytics schema, Data aggregation](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#data-aggregation); [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics); [Manage VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-manage#create-a-flow-log)
- Decoration and ingestion "can take up to 1 hour". [Traffic analytics schema, Data aggregation](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#data-aggregation)
- First data after enabling: "The dashboard might take up to 30 minutes to show reports for the first time." [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics)
- **Inference:** the newest flow in `NTANetAnalytics` can be roughly one processing interval plus up to one hour old: up to about 70 minutes at the 10-minute setting, about 2 hours at the 60-minute setting. Microsoft states no end-to-end figure or SLA (Open point 11). For display, `FlowStartTime`/`FlowEndTime` describe the traffic; `TimeGenerated` is ingestion time.

### 4. Detecting "no flow log" and "no Traffic Analytics" with read access

#### 4.1 The flow log resource

- Type `Microsoft.Network/networkWatchers/flowLogs`, child of the regional Network Watcher (`NetworkWatcher_<region>` in `NetworkWatcherRG` by default). REST: `GET .../networkWatchers/{nw}/flowLogs` and `GET .../flowLogs/{name}`. [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json); [Manage VNet flow logs, View details](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-manage#view-details-of-a-flow-log-resource)
- Properties (`FlowLogPropertiesFormat`): `targetResourceId`, read-only `targetResourceGuid`, `storageId`, `enabled`, `enabledFilteringCriteria`, `recordTypes`, `retentionPolicy` (`days`, `enabled`), `format` (`type`, `version`), `flowAnalyticsConfiguration`, read-only `provisioningState`. The spec still describes `targetResourceId` as "ID of network security group"; the Learn pages say the target is a VNet, subnet or NIC. [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json); [Manage VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-manage#create-a-flow-log)
- Traffic Analytics config: `flowAnalyticsConfiguration.networkWatcherFlowAnalyticsConfiguration` with `enabled`, `workspaceId` ("The resource guid of the attached workspace"), `workspaceRegion`, `workspaceResourceId`, `trafficAnalyticsInterval` ("The interval in minutes"). In Microsoft's GET example a flow log with TA off returns `"enabled": false, "trafficAnalyticsInterval": 60, "workspaceId": "-", "workspaceRegion": "-"`. [networkWatcher.json, `TrafficAnalyticsConfigurationProperties`; example `NetworkWatcherFlowLogGet.json`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json)
- Back-references: VNet and NSG resources have a read-only `properties.flowLogs[]`. Subnet and NIC resources have none in `2026-03-01`. [virtualNetwork.json, `VirtualNetworkPropertiesFormat`, `NetworkSecurityGroupPropertiesFormat`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json)
- `queryFlowLogStatus` (POST, body `FlowLogStatusParameters` with `targetResourceId`) returns flow log and Traffic Analytics status for one target. [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json)

#### 4.2 Resource Graph

- `microsoft.network/networkwatchers/flowlogs` is listed in the ARG `resources` table. [Resource Graph supported tables and resource types, resources](https://learn.microsoft.com/en-us/azure/governance/resource-graph/reference/supported-tables-resources#resources)
- **Inference:** one ARG query per Environment can list all flow logs with `properties.targetResourceId`, `properties.enabled` and `properties.flowAnalyticsConfiguration`. Whether ARG exposes all properties is not stated (Open point 13).

#### 4.3 Inheritance

- "If you configure virtual network flow logs at the NIC, subnet, and virtual network levels, the enablement preference follows this order: NIC > subnet > virtual network." [Manage VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-manage#create-a-flow-log)
- **Inference**, decision procedure for a Zone (subnet N in VNet V):
  1. Find enabled flow logs with `targetResourceId` = the subnet N, or = V. A flow log on V covers all subnets of V.
  2. Find flow logs on NICs in N. These override for those NICs and can carry different TA settings.
  3. No enabled flow log on N or V (or on its NICs) → "no flow log" → show "—".
  4. Flow log present but `networkWatcherFlowAnalyticsConfiguration.enabled` is false, or `workspaceResourceId` is not the Environment's workspace → "no Traffic Analytics in this workspace" → show "—".
  5. `recordTypes` without `D`, or a non-empty `enabledFilteringCriteria` → data incomplete → flag it.
- Running NSG flow logs and VNet flow logs on the same workload can give "duplicate logging or only virtual network flow logs". [VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#virtual-network-flow-logs-compared-to-network-security-group-flow-logs)
- Data-level check: Traffic Analytics only sees subscriptions that contain a flow log configured to the workspace. Rows can also be missing for resources created within the last 6 hours. [Traffic analytics schema, Notes](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#notes); [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics)
- Other limits for the operator: a Traffic Analytics workspace behind a Network Security Perimeter isn't supported. Flow logs, storage and workspace must be in the same tenant. The workspace may be in another region or subscription. [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics)
- Traffic Analytics creates DCR and DCE resources prefixed `NWTA` in the workspace's resource group; "If you perform any operation on these resources, traffic analytics might not function as expected." [Manage VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-manage)

### 5. Cost drivers for the operator

Prices are not reproduced: both pricing pages showed `$-` placeholders when fetched; prices depend on region and currency.

| Driver | Billing basis | Source |
| --- | --- | --- |
| VNet flow logs collected | Per GB of "Network flow logs collected"; free tier 5 GB/month per subscription. | [VNet flow logs, Pricing](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#pricing); [Network Watcher pricing](https://azure.microsoft.com/pricing/details/network-watcher/) |
| Traffic Analytics processing | Per GB processed. Two rates: "Accelerated processing at 10-min intervals" and "Standard processing at 60-min intervals". "Traffic analytics isn't offered with a free tier of pricing." | [VNet flow logs, Pricing](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#pricing); [Network Watcher pricing](https://azure.microsoft.com/pricing/details/network-watcher/) |
| Log Analytics workspace for Traffic Analytics | Footnote 5: "In Traffic Analytics billing, the cost for the Log Analytics Workspace (LAW) is absorbed in the Traffic Analytics pricing." FAQ: "Enhanced logs ingested in Log Analytics workspace can be retained at no charge for up to first 31 days (or 90 days if Microsoft Sentinel is enabled on the workspace)." | [Network Watcher pricing](https://azure.microsoft.com/pricing/details/network-watcher/); [Network Watcher FAQ, How is traffic analytics priced?](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics) |
| Log Analytics retention beyond the included period | Per GB per month (interactive retention up to 2 years, long-term up to 12 years). Queries on Analytics logs are free. | [Azure Monitor pricing](https://azure.microsoft.com/pricing/details/monitor/); [Azure Monitor Logs cost calculations](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/cost-logs) |
| Blob storage of raw flow logs | "Storage of logs is charged separately." Retention policy per flow log (or storage lifecycle rules). Traffic Analytics adds backend storage transactions. | [VNet flow logs, Pricing](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview#pricing); [Azure Blob Storage pricing](https://azure.microsoft.com/pricing/details/storage/blobs/); [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics) |
| Volume factors | VNet flow logs "capture traffic for resources such as gateways by default", "which can lead to a higher volume of log data"; broader scope "may result in higher log volumes". NSG + VNet flow logs on the same workload cause "duplicate traffic recording and additional costs". | [VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-overview) |
| Cross-region workspace | "There won't be any additional cross-region data transfer charges for using a Log Analytics workspace from another region" (when the flow log region has no supported workspace region). | [Traffic analytics overview, Availability](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics#availability) |

Cost levers for documentation: flow log scope (VNet vs subnet vs NIC), filters (`enabledFilteringCriteria`, `recordTypes`), processing interval (10 vs 60 minutes), storage retention, Log Analytics retention. [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics); [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json)

### 6. NSG flow log retirement

- Confirmed (include dated 2026-07-30): "Network security group (NSG) flow logs retire on September 30, 2027. Because the feature is retiring, it no longer supports new NSG flow logs creation." After that date Azure no longer supports Traffic Analytics for NSG flow logs and deletes existing NSG flow log resources; stored records stay under their retention. [NSG flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview); [Migrate to VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-migrate)
- Migration paths: a PowerShell migration script that disables the NSG flow logs and creates equivalent VNet flow logs (for mixed configurations), or the built-in Azure Policy (for uniform configurations or VNet-level logging). [Migrate to VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-migrate)
- `NTANetAnalytics` replaces `AzureNetworkAnalytics_CL`. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- **Inference:** supporting only VNet flow logs fits the docs: NSG flow logs can no longer be created, the remaining ones are deleted on 2027-09-30, and only VNet flow logs record AVNM decisions. Until that date an Environment can still have NSG flow logs. nsgfw would then show "—" for those Zones, unless it also reads `AzureNetworkAnalytics_CL` (out of scope here).
- The Learn pages give no date from which creation of new NSG flow logs stopped. The linked announcement URL (`azure.microsoft.com/updates/v2/Azure-NSG-flow-logs-Retirement`) rendered an empty update list when fetched. See Open point 14.

## Open points

1. **`AclRule` format for user-defined NSG rules.** The docs show `DefaultRule_<name>` for default rules in raw VNet flow logs and say only `NSG_Rule_Name` for `AclRule`. Unknown: does a user rule appear as `<name>`, `UserRule_<name>` or otherwise, and is casing preserved? Check: hit a custom rule and compare raw `rule` with `AclRule`.
2. **Truncation of long rule names** in VNet flow logs and `AclRule`. The 65-character note exists only for NSG flow logs; nsgfw rule names may be up to 80 characters. Check: a 70–80 character rule name, then inspect the raw blob and `NTANetAnalytics`.
3. **`AclGroup` and `AclRule` values for AVNM decisions, platform rules and `unspecified`.** The table reference says `AclGroup` holds "the network group" for AVNM, but gives no format; platform-rule and encryption-deny rows are undescribed for Traffic Analytics. Needed so nsgfw can separate NSG-rule hits from other rows.
4. **Format and casing of `SrcSubnet` / `DestSubnet`** compared with ARM IDs. Also: are they filled for `AzurePublic`, `ExternalPublic`, `Unknown` and gateway flows? Do Zones with the same RG/VNet/subnet names in different subscriptions collide unless `SrcSubscription`/`DestSubscription` is used too?
5. **Value encoding of `FlowDirection`, `FlowStatus`, `SubType`, `MacAddress`.** Schema: `I`/`O`, `A`/`D`, `FlowLog`. Sample queries: `"Inbound"`/`"Outbound"` and colon-separated MACs. Table reference: `Flowlog`. Check the actual values.
6. **Double counting.** A flow between two NICs in logged subnets may be captured at both NICs (`MacAddress` differs) and so appear in two rows. With subnet and NIC NSGs, it is unknown whether one flow appears under both NSGs' rules. Affects both hit counts and the Flow view.
7. **Resource-context access to `NTANetAnalytics`.** "Resource types: -" and no listed `_ResourceId` suggest resource-context queries return nothing. Confirm, so the nsgfw Reader role can be scoped to the workspace (or to the table via ABAC).
8. **Which table-level permission to put in nsgfw Reader.** Options: the legacy `workspaces/query/NTANetAnalytics/read`, the listed but unexplained `workspaces/tables/query/read`, or the DataAction `workspaces/tables/data/read` with a table-name condition. Open: whether one custom role with Actions + DataAction + condition works in all access control modes and under `DataActionsOnly`.
9. **Token for managed identity / service principal.** The access page says the client credentials flow works with `resource=https://api.loganalytics.io` on the direct endpoint. The timeouts page lists a "Client credentials to direct API" error and points to the ARM endpoint, whose URL form the pages read don't give. Check with a user-assigned managed identity.
10. **`workspaceId` in the flow log TA config vs. the query API workspace ID.** The spec calls it "The resource guid of the attached workspace"; the query API needs "the GUID of the Log Analytics workspace". Are they the same value (customer ID)? Otherwise nsgfw must read the workspace resource.
11. **End-to-end latency.** Only "up to 1 hour" for ingestion and the 10/60-minute interval are documented; no SLA, no statement on late or missed intervals. Measure: the age of the newest `FlowEndTime` at both interval settings.
12. **Whether `NTANetAnalytics` ingestion is billed** in addition to Traffic Analytics processing. The pricing footnote says the LAW cost is "absorbed". Azure Monitor pricing says ingestion is charged. The FAQ only mentions free retention. Check `_IsBillable` and `_BilledSize` on real rows.
13. **Completeness of flow logs in Resource Graph.** The flowlogs type is listed in `resources`, but no page confirms that `properties.flowAnalyticsConfiguration`, `enabled` and filters appear there, or how fresh they are. Subnets and NICs have no `flowLogs` back-reference, so discovery depends on listing all flow logs.
14. **Date from which new NSG flow logs could no longer be created.** Not stated on Learn; the announcement page didn't render. Only relevant if docs for operators need it.

## Facts that design decisions depend on

- A Zone's flows are in `NTANetAnalytics` rows whose `SrcSubnet`/`DestSubnet` (`<RG>/<VNet>/<Subnet>`, no subscription) match the Zone. A rule's hits are in rows whose `AclGroup` (`<Sub>/<RG>/<NSG>`) and `AclRule` match. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema)
- One `NTANetAnalytics` row belongs to exactly one NSG rule (aggregation key includes NSG name and rule). [Traffic analytics schema, Data aggregation](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#data-aggregation)
- Denied flows are recorded (`FlowStatus` `D`, `Denied*Flows`) unless the flow log filters them out; ICMP is never recorded. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema); [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json); [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#flow-logs)
- Data is 10–60 minutes (interval) plus up to 1 hour (ingestion) behind; new resources can be "Unknown" for up to 6 hours. [Traffic analytics schema](https://learn.microsoft.com/en-us/azure/network-watcher/traffic-analytics-schema#data-aggregation); [Network Watcher FAQ](https://learn.microsoft.com/en-us/azure/network-watcher/frequently-asked-questions#traffic-analytics)
- The flow log resource tells nsgfw, with `flowLogs/read` only, whether a Zone is covered (`targetResourceId`, `enabled`, NIC > subnet > VNet) and whether Traffic Analytics sends to the Environment's workspace (`networkWatcherFlowAnalyticsConfiguration.enabled`, `workspaceResourceId`). [networkWatcher.json](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/networkWatcher.json); [Manage VNet flow logs](https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-manage)
- A custom role can carry everything nsgfw Reader needs: Actions `OperationalInsights/workspaces/read`, `.../query/read`, optional `.../query/NTANetAnalytics/read`, plus `Network/networkWatchers/read` and `.../flowLogs/read`, and the DataAction `OperationalInsights/workspaces/tables/data/read`. [Manage access](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access); [Manage table-level access](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-table-access); [Network Watcher RBAC](https://learn.microsoft.com/en-us/azure/network-watcher/rbac-permissions)
- Missing table permissions can yield HTTP 200 with no rows instead of an error, so an empty result must not be shown as "0 hits" without a permission check. [Manage access, Protected tables](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access#protected-tables-preview); [Querying logs for Azure resources](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/azure-resource-queries#partial-access)
- Query API per-identity limits (200 requests / 30 s, 5 concurrent, 500,000 rows, 10-minute maximum) apply to nsgfw as a whole, because it queries with one identity. [Azure Monitor service limits](https://learn.microsoft.com/en-us/azure/azure-monitor/fundamentals/service-limits)
