# ARM and Resource Graph behaviour for NSG deployment

Research for GitHub issue #4. Retrieval date for every source: 2026-11-09. Sources are listed at the end with the "last updated" date that each page showed on that day, or with the API version or package version for reference pages and source code. Citations use the IDs `[S1]` to `[S57]`.

Facts and options only. This file makes no design decision for nsgfw.

## Ticket question

How do the ARM REST API, the Azure SDK for JavaScript and Azure Resource Graph behave for the operations nsgfw needs, and which RBAC actions does each operation require?

## Versions examined

- Microsoft Learn REST reference for Microsoft.Network: api-version `2026-01-01` (the version the pages showed). [S13]–[S18]
- `Azure/azure-rest-api-specs`, `specification/network/resource-manager/Microsoft.Network/Network/stable/`: newest stable folder is `2026-03-01`; its `virtualNetwork.json` was inspected directly. [S19]
- `@azure/arm-network` 39.1.0 (CHANGELOG dated 2026-10-09, generated from TypeSpec). `@azure/core-lro` 3.4.2. `@azure/core-rest-pipeline` delegates its retry policy to `@typespec/ts-http-runtime`. `@azure/arm-resourcegraph` 5.0.0. All read from the `main` branch of `Azure/azure-sdk-for-js`. [S24]–[S27]
- Resource Graph REST API: api-version `2024-04-01`. [S44]

## Summary

- **NSG updates.** The NSG resource holds its rules in `properties.securityRules`; each rule is also a child resource with its own PUT and DELETE. Both are long-running operations. Priorities 100–4096 must be unique per direction. No document states whether a whole-NSG PUT is applied atomically, whether it may swap priorities in one request, or whether omitting `securityRules` deletes rules. These are candidates for an empirical check. [S3][S13][S15][S19]
- **Optimistic concurrency.** NSGs, security rules, subnets, NICs and ASGs return a read-only `etag` ("changes whenever the resource is updated"). Neither the 2026-03-01 spec nor the Learn REST reference declares an `If-Match` request header for any of their write operations; in the Network spec only `ipamPools` and `verifierWorkspaces` declare it. `@azure/arm-network` therefore has no `ifMatch` option for these operations. Whether the Network RP honours `If-Match` anyway is undocumented. [S13]–[S19][S27]
- **Long-running operations.** NSG, rule, subnet, NIC and ASG PUTs return `Azure-AsyncOperation` plus `Retry-After` (`final-state-via: azure-async-operation`); DELETEs use `Location`. `provisioningState` terminal values are Succeeded, Failed, Canceled. `@azure/core-lro` polls every 2,000 ms by default, honours `Retry-After`, and does a final GET on the original URI for PUT. No document gives typical durations. [S2][S13][S19][S26]
- **Throttling.** ARM uses a token bucket per region: per subscription and per service principal, writes and deletes have bucket 200 / refill 10 per second, reads 250 / 25 per second; a global subscription limit is 15× the per-principal limit. Microsoft.Network adds its own limits: 1,000 writes/deletes and 10,000 reads per 5 minutes. 429 carries `Retry-After`. The Network RP also returns 429 with `RetryableErrorDueToAnotherOperation` when another operation locks the resource. The JS SDK default retry: 3 retries; 429/503 with a retry-after header honoured; 408/5xx (except 501/505) and listed socket errors retried with exponential backoff from 1 s to 64 s with jitter. [S1][S24][S25]
- **Subnet association.** Subnets have only PUT, GET, DELETE (plus prepare/unprepare network policies); no PATCH exists. The NSG reference is `properties.networkSecurityGroup` inside the full subnet body, next to `serviceEndpoints`, `delegations`, `routeTable`, `natGateway` and other writable properties. The NSG must be in the same subscription and location as the VNet. Join permission on the NSG is required. [S6][S4][S16][S19]
- **ASG membership.** Membership is a property of each NIC IP configuration (`applicationSecurityGroups`), written with a full NIC PUT (NIC PATCH updates tags only). For VM Scale Sets it lives in the scale-set model; existing instances pick it up only when brought to the latest model (upgrade policy). AKS adds node pools to ASGs through the AKS API (`--asg-ids`), and AKS does not support direct changes to node IaaS resources. Private endpoints carry their own `applicationSecurityGroups` property; ASG rules apply only if network policies for NSGs are enabled on the subnet. [S5][S7][S17][S19][S28]–[S37]
- **Resource Graph.** NSGs, VNets (with subnets embedded), NICs, ASGs and private endpoints are in the `Resources` table; scale-set instance NICs of Uniform scale sets are in `ComputeResources`. Results are eventually consistent ("short latency"; GET/LIST API: "typically just a few seconds"). Max 1,000 rows per page, `$skipToken` paging, management-group scope covers the first 10,000 subscriptions, per-user quota (example: 15 queries per 5 seconds). [S39]–[S45]
- **Change signals.** Resource Graph `resourcechanges`: records available in under 5 minutes, kept 14 days, with `changedBy`, `clientType`, `operation`. Activity Log: available in 3–20 minutes, kept 90 days, `caller` and `claims`. Event Grid subscription system topic: events for PUT/PATCH/POST/DELETE (not GET) with `authorization`, `claims`, `correlationId`; at-least-once delivery, no ordering guarantee, retries up to 24 hours by default. [S46]–[S54]
- **Least privilege.** Microsoft documents action-level tables for NSGs, rules, ASGs, subnets, NICs and private endpoints. Associations need the `join` action on the referenced resource (`networkSecurityGroups/join/action`, `applicationSecurityGroups/joinIpConfiguration/action`, `applicationSecurityGroups/joinNetworkSecurityRule/action`); missing ones fail with `LinkedAuthorizationFailed`. The full table is below. [S4][S6][S7][S8][S38][S56][S57]

## Findings per Covers bullet

### 1. NSG updates: whole-NSG PUT vs. security rule child resources

**Two write paths exist in the API** [S19]

| Operation ID | Method and path (relative to the resource group) | LRO |
| --- | --- | --- |
| `NetworkSecurityGroups_CreateOrUpdate` | `PUT …/networkSecurityGroups/{nsg}` | yes, `final-state-via: azure-async-operation` |
| `NetworkSecurityGroups_UpdateTags` | `PATCH …/networkSecurityGroups/{nsg}` (body: tags only) | no |
| `NetworkSecurityGroups_Delete` | `DELETE …/networkSecurityGroups/{nsg}` | yes, `final-state-via: location` |
| `SecurityRules_CreateOrUpdate` | `PUT …/networkSecurityGroups/{nsg}/securityRules/{rule}` | yes, `azure-async-operation` |
| `SecurityRules_Delete` | `DELETE …/networkSecurityGroups/{nsg}/securityRules/{rule}` | yes, `location` |
| `SecurityRules_List` / `_Get` | `GET …/securityRules[/{rule}]` | no |
| `DefaultSecurityRules_List` / `_Get` | `GET …/defaultSecurityRules[/{rule}]` | no |

- The only PATCH on an NSG is `UpdateTags`; its body is a tags object. There is no PATCH that changes rules. [S14][S19]
- Writable NSG properties in the 2026-03-01 spec: `securityRules` ("A collection of security rules of the network security group") and `flushConnection`. Read-only: `defaultSecurityRules`, `networkInterfaces`, `subnets`, `flowLogs`, `resourceGuid`, `provisioningState`. [S19]
- `flushConnection`: "When enabled, flows created from Network Security Group connections will be re-evaluated when rules are updates. Initial enablement will trigger re-evaluation." Without it, "New or updated rules in a network security group apply exclusively to new connections, leaving existing connections unaffected by the changes." [S3][S19]
- General ARM contract: PUT is for replace, PATCH for partial update (JSON merge-patch), rule RPC009 of the ARM RPC as tracked by the TypeSpec Azure team. [S21] The canonical ARM RPC document is not publicly available on GitHub at the time of retrieval (the `Azure/azure-resource-manager-rpc` repository returns 404; only third-party forks exist), so it is not cited.
- For VNets Microsoft documents a behaviour change of the same pattern (collection property inside a parent PUT): "Previously, omitting the subnet property would result in the deletion of existing subnets. With the new behavior, if the subnet property isn't included in a PUT request, the existing subnets remain unchanged. Explicitly setting the subnet property to an empty value deletes all existing subnets." Bicep guidance: "Subnets should always be managed as child resources, and the subnets property should never be defined within the virtual network resource." No equivalent statement exists for `securityRules` on NSGs. See U1. [S20]

**Atomicity**

- No Microsoft document states that a whole-NSG PUT applies all rule changes atomically, nor what state is visible to traffic while `provisioningState` is `Updating`. See U2.
- Each child-resource PUT or DELETE is a separate ARM operation with its own LRO and its own write against the throttling limits (section 4). A change of N rules through child resources is N operations with no transaction across them. [S1][S19]

**Priority collisions during renumbering**

- Spec: "The value can be between 100 and 4096. The priority number must be unique for each rule in the collection." [S19]
- NSG overview: "You can't create two security rules with the same priority and direction." [S3]
- Manage-NSG page: "A value between 100 and 4096 that is unique for all security rules within the NSG", and it recommends gaps ("such as 100, 200, and 300"). [S4]
- The scope of uniqueness differs between these pages (per direction vs. per NSG). The sibling research file `docs/research/nsg-asg-semantics-and-limits.md` records the same conflict.
- No document says whether the RP validates uniqueness against the final state of a whole-NSG PUT (so that two rules can swap priorities in one request) or whether a child-rule PUT that collides with an existing rule fails. Inference only, not documented: with child-resource PUTs, a swap needs a free intermediate priority. See U3.

### 2. Optimistic concurrency: ETag and If-Match

- `etag` exists on `NetworkSecurityGroup`, `SecurityRule`, `Subnet`, `NetworkInterface` and `ApplicationSecurityGroup` in the 2026-03-01 spec, each described as "A unique read-only string that changes whenever the resource is updated." and marked `readOnly`. [S19]
- The PUT, PATCH and DELETE operations for these five resource types declare no header parameters (only `api-version`, `subscriptionId`, `resourceGroupName`, resource names and body). In the whole 2026-03-01 `virtualNetwork.json`, `If-Match` is declared only for `networkManagers/{}/ipamPools/{}` and `networkManagers/{}/verifierWorkspaces/{}`. [S19]
- The Learn REST reference pages for NSG, security rule, subnet, NIC and ASG CreateOrUpdate (api-version 2026-01-01) list no request headers either. [S13][S15]–[S18]
- `@azure/arm-network` 39.1.0: `NetworkSecurityGroupsCreateOrUpdateOptionalParams` has only `updateIntervalInMs` (plus the generic `OperationOptions`); no `ifMatch`. Generic `requestOptions` allow custom headers, but the effect on the Network RP is undocumented. [S27]
- For comparison, where an RP supports ETags, Microsoft documents the behaviour explicitly, for example AKS: `If-Match` makes the operation run only when the ETag matches; `If-None-Match: *` validates that the resource does not exist; a mismatch fails early. [S22] Nothing comparable exists for Microsoft.Network NSGs, subnets, NICs or ASGs.
- Consequence for facts only: optimistic concurrency on these resources is not documented as server-enforced. Whether a stale `If-Match` returns 412 is an empirical question. See U4.

### 3. Long-running operations

**ARM behaviour** [S2]

- An async operation first returns 201 or 202. Poll the `Azure-AsyncOperation` URL if present; otherwise poll `Location`. Use `Retry-After` (seconds) between polls; if absent, "implement your own retry logic".
- The status body always has `status`; on Failed or Canceled it has `error` with `code` and `message`.
- `provisioningState`: Succeeded, Failed and Canceled are terminal; every other value means the operation is still running.
- REST clients must accept status URLs of at least 4 KB.
- Permission: "To track the status of an asynchronous operation, you need sufficient permission at the resource group level. If you only have permission at the resource level, you can start the operation but you can't track its status." The Network status URL is subscription-scoped (`/subscriptions/{id}/providers/Microsoft.Network/locations/{region}/operations/{operation-id}`); the matching RBAC actions are `Microsoft.Network/locations/operations/read` and `Microsoft.Network/locations/operationResults/read`. [S2][S8] See U5.

**Network RP specifics** [S13][S19]

- PUT on NSG, security rule, subnet, NIC, ASG: responses 200 (update) or 201 (create); 201 carries `Azure-AsyncOperation` and `Retry-After`. Spec: `x-ms-long-running-operation: true`, `final-state-via: azure-async-operation`.
- DELETE on the same types: 200, 202 or 204; `final-state-via: location`.

**Azure SDK for JavaScript** [S26][S27]

- `@azure/arm-network` operations such as `networkSecurityGroups.createOrUpdate` return a `PollerLike` built by `getLongRunningPoller` → `createHttpPoller` from `@azure/core-lro`. Expected initial statuses: 200, 201, 202. Option `updateIntervalInMs` sets the poll interval.
- `@azure/core-lro`: default poll interval `POLL_INTERVAL_IN_MS = 2000`. A server `Retry-After` value replaces the interval for the next poll; invalid or non-positive values fall back to the configured interval; values are capped at 2,147,483,647 ms.
- For PUT, the final resource is read from the original request path; for DELETE no final GET is made. Terminal states: succeeded, canceled, failed.
- Pollers can be serialised and resumed (`restoreFrom`), which the generated helper exposes. [S27]

**Typical durations**: no Microsoft document gives durations for NSG, rule, subnet, NIC or ASG operations. See U6.

### 4. Throttling

**ARM limits (token bucket, per region)** [S1]

| Scope | Operations | Bucket size | Refill per second |
| --- | --- | --- | --- |
| Subscription | reads | 250 | 25 |
| Subscription | deletes | 200 | 10 |
| Subscription | writes | 200 | 10 |
| Tenant | reads | 250 | 25 |
| Tenant | deletes | 200 | 10 |
| Tenant | writes | 200 | 10 |

- "The subscription limits apply per subscription, per service principal, and per operation type. There are also global subscription limits that are equivalent to 15 times the individual service principal limits for each operation type." Limits may be lower for free or trial customers.
- Background job throttling exists separately; message: "The request for subscription '{0}' could not be processed due to an excessive volume of traffic. Please try again later."
- The page says throttling is now per region, yet its resource-provider section still says "Resource Manager throttles by instance of Resource Manager". See U7.

**Microsoft.Network RP limits** [S1]

| Operation | Limit |
| --- | --- |
| write / delete (PUT) | 1,000 per 5 minutes |
| read (GET) | 10,000 per 5 minutes |

RP limits apply "within each subscription … per region of the resource in the request". The page does not state whether the Network limit is per principal or shared. See U7.

**Responses and headers** [S1]

- Throttled: HTTP 429 with `Retry-After` (seconds). A request sent before that time is not processed and gets a new value.
- 429 can also mean a temporary resource condition: "the network resource provider returns 429 with the RetryableErrorDueToAnotherOperation error code when another operation locks the target resource." Read the error code to tell the two apart.
- Remaining-quota headers: `x-ms-ratelimit-remaining-subscription-reads`, `-writes`, `-deletes`, `x-ms-ratelimit-remaining-tenant-reads`, `-writes`, and, when an RP overrides defaults, `x-ms-ratelimit-remaining-subscription-resource-requests`, `…-resource-entities-read` and tenant equivalents.

**Resource Graph throttling**: see section 7.

**ARG GET/LIST offload** [S45]

- Appending `&useResourceGraph=true` to an ARM GET or LIST routes it to Resource Graph to reduce RP read throttling. Default quota 4,000 requests per minute per user per subscription; headers `x-ms-user-quota-remaining` and `x-ms-user-quota-resets-after`. ARM throttling still applies first.
- Data has "bounded staleness … typically just a few seconds". HTTP 422 from this path is permanent; fall back to the RP by removing the flag.

**SDK retry defaults** [S24][S25]

- `@azure/core-rest-pipeline` adds `defaultRetryPolicy(options.retryOptions)` in the Retry phase of every pipeline; the implementation is in `@typespec/ts-http-runtime`.
- Strategies, in order: `throttlingRetryStrategy`, then `exponentialRetryStrategy`. Max retries `DEFAULT_RETRY_POLICY_COUNT = 3` (configurable `maxRetries`).
- Throttling strategy: only for status 429 or 503; reads `retry-after-ms`, `x-ms-retry-after-ms`, then `Retry-After` (seconds or HTTP date) and waits that long.
- Exponential strategy: for status 408 and ≥ 500 except 501 and 505, and for system errors `ETIMEDOUT`, `ESOCKETTIMEDOUT`, `ECONNREFUSED`, `ECONNRESET`, `ENOENT`, `ENOTFOUND`. Delay `retryDelayInMs × 2^attempt` (default 1,000 ms), capped at `maxRetryDelayInMs` (default 64,000 ms), with jitter: half the delay plus a random value up to half.
- From the code: a 429 or 503 without any retry-after header is skipped by the throttling strategy, and the exponential strategy skips 429 (not in its status set). Such a 429 is therefore not retried by default. Whether the Network RP's `RetryableErrorDueToAnotherOperation` 429 carries `Retry-After` is undocumented. See U8.

### 5. Subnet association: setting a subnet's NSG

- Subnet operations in the spec: `Subnets_CreateOrUpdate` (PUT, LRO), `Subnets_Get`, `Subnets_Delete`, `Subnets_List`, `Subnets_PrepareNetworkPolicies`, `Subnets_UnprepareNetworkPolicies`, plus read-only lists of resource navigation links and service association links. There is no PATCH for subnets. [S19]
- Writable subnet properties in 2026-03-01 (all sent in the same PUT body): `addressPrefix`, `addressPrefixes`, `networkSecurityGroup`, `routeTable`, `natGateway`, `serviceEndpoints`, `serviceEndpointPolicies`, `ipAllocations`, `delegations`, `privateEndpointNetworkPolicies`, `privateLinkServiceNetworkPolicies`, `applicationGatewayIPConfigurations`, `sharingScope`, `defaultOutboundAccess`, `ipamPoolPrefixAllocations`, `serviceGateway`. Read-only: `privateEndpoints`, `ipConfigurations`, `ipConfigurationProfiles`, `resourceNavigationLinks`, `serviceAssociationLinks`, `purpose`, `provisioningState`. [S19]
- Following the ARM PUT-is-replace rule [S21], a subnet PUT that sets only `networkSecurityGroup` would carry no other writable properties. No Microsoft page states what the Network RP does with omitted subnet properties (reset, keep, or reject). The usual client pattern of GET then PUT the full body with only `networkSecurityGroup` changed is not documented as required either. See U9.
- Because subnets have no ETag-based concurrency (section 2), a GET-modify-PUT can overwrite a concurrent change to another subnet property. This follows from sections 1 and 2; no document addresses it.
- Constraint: "The NSG must exist in the same subscription and location as the virtual network." [S6] The subnet schema holds a single `networkSecurityGroup` reference. [S19]
- Delegations: a delegating service "might establish … pre or post deployment conditions", including whether NSG association is supported, whether that NSG may also be associated with other subnets, and "Network Intent Policies post deployment". [S23] The effect of these intent policies on a later subnet PUT that changes only the NSG is not documented. See U10.
- Service endpoints: the subnet permission table lists `Microsoft.Network/virtualNetworks/subnets/joinViaServiceEndpoint/action` as "Enable a service endpoint for a subnet" [S6], while the RBAC operations reference describes the same action as "Joins resource such as storage account or SQL database to a subnet" [S8]. Whether re-sending unchanged `serviceEndpoints` in a subnet PUT needs this action is undocumented. See U10.
- VNet PUT with a `subnets` array also changes subnets (see the VNet note in section 1). [S20]
- Private endpoint subnets: NSG rules apply to private endpoints only if `privateEndpointNetworkPolicies` enables NSG support on that subnet; the setting is off by default and "affects all private endpoints in the subnet". [S35]

### 6. ASG membership

**NIC IP configuration** [S5][S7][S17][S19][S55]

- ASG membership is `properties.ipConfigurations[].properties.applicationSecurityGroups` on the NIC. NIC write paths: `NetworkInterfaces_CreateOrUpdate` (PUT, LRO) and `NetworkInterfaces_UpdateTags` (PATCH, tags only). `NetworkInterfaceIPConfigurations_Get`/`_List` are read-only; IP configurations have no own PUT. Membership changes therefore go through a full NIC PUT. [S19]
- NIC fields `virtualMachine` and `privateEndpoint` are read-only references. [S19]
- Constraints: "You can add NICs only to application security groups in the same virtual network and location as the NIC." [S7] "All network interfaces assigned to an application security group must exist in the same virtual network that the first network interface assigned to the application security group is in." [S5]
- Limits: 20 ASGs per IP configuration per NIC; 4,000 IP configurations per ASG; 3,000 ASGs per subscription and region; 10 ASGs per rule; 100 ASGs across all rules of one NSG. [S55]
- The portal can change ASG membership only for NICs attached to a VM; CLI and PowerShell (`az network nic ip-config update`, `Set-AzNetworkInterfaceIpConfig`) work for any NIC. [S7]

**Virtual Machine Scale Sets** [S9][S28]–[S31][S40]

- ASGs for a scale set are set in the model: `virtualMachineProfile.networkProfile.networkInterfaceConfigurations[].ipConfigurations[].applicationSecurityGroups` (CLI view; the ARM JSON nests these under `properties`). [S29]
- "Once the scale set model is updated, the new configuration applies to any new VMs created in the scale set. However, the models for the existing VMs in the scale set must still be brought up-to-date with the latest overall scale set model." Each instance has `latestModelApplied`. [S30]
- Upgrade policy modes: Automatic (no ordering guarantee, may take all instances down at once), Manual ("Nothing happens automatically to the existing virtual machines when changes occur to the scale set model"), Rolling (batches; needs health probe or Application Health extension). [S28]
- Manual bring-up-to-date: `POST …/virtualMachineScaleSets/{name}/manualupgrade` (api-version 2026-04-01), RBAC `Microsoft.Compute/virtualMachineScaleSets/manualUpgrade/action`. [S31][S9]
- Uniform scale-set instance NICs are `microsoft.compute/virtualmachinescalesets/virtualmachines/networkinterfaces` in the Resource Graph `ComputeResources` table, read through `Microsoft.Compute/virtualMachineScaleSets/virtualMachines/networkInterfaces/read`. [S40][S9] For Flexible-orchestration scale sets, the Application Gateway example says the process "is the same as adding standalone VMs … you update the virtual machine's network interface IP configuration". [S29] Whether Flexible instance NICs may be edited directly for ASG membership is undocumented. See U11.
- Whether an ASG change in the model needs a reimage or only an instance update is not in the list of changes that require restart, reimage or redeploy. [S28] See U11.

**AKS node pools** [S32]–[S34]

- Node pools can join ASGs through the AKS API: `az aks create … --nodepool-asg-ids`, `az aks nodepool add|update … --asg-ids` together with `--allowed-host-ports`. A managed ASG is created in the managed resource group if allowed host ports are set. Requires AKS 1.29 or later. [S32]
- "AKS manages the lifecycle and operations of agent nodes on your behalf and modifying the IaaS resources associated with the agent nodes is not supported. An example of an unsupported operation is customizing a node pool virtual machine scale set by manually changing configurations in the Azure portal or from the API." [S33]
- NSG customisation: custom subnets yes, managed subnets no, agent-node NIC level no. "AKS doesn't apply network security groups to its subnet or modify network security groups that you associate with a customer-provided subnet." [S33][S34]

**Private endpoints** [S35]–[S38]

- `PrivateEndpointProperties.applicationSecurityGroups` is writable; `networkInterfaces` is read-only. Private endpoints have only PUT, GET, DELETE (no PATCH). [S19]
- ASGs can be set at creation or added to an existing private endpoint (`az network private-endpoint asg add`); "Associating an ASG with an existing private endpoint with Azure PowerShell is currently unsupported." [S36]
- Network policies for NSGs must be enabled on the subnet for rules that reference the ASG to apply. [S36][S35]
- Limits: "No more than 50 members in an Application Security Group" coupled to the NSG on the private endpoint subnet ("Connection failures may occur with more than 50 members"); destination port ranges are supported up to a product of 250 K (sources × destinations × port ranges); source port filtering is treated as `*`; ASG and NSG support unavailable in some regions (listed on the page). [S37]

### 7. Resource Graph

**Tables and types** [S40][S43]

- `Resources`: `microsoft.network/networksecuritygroups`, `microsoft.network/virtualnetworks`, `microsoft.network/networkinterfaces`, `microsoft.network/applicationsecuritygroups`, `microsoft.network/privateendpoints`, `microsoft.compute/virtualmachinescalesets` and others.
- Subnets are not a separate type in `Resources`; they are inside `properties.subnets` of `microsoft.network/virtualnetworks` (the types reference lists no `virtualnetworks/subnets` type in `Resources`; `NetworkResources` lists only `virtualnetworks/subnets/effectiveroutingrules` and `…/effectivesecurityuserrules`).
- `ComputeResources`: `microsoft.compute/virtualmachinescalesets/virtualmachines` and `…/virtualmachines/networkinterfaces`.
- `NetworkResources`: Azure Virtual Network Manager objects including `microsoft.network/effectivesecurityadminrules`.
- `ResourceContainers`: management groups, subscriptions, resource groups.
- `ResourceChanges`, `ResourceContainerChanges`, `NetworkResourceChanges`: change records.
- Resource Graph reads each RP through "the latest non-preview" API version, sometimes overridden; an expected property may be missing. [S39]

**Query limits** [S43]

- Up to three `join` or `union` operations combined per query (one of them cross-table, or three if all cross-table joins are between `Resources` and `ResourceContainers`); join flavours innerunique, inner, leftouter, fullouter.
- `mv-expand`: at most three per query; "RowLimit max of 2,000. The default is 128." NSGs can hold 2,000 rules [S55], so expanding `securityRules` needs an explicit limit. See U12.
- Increases of the join and `mv-expand` limits can be requested through support.

**Scope** [S39][S42][S43]

- Default scope: subscriptions the principal can access, including Azure Lighthouse delegations.
- REST `managementGroups` takes management-group IDs and covers "the first 10,000 subscriptions in or under the specified management group hierarchy"; it cannot be combined with `subscriptions`. When a principal can access more than 10,000 subscriptions, the header `x-ms-tenant-subscription-limit-hit: true` is returned.
- If a subscription list is given and the principal can access only some, results are partial "without any indication that the result might be partial"; if none, 403. [S39]
- New subscriptions become visible after the principal refreshes its context (new token). [S39]

**Freshness** [S39][S45]

- ARM notifies Resource Graph on each update; a regular full scan catches missed notifications and changes made outside ARM.
- "Azure Resource Graph data isn't strongly consistent. Data is indexed with a short latency." The GET/LIST API page quantifies its own staleness as "typically just a few seconds" and recommends falling back to the RP, "the source of truth", when freshness matters.

**Paging** [S41][S42]

- Default and maximum page size 1,000 (`$top` / `first`); `$skip`; responses with more data carry `$skipToken`, `totalRecords`, `count`, `resultTruncated`.
- No `$skipToken` if the query uses `limit`, `take` or `sample`, or if all output columns are `dynamic` or `null`. Order results by at least one column for repeatable paging.
- Each page costs one query of quota.
- Formats: `Table` (default) or `ObjectArray`.

**Throttling** [S39][S42]

- Per-user quota over a time window; example given: "at most 15 queries within every 5-second window". The value "is subject to change".
- Headers: `x-ms-user-quota-remaining`, `x-ms-user-quota-resets-after` (hh:mm:ss).
- Guidance: group subscriptions into fewer, larger queries (groups below 300 subscriptions) rather than one query per subscription; stagger queries.

**SDK**: `@azure/arm-resourcegraph` 5.0.0 exists in `azure-sdk-for-js`. [S27] Its API surface was not inspected in detail for this file.

### 8. Change signals for drift detection

| Signal | What it captures | Latency | Retention | Actor attribution | Scope |
| --- | --- | --- | --- | --- | --- |
| Resource Graph `resourcechanges` | Create, update, delete through the ARM control plane, with property-level `changes` (`previousValue`, `newValue`, `isTruncated`) | "Change records should be available in less than five minutes. Some change details may show up before others." | 14 days | `changedBy` (UPN or app ID), `changedByType`, `clientType`, `operation` (the RBAC action used, not necessarily the operation), `correlationId` | tenant, management group or subscriptions, via the Resource Graph query API |
| Activity Log (Administrative) | Write, delete and action operations through ARM; start and success/failure records; no read operations | "usually available … within 3 to 20 minutes" | 90 days; longer via diagnostic settings | `caller` (email, UPN or SPN claim), `claims` (JWT), `authorization` (action, role, scope), `correlationId` | subscription; management-group and tenant scopes capture only ARM events |
| Event Grid subscription system topic | PUT, PATCH, POST, DELETE to `management.azure.com`, not GET; event types `Microsoft.Resources.Resource{Write,Delete,Action}{Success,Failure,Cancel}` | push; no figure given | delivery retries up to 24 h (TTL default 1,440 min, max 30 attempts), then drop or dead-letter | `data.authorization`, `data.claims`, `data.correlationId`, `data.operationName` | subscription or resource group; one system topic per source |
| Event Grid ARN Resources system topic | `Microsoft.ResourceNotifications.Resources.CreatedOrUpdated` and `.Deleted`, with full resource payload | push; no figure given | as Event Grid | not listed on the schema page | subscription only |

Sources: [S46][S47] (Resource Graph), [S48][S49] (Activity Log), [S50][S53][S54] (Event Grid subscription topic), [S51][S52] (ARN).

Details:

- Resource Graph changes: snapshots are not kept for deleted resources; `changesCount` is 0 for Create and Delete. New properties introduced by a new API version are not shown as changes. Data-plane changes are not observed. [S46][S47]
- Resource Graph change analysis covers the tables `resources`, `resourcecontainers`, `healthresources`. [S46] Because subnets are part of the VNet resource (section 7), whether a subnet NSG association change appears as a change of the `virtualnetworks` resource, of the subnet ID, or both, is undocumented. See U13.
- Activity Log: management-group diagnostic settings do not receive subscription events without the `hierarchy` property; a subscription-level diagnostic setting is needed for complete export. Query via `GET …/providers/Microsoft.Insights/eventtypes/management/values` with an `eventTimestamp` filter inside the 90-day window. [S48]
- Event Grid subscription topic: `httpRequest` is included only for updates of existing resources and deletes. Delivery is at least once, "doesn't guarantee order", and duplicates are possible. The schema page was last updated 2023-03-15. [S50][S54]
- Event Grid sources listed for system topics include Azure subscriptions and Azure resource groups; no management-group source is listed. A subscription-level system topic needs a resource group and is created in the subscription of the source. [S53]
- ARN Resources topic: "doesn't yet support all the resource types from the resources table of Azure Resource Graph" (page last updated 2023-11-08); whether NSGs, VNets, NICs and ASGs are covered is not listed. See U14. [S51]

### 9. Least privilege

Microsoft publishes action tables for NSGs, rules and ASGs [S4], subnets [S6], NICs [S7] and private endpoints [S38]; descriptions below come from the RBAC operations reference [S8][S9][S10][S11][S12] unless marked.

- "To perform `write` operations on an NSG, the subscription account must have at least `read` permissions for the resource group along with `Microsoft.Network/networkSecurityGroups/write` permission." [S4]
- Service tags: with Network Contributor only at resource-group scope, the full service tag list may be missing; `Microsoft.Network/locations/serviceTags/read` and `Microsoft.Network/locations/serviceTagDetails/read` at subscription scope fix this. [S4]
- Linked access checks: when an operation references another resource, ARM checks the `join` action on that resource and fails with `LinkedAuthorizationFailed` ("has permission to perform action … however, it doesn't have permission to perform …" on the linked scope). [S56][S57]
- Join actions are marked "Not alertable" in the operations reference. [S8]

See the table in the next section.

## Operation → required RBAC actions → why

"Documented" means a Microsoft page lists the action for that task. "Inferred" means the action exists in the operations reference and the operation references that resource, but no page ties the two together; these need the empirical check U15.

| Operation | Required RBAC actions | Why |
| --- | --- | --- |
| Discover via Resource Graph | `*/read` on the target resources (for example `Microsoft.Network/networkSecurityGroups/read`, `Microsoft.Network/virtualNetworks/read`, `Microsoft.Network/networkInterfaces/read`, `Microsoft.Network/applicationSecurityGroups/read`, `Microsoft.Network/privateEndpoints/read`, `Microsoft.Compute/virtualMachineScaleSets/read`, `Microsoft.Compute/virtualMachineScaleSets/virtualMachines/networkInterfaces/read`); `Microsoft.ResourceGraph/resources/read` | Documented: "at least `read` access to the resources you want to query"; rows without read access are silently omitted [S39]. `Microsoft.ResourceGraph/resources/read` "Submits a query on resources …" [S10]; whether a custom role needs it explicitly is U16. |
| Query Resource Graph changes | read on the target resources; `Microsoft.ResourceGraph/resourceChanges/read`; `Microsoft.Resources/changes/read` for the per-resource Changes API | Operations exist [S10]; required set for the `resourcechanges` table is U16. |
| List management groups / subscriptions | `Microsoft.Management/managementGroups/read`; `Microsoft.Resources/subscriptions/read` | Operations exist ("List management groups for the authenticated user", "Gets the list of subscriptions") [S10]. That nsgfw discovery needs them is inferred. |
| Read NSG and rules | `Microsoft.Network/networkSecurityGroups/read`, `…/securityRules/read`, `…/defaultSecurityRules/read` | Documented [S4][S8]. |
| Create or update NSG (whole PUT incl. rules) | `Microsoft.Network/networkSecurityGroups/write`; read on the resource group; `Microsoft.Network/applicationSecurityGroups/joinNetworkSecurityRule/action` on every ASG referenced by a rule | Documented [S4]. The ASG join action is documented as "Join a security rule to an application security group" [S4]; that it is checked during a whole-NSG PUT is inferred (U15). |
| Update NSG tags (managed marker) | `Microsoft.Network/networkSecurityGroups/write` | PATCH UpdateTags is a write on the NSG [S14]. Inferred; no separate tag action is listed for NSGs. |
| Create, update, delete a single rule | `Microsoft.Network/networkSecurityGroups/securityRules/write` / `…/delete`; `…/applicationSecurityGroups/joinNetworkSecurityRule/action` on referenced ASGs | Documented [S4]. |
| Delete NSG | `Microsoft.Network/networkSecurityGroups/delete` | Documented [S4]. |
| Associate NSG with subnet (subnet PUT) | `Microsoft.Network/virtualNetworks/subnets/read`, `…/subnets/write`; `Microsoft.Network/networkSecurityGroups/join/action` on the NSG | Documented: join = "Associate an NSG to a subnet or network interface" [S4]; subnet write [S6]. Additional linked checks for properties re-sent in the full body (route table, NAT gateway, service endpoints, delegations) are U10/U15. |
| Read VNets and subnets | `Microsoft.Network/virtualNetworks/read`, `Microsoft.Network/virtualNetworks/subnets/read` | Documented [S6][S8]. |
| Create, update, delete ASG | `Microsoft.Network/applicationSecurityGroups/write`, `…/delete`, `…/read` | Documented [S4]. |
| List ASG members | `Microsoft.Network/applicationSecurityGroups/listIpConfigurations/action` | Exists [S8]; alternative to Resource Graph. |
| Add NIC to ASG (NIC PUT) | `Microsoft.Network/networkInterfaces/read`, `…/write`; `Microsoft.Network/applicationSecurityGroups/joinIpConfiguration/action` on each ASG; probably `Microsoft.Network/virtualNetworks/subnets/join/action` on the NIC's subnet | NIC actions documented [S7]; ASG join documented as "Join an IP configuration to an application security group" [S4]. Subnet join for a NIC PUT that re-sends an unchanged subnet reference is inferred (U15). |
| Add scale-set model to ASG | `Microsoft.Compute/virtualMachineScaleSets/read`, `…/write`; `Microsoft.Network/applicationSecurityGroups/joinIpConfiguration/action` on each ASG | Compute actions [S9]; ASG join inferred for the scale-set path (U15). |
| Bring scale-set instances to the latest model | `Microsoft.Compute/virtualMachineScaleSets/manualUpgrade/action` | Documented operation [S9][S31]. Only for Manual upgrade policy. |
| Add private endpoint to ASG | `Microsoft.Network/privateEndpoints/read`, `…/write`; `Microsoft.Network/applicationSecurityGroups/joinIpConfiguration/action` | PE actions documented [S38]; ASG join inferred (U15). |
| Enable NSG network policy on PE subnet | `Microsoft.Network/virtualNetworks/subnets/write` | Documented: "necessary for managing private endpoint subnet policies" [S38]. |
| Read NIC-level NSGs and effective rules | `Microsoft.Network/networkInterfaces/read`; `Microsoft.Network/networkInterfaces/effectiveNetworkSecurityGroups/action` | Documented [S7]. |
| Track LROs | `Microsoft.Network/locations/operations/read`, `Microsoft.Network/locations/operationResults/read` | Operations exist [S8]; ARM requires resource-group-level permission to read status URLs [S2]. Scope for the subscription-scoped Network URL is U5. |
| Read service tags | `Microsoft.Network/locations/serviceTags/read`, `Microsoft.Network/locations/serviceTagDetails/read` | Documented, at subscription scope [S4]. |
| Read Activity Log | `Microsoft.Insights/eventtypes/values/read` | "Read Activity Log events" [S11]. |
| Create Event Grid subscription on subscription topic | `Microsoft.EventGrid/systemTopics/read`, `…/systemTopics/write`, `…/systemTopics/eventSubscriptions/write` (and `Microsoft.EventGrid/eventSubscriptions/write` when created as extension resource) | Operations exist [S12]. |
| Subscribe to ARN Resources topic | the Event Grid actions above plus `Microsoft.ResourceNotifications/systemTopics/subscribeToResources/action` | Documented [S52]. |

## Example Resource Graph queries (KQL)

Not executed against Azure (the brief for this ticket forbids Azure calls). Property paths follow the ARM JSON shape of the 2026-03-01 spec [S19]; Resource Graph may use a different API version [S39]. Every query projects `id` or another string column and sorts, so that `$skipToken` paging works [S41]. The managed-NSG tag key is a placeholder.

**NSGs with association counts**

```kusto
resources
| where type =~ 'microsoft.network/networksecuritygroups'
| project id, name, subscriptionId, resourceGroup, location,
    managedTag = tostring(tags['<managed-tag-key>']),
    ruleCount = array_length(properties.securityRules),
    subnetCount = array_length(properties.subnets),
    nicCount = array_length(properties.networkInterfaces),
    flushConnection = tobool(properties.flushConnection)
| order by id asc
```

**NSG rules, one row per rule** (`limit 2000` matches the 2,000-rule maximum [S43][S55])

```kusto
resources
| where type =~ 'microsoft.network/networksecuritygroups'
| mv-expand rule = properties.securityRules limit 2000
| project nsgId = id,
    ruleName = tostring(rule.name),
    direction = tostring(rule.properties.direction),
    priority = toint(rule.properties.priority),
    access = tostring(rule.properties.access),
    protocol = tostring(rule.properties.protocol),
    srcPrefix = tostring(rule.properties.sourceAddressPrefix),
    srcPrefixes = rule.properties.sourceAddressPrefixes,
    srcAsgs = rule.properties.sourceApplicationSecurityGroups,
    dstPrefix = tostring(rule.properties.destinationAddressPrefix),
    dstPrefixes = rule.properties.destinationAddressPrefixes,
    dstAsgs = rule.properties.destinationApplicationSecurityGroups,
    dstPort = tostring(rule.properties.destinationPortRange),
    dstPorts = rule.properties.destinationPortRanges
| order by nsgId asc, direction asc, priority asc
```

**Subnets with their NSG association** (subnets live inside the VNet resource)

```kusto
resources
| where type =~ 'microsoft.network/virtualnetworks'
| mv-expand subnet = properties.subnets limit 2000
| project vnetId = id, subscriptionId, location,
    subnetId = tostring(subnet.id),
    subnetName = tostring(subnet.name),
    addressPrefix = tostring(subnet.properties.addressPrefix),
    addressPrefixes = subnet.properties.addressPrefixes,
    nsgId = tostring(subnet.properties.networkSecurityGroup.id),
    routeTableId = tostring(subnet.properties.routeTable.id),
    delegations = subnet.properties.delegations,
    serviceEndpoints = subnet.properties.serviceEndpoints,
    peNetworkPolicies = tostring(subnet.properties.privateEndpointNetworkPolicies)
| order by subnetId asc
```

Subnets without an NSG: append `| where isempty(nsgId)`.

**Subnets joined to NSG details** (one `mv-expand`, one `join`)

```kusto
resources
| where type =~ 'microsoft.network/virtualnetworks'
| mv-expand subnet = properties.subnets limit 2000
| project subnetId = tostring(subnet.id), nsgId = tolower(tostring(subnet.properties.networkSecurityGroup.id))
| where isnotempty(nsgId)
| join kind=leftouter (
    resources
    | where type =~ 'microsoft.network/networksecuritygroups'
    | project nsgId = tolower(id), nsgName = name, nsgLocation = location, nsgTags = tags
  ) on nsgId
| project subnetId, nsgId, nsgName, nsgLocation, nsgTags
| order by subnetId asc
```

**NICs: NIC-level NSG, subnet and ASG membership per IP configuration**

```kusto
resources
| where type =~ 'microsoft.network/networkinterfaces'
| mv-expand ipconfig = properties.ipConfigurations limit 2000
| project nicId = id, subscriptionId, location,
    nicNsgId = tostring(properties.networkSecurityGroup.id),
    vmId = tostring(properties.virtualMachine.id),
    privateEndpointId = tostring(properties.privateEndpoint.id),
    ipConfigName = tostring(ipconfig.name),
    subnetId = tostring(ipconfig.properties.subnet.id),
    privateIp = tostring(ipconfig.properties.privateIPAddress),
    asgIds = ipconfig.properties.applicationSecurityGroups
| order by nicId asc, ipConfigName asc
```

NIC-level NSGs only: append `| where isnotempty(nicNsgId)`.

**ASGs with member IP configuration counts** (two `mv-expand`, one `join`)

```kusto
resources
| where type =~ 'microsoft.network/applicationsecuritygroups'
| project asgId = tolower(id), name, subscriptionId, location, tags
| join kind=leftouter (
    resources
    | where type =~ 'microsoft.network/networkinterfaces'
    | mv-expand ipconfig = properties.ipConfigurations limit 2000
    | mv-expand asg = ipconfig.properties.applicationSecurityGroups limit 2000
    | project asgId = tolower(tostring(asg.id))
    | summarize memberIpConfigs = count() by asgId
  ) on asgId
| project asgId, name, subscriptionId, location, tags, memberIpConfigs = coalesce(memberIpConfigs, 0)
| order by asgId asc
```

This counts only NICs in the `Resources` table. Uniform scale-set instance NICs are in `ComputeResources` (next query); private endpoint ASGs are on the private endpoint resource.

**Scale-set model ASGs and upgrade policy**

```kusto
resources
| where type =~ 'microsoft.compute/virtualmachinescalesets'
| mv-expand nicCfg = properties.virtualMachineProfile.networkProfile.networkInterfaceConfigurations
| mv-expand ipCfg = nicCfg.properties.ipConfigurations
| project vmssId = id,
    orchestrationMode = tostring(properties.orchestrationMode),
    upgradeMode = tostring(properties.upgradePolicy.mode),
    subnetId = tostring(ipCfg.properties.subnet.id),
    asgIds = ipCfg.properties.applicationSecurityGroups
| order by vmssId asc
```

**Uniform scale-set instance NICs** (table from [S40]; the property shape of this type is not documented, see U11)

```kusto
computeresources
| where type =~ 'microsoft.compute/virtualmachinescalesets/virtualmachines/networkinterfaces'
| mv-expand ipconfig = properties.ipConfigurations
| project nicId = id,
    subnetId = tostring(ipconfig.properties.subnet.id),
    asgIds = ipconfig.properties.applicationSecurityGroups
| order by nicId asc
```

**Private endpoints with ASGs**

```kusto
resources
| where type =~ 'microsoft.network/privateendpoints'
| project peId = id, subscriptionId, location,
    subnetId = tostring(properties.subnet.id),
    asgIds = properties.applicationSecurityGroups,
    nicIds = properties.networkInterfaces
| order by peId asc
```

**Recent changes to NSG-relevant resources** (drift signal)

```kusto
resourcechanges
| extend changeTime = todatetime(properties.changeAttributes.timestamp),
         targetType = tostring(properties.targetResourceType)
| where targetType in~ ('microsoft.network/networksecuritygroups',
                        'microsoft.network/virtualnetworks',
                        'microsoft.network/networkinterfaces',
                        'microsoft.network/applicationsecuritygroups',
                        'microsoft.network/privateendpoints')
| where changeTime > ago(1d)
| project changeTime,
    changeType = tostring(properties.changeType),
    targetResourceId = tostring(properties.targetResourceId),
    changedBy = tostring(properties.changeAttributes.changedBy),
    changedByType = tostring(properties.changeAttributes.changedByType),
    clientType = tostring(properties.changeAttributes.clientType),
    operation = tostring(properties.changeAttributes.operation),
    correlationId = tostring(properties.changeAttributes.correlationId),
    changes = properties.changes
| order by changeTime desc
```

## Uncertain — candidates for an empirical check

- **U1. Omitted `securityRules` in a whole-NSG PUT.** Does it delete all custom rules, keep them, or fail? The VNet/subnets precedent changed over time [S20]; nothing is published for NSGs.
- **U2. Atomicity of a whole-NSG PUT.** Are all rule changes applied together for traffic, or rule by rule while `provisioningState` is `Updating`? What happens to rules on a Failed PUT?
- **U3. Priority uniqueness and swaps.** Scope (per direction vs. per NSG; pages disagree [S3][S4]). Can one NSG PUT swap two priorities? Does a child-rule PUT that collides fail, and with which error code?
- **U4. `If-Match` on Network resources.** Does the Network RP evaluate `If-Match` / `If-None-Match` on NSG, rule, subnet, NIC and ASG writes even though the spec does not declare it? Does a stale value return 412? Does the ETag of the NSG change when a child rule changes, and does a subnet ETag change when the VNet changes?
- **U5. LRO status permission scope.** The Network status URL is subscription-scoped; the ARM page says resource-group-level permission is needed [S2]. Does a role assigned only at resource-group scope suffice to poll `…/locations/{region}/operations/{id}`?
- **U6. Typical LRO durations** for NSG PUT (with many rules), rule PUT, subnet PUT, NIC PUT, ASG PUT. Not documented.
- **U7. Throttling scope.** The ARM page mixes per-region and per-instance wording [S1]. Is the Network RP limit (1,000 writes per 5 min) per subscription and region for all principals together, or per principal? Do child-rule PUTs and whole-NSG PUTs count the same?
- **U8. `RetryableErrorDueToAnotherOperation`.** Does this 429 carry `Retry-After`? If not, the JS SDK default policy does not retry it [S25]. Is it returned for concurrent child-rule writes to the same NSG, or for a subnet PUT while the NSG is updating?
- **U9. Omitted subnet properties in a subnet PUT.** Are `serviceEndpoints`, `delegations`, `routeTable`, `natGateway`, `privateEndpointNetworkPolicies` and others reset, kept or rejected when omitted?
- **U10. Subnet PUT on delegated subnets and subnets with service endpoints.** Do network intent policies of a delegated service block or alter an NSG change? Does re-sending unchanged `serviceEndpoints` or `delegations` require `joinViaServiceEndpoint/action` or service-specific actions?
- **U11. Scale sets.** Does an ASG change in the model need reimage, or only an instance update? Can Flexible-orchestration instance NICs be changed directly? What is the property shape of `ComputeResources` instance NIC rows?
- **U12. `mv-expand` limit semantics.** Is "RowLimit max of 2,000. The default is 128" [S43] per input row (as in Kusto) or per query? Is an expansion that exceeds the limit truncated silently?
- **U13. Subnet changes in `resourcechanges`.** Does an NSG association change on a subnet appear as an update of the VNet resource with a `properties.subnets[…]` path, and is `changedBy` populated for it?
- **U14. ARN Resources topic coverage.** Are `microsoft.network/networksecuritygroups`, `virtualnetworks`, `networkinterfaces` and `applicationsecuritygroups` emitted? Does the payload include actor information?
- **U15. Linked access checks per operation.** Exactly which `join` actions ARM checks for: whole-NSG PUT with ASG references, NIC PUT that re-sends an unchanged subnet reference, scale-set model update with ASGs, private endpoint PUT with ASGs, subnet PUT that re-sends route table, NAT gateway, service endpoint or delegation references.
- **U16. Resource Graph actions in a custom role.** Is `Microsoft.ResourceGraph/resources/read` (and `resourceChanges/read`) needed explicitly, or is resource read access enough?
- **U17. Event Grid latency.** No figure is published for the delay between an ARM write and the subscription-topic or ARN event.

## Facts that open design tickets depend on

- Rules can be written as a whole-NSG PUT or as individual child-resource PUT/DELETE operations; both are LROs; NSG PATCH changes tags only. [S14][S19]
- No published guarantee of atomicity for a whole-NSG PUT, and no published behaviour for omitted `securityRules`. (U1, U2)
- Rule priority range 100–4096, uniqueness required; documented scope differs between pages. (U3) [S3][S4][S19]
- NSG, rule, subnet, NIC and ASG writes declare no `If-Match`; the SDK offers no ETag option for them. Server-side optimistic concurrency is not documented. (U4) [S19][S27]
- Rule updates affect only new connections unless `flushConnection` is enabled on the NSG. [S3][S19]
- ARM write limits: 200-token bucket, 10 per second refill per subscription per principal per region; Microsoft.Network: 1,000 writes/deletes per 5 minutes. [S1]
- Network RP returns 429 `RetryableErrorDueToAnotherOperation` when another operation locks the resource. [S1]
- JS SDK defaults: 3 retries; 429/503 only with a retry-after header; exponential 1–64 s with jitter for 408 and 5xx; LRO poll 2 s or `Retry-After`. [S25][S26]
- Subnets have no PATCH; the NSG association is set through a full subnet PUT; the NSG must be in the same subscription and location as the VNet. [S6][S19]
- ASG membership is per NIC IP configuration and needs a full NIC PUT; NICs and ASGs must share VNet and location; 20 ASGs per IP configuration; 4,000 IP configurations per ASG. [S5][S7][S55]
- Scale-set ASG membership is in the model; existing instances follow only per upgrade policy (Manual needs `manualupgrade`). [S28][S30][S31]
- AKS: changing node pool IaaS resources directly is unsupported; node pools join ASGs through the AKS API only. [S32][S33]
- Private endpoints: ASGs on the private endpoint resource; NSG rules apply only with NSG network policies enabled on the subnet; 50-member ASG limit for this case. [S35]–[S37]
- Resource Graph: eventually consistent ("short latency"); 1,000 rows per page; management-group scope capped at 10,000 subscriptions; partial results without warning when access is partial; per-user query quota. [S39]–[S43]
- Subnets are only visible inside the VNet resource in Resource Graph; Uniform scale-set instance NICs are in `ComputeResources`. [S40]
- `resourcechanges`: < 5 min, 14 days, actor fields present. Activity Log: 3–20 min, 90 days. Event Grid: at least once, unordered, subscription or resource-group scope only. [S46]–[S54]
- `join` actions on the referenced NSG and ASG are required for associations; missing ones fail with `LinkedAuthorizationFailed`. [S4][S56]

## Sources

All retrieved 2026-11-09.

| ID | Source | Last updated / version |
| --- | --- | --- |
| S1 | [Understand how Azure Resource Manager throttles requests](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/request-limits-and-throttling) | 2026-04-03 |
| S2 | [Track asynchronous Azure operations](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/async-operations) | 2026-02-27 |
| S3 | [Network security groups overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) | 2025-07-15 |
| S4 | [Create, change, or delete a network security group (Permissions)](https://learn.microsoft.com/en-us/azure/virtual-network/manage-network-security-group) | 2025-07-26 |
| S5 | [Application security groups](https://learn.microsoft.com/en-us/azure/virtual-network/application-security-groups) | 2025-07-25 |
| S6 | [Add, change, or delete a virtual network subnet](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-subnet) | 2025-07-29 |
| S7 | [Create, change, or delete a network interface](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-network-interface) | 2025-07-28 |
| S8 | [Azure permissions for Networking](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/networking) | 2026-07-01 |
| S9 | [Azure permissions for Compute](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/compute) | 2026-07-01 |
| S10 | [Azure permissions for Management and governance](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/management-and-governance) | 2026-07-01 |
| S11 | [Azure permissions for Monitor](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/monitor) | 2026-07-01 |
| S12 | [Azure permissions for Integration](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/integration) | 2026-07-01 |
| S13 | [REST: Network Security Groups - Create Or Update](https://learn.microsoft.com/en-us/rest/api/virtualnetwork/network-security-groups/create-or-update) | api-version 2026-01-01 |
| S14 | [REST: Network Security Groups - Update Tags](https://learn.microsoft.com/en-us/rest/api/virtualnetwork/network-security-groups/update-tags) | api-version 2026-01-01 |
| S15 | [REST: Security Rules - Create Or Update](https://learn.microsoft.com/en-us/rest/api/virtualnetwork/security-rules/create-or-update) | api-version 2026-01-01 |
| S16 | [REST: Subnets - Create Or Update](https://learn.microsoft.com/en-us/rest/api/virtualnetwork/subnets/create-or-update) | api-version 2026-01-01 |
| S17 | [REST: Network Interfaces - Create Or Update](https://learn.microsoft.com/en-us/rest/api/virtualnetwork/network-interfaces/create-or-update) | api-version 2026-01-01 |
| S18 | [REST: Application Security Groups - Create Or Update](https://learn.microsoft.com/en-us/rest/api/virtualnetwork/application-security-groups/create-or-update) | api-version 2026-01-01 |
| S19 | [azure-rest-api-specs: Microsoft.Network stable 2026-03-01 `virtualNetwork.json`](https://github.com/Azure/azure-rest-api-specs/blob/main/specification/network/resource-manager/Microsoft.Network/Network/stable/2026-03-01/virtualNetwork.json) | main branch, api-version 2026-03-01 |
| S20 | [Create virtual network resources by using Bicep](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/scenarios-virtual-networks) | 2025-12-22 |
| S21 | [ARM RPC Guidelines and TypeSpec Linting Coverage](https://azure.github.io/typespec-azure/docs/howtos/arm/rpc-guidelines-coverage) | no date shown |
| S22 | [Enhance concurrency control with eTags in AKS](https://learn.microsoft.com/en-us/azure/aks/use-etags) | 2025-07-01 |
| S23 | [What is subnet delegation?](https://learn.microsoft.com/en-us/azure/virtual-network/subnet-delegation-overview) | 2025-07-29 |
| S24 | [azure-sdk-for-js: core-rest-pipeline `createPipelineFromOptions.ts`, `policies/defaultRetryPolicy.ts`](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/core/core-rest-pipeline/src) | main branch |
| S25 | [azure-sdk-for-js: ts-http-runtime `policies/defaultRetryPolicy.ts`, `policies/retryPolicy.ts`, `retryStrategies/*.ts`, `util/delay.ts`, `constants.ts`](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/core/ts-http-runtime/src) | main branch (SDK_VERSION 0.3.10) |
| S26 | [azure-sdk-for-js: core-lro `poller/constants.ts`, `poller/poller.ts`, `http/operation.ts`, `http/poller.ts`](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/core/core-lro/src) | 3.4.2 |
| S27 | [azure-sdk-for-js: arm-network `src/api/networkSecurityGroups/*`, `src/static-helpers/pollingHelpers.ts`](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/network/arm-network); [arm-resourcegraph `package.json`](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/resourcegraph/arm-resourcegraph) | arm-network 39.1.0; arm-resourcegraph 5.0.0 |
| S28 | [Upgrade policy modes for Virtual Machine Scale Sets](https://learn.microsoft.com/en-us/azure/virtual-machine-scale-sets/virtual-machine-scale-sets-upgrade-policy) | 2026-05-19 |
| S29 | [Networking for Azure Virtual Machine Scale Sets](https://learn.microsoft.com/en-us/azure/virtual-machine-scale-sets/virtual-machine-scale-sets-networking) | 2026-05-19 |
| S30 | [Modify a Virtual Machine Scale Set](https://learn.microsoft.com/en-us/azure/virtual-machine-scale-sets/virtual-machine-scale-sets-upgrade-scale-set) | 2026-05-19 |
| S31 | [REST: Virtual Machine Scale Sets - Update Instances](https://learn.microsoft.com/en-us/rest/api/compute/virtual-machine-scale-sets/update-instances) | api-version 2026-04-01 |
| S32 | [Use instance-level public IPs in AKS (ASG section)](https://learn.microsoft.com/en-us/azure/aks/use-node-public-ips) | 2026-10-13 |
| S33 | [Support policies for AKS](https://learn.microsoft.com/en-us/azure/aks/support-policies) | 2026-08-28 |
| S34 | [Network concepts for applications in AKS](https://learn.microsoft.com/en-us/azure/aks/concepts-network) | 2026-09-05 |
| S35 | [Manage network policies for private endpoints](https://learn.microsoft.com/en-us/azure/private-link/disable-private-endpoint-network-policy) | 2025-04-25 |
| S36 | [Configure an application security group with a private endpoint](https://learn.microsoft.com/en-us/azure/private-link/configure-asg-private-endpoint) | 2026-08-12 |
| S37 | [What is a private endpoint? (limitations)](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview) | 2026-08-11 |
| S38 | [Azure RBAC permissions for Azure Private Link](https://learn.microsoft.com/en-us/azure/private-link/rbac-permissions) | 2026-06-26 |
| S39 | [What is Azure Resource Graph?](https://learn.microsoft.com/en-us/azure/governance/resource-graph/overview) | 2026-08-19 |
| S40 | [Azure Resource Graph table and resource type reference](https://learn.microsoft.com/en-us/azure/governance/resource-graph/reference/supported-tables-resources) | 2025-03-13 |
| S41 | [Working with large Azure resource data sets](https://learn.microsoft.com/en-us/azure/governance/resource-graph/concepts/work-with-data) | 2024-06-03 |
| S42 | [Guidance for throttled requests in Azure Resource Graph](https://learn.microsoft.com/en-us/azure/governance/resource-graph/concepts/guidance-for-throttled-requests) | 2025-12-03 |
| S43 | [Understanding the Azure Resource Graph query language](https://learn.microsoft.com/en-us/azure/governance/resource-graph/concepts/query-language) | 2026-04-30 |
| S44 | [REST: Resource Graph - Resources](https://learn.microsoft.com/en-us/rest/api/azureresourcegraph/resourcegraph/resources/resources) | api-version 2024-04-01 |
| S45 | [Azure Resource Graph GET/LIST API](https://learn.microsoft.com/en-us/azure/governance/resource-graph/concepts/azure-resource-graph-get-list-api) | 2025-12-03 |
| S46 | [Analyze changes to your Azure resources](https://learn.microsoft.com/en-us/azure/governance/resource-graph/changes/resource-graph-changes) | 2025-10-31 |
| S47 | [Get resource changes](https://learn.microsoft.com/en-us/azure/governance/resource-graph/changes/get-resource-changes) | 2026-04-03 |
| S48 | [Azure Monitor activity log](https://learn.microsoft.com/en-us/azure/azure-monitor/platform/activity-log) | 2026-10-19 |
| S49 | [Azure activity log event schema](https://learn.microsoft.com/en-us/azure/azure-monitor/platform/activity-log-schema) | 2026-09-22 |
| S50 | [Azure subscription as an Event Grid source](https://learn.microsoft.com/en-us/azure/event-grid/event-schema-subscriptions) | 2023-03-15 |
| S51 | [Azure Resource Notifications - Resource Management events](https://learn.microsoft.com/en-us/azure/event-grid/event-schema-resources) | 2023-11-08 |
| S52 | [Azure Resource Notifications as an Event Grid source](https://learn.microsoft.com/en-us/azure/event-grid/event-schema-resource-notifications) | 2025-02-04 |
| S53 | [System topics in Azure Event Grid](https://learn.microsoft.com/en-us/azure/event-grid/system-topics) | 2026-06-18 |
| S54 | [Event Grid message delivery and retry](https://learn.microsoft.com/en-us/azure/event-grid/delivery-and-retry) | 2026-02-12 |
| S55 | [Azure subscription and service limits (Networking)](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits) | 2026-08-04 |
| S56 | [Troubleshoot the LinkedAuthorizationFailed error code (AKS)](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/error-codes/linkedauthorizationfailed-error) | 2026-07-22 |
| S57 | [Troubleshoot AuthorizationFailed errors for Azure private endpoints](https://learn.microsoft.com/en-us/troubleshoot/azure/private-link/troubleshoot-private-endpoint-permission-denied) | 2026-06-22 |
