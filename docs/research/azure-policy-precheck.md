# Azure Policy evaluation before deployment

Research for GitHub issue #5. Retrieval date for all sources: 2026-11-09.

## Question

How can nsgfw find out before deploying that Azure Policy would deny a change, and how does a deny surface when it happens?

Covers:

1. `Microsoft.PolicyInsights/checkPolicyRestrictions`: supported resource types, fields, effects and scopes.
2. ARM deployment validate and what-if: do they evaluate policy for NSG, subnet and NIC changes; cost and latency.
3. The deny error (`RequestDisallowedByPolicy`): how to extract the policy assignment, definition and reason.
4. Typical Azure Landing Zone (ALZ) policies that touch NSGs and subnets, and how each evaluates NSG rules vs. subnets.
5. Modify, append and deployIfNotExists effects on tool-managed resources, as sources of drift.

Assumption: nsgfw sends individual resource PUTs (NSG, `securityRules` child, subnet, ASG, NIC) in direct mode, and opens a Terraform pull request in Terraform mode. Terraform-specific behaviour (for example how the `azurerm` provider orders subnet and association calls) is out of scope here because its primary source is HashiCorp, not Microsoft.

## Summary

- Azure Policy evaluates `deny` synchronously on every create or update request through ARM, before the request reaches the resource provider, and returns `403 Forbidden`. Order: `disabled`, then `append`/`modify`, then `deny`, `audit`, `manual`, `auditIfNotExists`, `denyAction`; `deployIfNotExists` and `auditIfNotExists` run after the resource provider succeeds.
- `checkPolicyRestrictions` is a documented POST API at resource group, subscription and management group scope. It takes a partial resource body (`resourceDetails.resourceContent`) and optional `pendingFields`. It returns `fieldRestrictions` (`Required`, `Removed`, `Deny`, `Audit`) and `contentEvaluationResult.policyEvaluations` with the assignment, definition, set and reference IDs plus `evaluationDetails.reason` and evaluated expressions. The docs do not list supported resource types or effects, and do not say whether `count`-based conditions, `enforcementMode`, exemptions or `modify` are honoured.
- The ARM preflight and what-if docs do not mention Azure Policy at all. Whether `Deployments - Validate` or `What-If` reports a policy deny for NSG, subnet or NIC resources is undocumented. A spec-only API, `Microsoft.Resources/validateResources` (2022-06-01), describes its `ArmPartial` mode as validation "without verifying Azure Policy", which implies `ArmFull` verifies policy; it has no Learn page.
- A deny returns error code `RequestDisallowedByPolicy`. The documented message names the policy assignment and definition (name and ID). The ARM error model allows `additionalInfo` entries of type `PolicyViolation` with display names and IDs; the exact set of `info` fields in real NSG deny responses needs an empirical check. Assignments can add custom `nonComplianceMessages`.
- ALZ (Azure-Landing-Zones-Library, commit `62cfa7f`, 2026-11-06) assigns `Deny-Subnet-Without-Nsg` and `Deny-MgmtPorts-Internet` with `Deny` at the `landing_zones` and `identity` archetypes. Both policies cover the parent and the child resource type. A network guardrail initiative (`Enforce-GR-Network0`) adds `Deny-Subnet-Without-Udr`, the built-in "Gateway subnets should not be configured with a network security group" deny, and a `Modify-NSG` policy, but its default assignment uses `enforcementMode: DoNotEnforce` and `Modify-NSG` defaults to `Disabled`.
- The ALZ custom NSG flow-log DINE policies are deprecated in favour of a built-in (`e920df7f-…`). NSG flow logs no longer accept new creations and retire on 2027-09-30; virtual network flow log DINE built-ins exist. Flow-log DINE policies create `Microsoft.Network/networkWatchers/flowLogs` resources and do not change the NSG.
- Drift sources: `Modify-NSG` (if enabled) adds a `DenyAnyInternetOutbound` rule at priority 1000 to any NSG created or updated with zero security rules; `append` and `modify` change the request before it is stored; `deployIfNotExists` creates related resources after a default delay of 10 minutes.

## 1. `checkPolicyRestrictions`

### Endpoints and scopes

API version 2024-10-01 (latest stable in azure-rest-api-specs at retrieval). Three POST operations:

| Operation | Path | Description from the spec |
|---|---|---|
| `PolicyRestrictions_CheckAtResourceGroupScope` | `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.PolicyInsights/checkPolicyRestrictions` | "Checks what restrictions Azure Policy will place on a resource within a resource group. Use this when the resource group the resource will be created in is already known." |
| `PolicyRestrictions_CheckAtSubscriptionScope` | `/subscriptions/{subscriptionId}/providers/Microsoft.PolicyInsights/checkPolicyRestrictions` | "Checks what restrictions Azure Policy will place on a resource within a subscription." |
| `PolicyRestrictions_CheckAtManagementGroupScope` | `/providers/Microsoft.Management/managementGroups/{managementGroupId}/providers/Microsoft.PolicyInsights/checkPolicyRestrictions` | "Checks what restrictions Azure Policy will place on resources within a management group." |

Sources:
- https://learn.microsoft.com/en-us/rest/api/policyinsights/policy-restrictions/check-at-resource-group-scope?view=rest-policyinsights-2024-10-01
- https://learn.microsoft.com/en-us/rest/api/policyinsights/policy-restrictions/check-at-subscription-scope?view=rest-policyinsights-2024-10-01
- https://learn.microsoft.com/en-us/rest/api/policyinsights/policy-restrictions/check-at-management-group-scope?view=rest-policyinsights-2024-10-01
- Spec: https://github.com/Azure/azure-rest-api-specs/blob/main/specification/policyinsights/resource-manager/Microsoft.PolicyInsights/PolicyInsights/stable/2024-10-01/openapi.json

RBAC permission: `Microsoft.PolicyInsights/checkPolicyRestrictions/read`, "Get details about the restrictions that policy will enforce on a resource." (https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/management-and-governance)

### Request fields

| Field | Type | Meaning (spec wording) |
|---|---|---|
| `resourceDetails.resourceContent` | object | "The resource content. This should include whatever properties are already known and can be a partial set of all resource properties." |
| `resourceDetails.apiVersion` | string | "The api-version of the resource content." |
| `resourceDetails.scope` | string | "The scope where the resource is being created. For example, if the resource is a child resource this would be the parent resource's resource ID." |
| `pendingFields[].field` | string | "The name of the field. This can be a top-level property like 'name' or 'type' or an Azure Policy field alias." |
| `pendingFields[].values` | string[] | "The list of potential values for the field that should be evaluated against Azure Policy." |
| `includeAuditEffect` | boolean | "Whether to include policies with the 'audit' effect in the results. Defaults to false." Not present on the management group request model (`CheckManagementGroupRestrictionsRequest`). |

The management group request model has `resourceDetails` and `pendingFields`; the only spec example at that scope sends `pendingFields: [{ "field": "type" }]` and no `resourceDetails`.

### Response fields

- `fieldRestrictions[]`: `field` plus `restrictions[]` with `result`, `values`, `defaultValue` ("The value that policy will set for the field if the user does not provide a value."), `policy` (`policyDefinitionId`, `policySetDefinitionId`, `policyDefinitionReferenceId`, `policyAssignmentId`), `policyEffect` and `reason`.
- `result` enum (`FieldRestrictionResult`): `Required` ("The field and/or values are required by policy."), `Removed` ("The field will be removed by policy."), `Deny` ("The field and/or values will be denied by policy."), `Audit` ("The field and/or values will be audited by policy.").
- `contentEvaluationResult.policyEvaluations[]`: "Policy evaluation results against the given resource content. This will indicate if the partial content that was provided will be denied as-is." Each entry has `policyInfo` (the four IDs above), `evaluationResult` ("This will typically be 'NonCompliant' but may contain other values if errors were encountered."), `evaluationDetails` (`evaluatedExpressions[]` with `expression`, `expressionKind`, `path`, `expressionValue`, `targetValue`, `operator`, `result`; `ifNotExistsDetails` with `resourceId`, `totalResources`; `reason`) and `effectDetails.policyEffect`.
- The spec example "Check policy restrictions at resource group scope including audit effect" shows a `policyEvaluations` entry with `evaluationDetails.reason: "Resource creation of the selected type is not allowed"` and `effectDetails.policyEffect: "Audit"`, and `fieldRestrictions` entries with `policyEffect: "Deny"` and `result: "Required"` or `"Deny"`.

Source: same spec and Learn pages as above.

### Supported resource types and effects

- The Learn pages and the spec do not list supported resource types. The request takes any `type` in `resourceContent`, and `resourceDetails.scope` is documented for child resources (parent resource ID), which is the shape a `Microsoft.Network/networkSecurityGroups/securityRules` or `Microsoft.Network/virtualNetworks/subnets` check would need.
- The docs do not state which effects contribute beyond the `policyEffect` values in the examples (`Deny`, `Audit`) and the `Required`/`Removed`/`defaultValue` results, which suggest `append`/`modify` style restrictions. No source says how `deployIfNotExists`, `auditIfNotExists` or `denyAction` are reported, although the response model contains `ifNotExistsDetails`.
- No Learn conceptual page for this API was found. A web search returned only the REST and SDK reference pages.

All of these gaps are listed under "Uncertain".

## 2. ARM deployment validate and what-if

### What the docs say about validation

- Validate and what-if are long-running POST operations (`x-ms-long-running-operation: true`) with `200` and `202` responses; validate also defines `400`. They exist at resource group, subscription, management group, tenant and (validate only) arbitrary scope. Spec: https://github.com/Azure/azure-rest-api-specs/blob/main/specification/resources/resource-manager/Microsoft.Resources/deployments/stable/2026-06-01/deployments.json
- `validationLevel` (`Template`, `Provider`, `ProviderNoRbac`): `Template` is "Static analysis of the template is performed."; `Provider` also sends "resource declarations … to resource providers for semantic validation" and "Validates that the caller has RBAC write permissions on each resource"; `ProviderNoRbac` skips the RBAC write check. (Same spec.)
- The preflight page lists what preflight validates: resource name conflicts, scope correctness, RBAC permissions, provider and API compatibility. It describes preflight as "a best-effort process" that "does not catch all deployment-time errors". Azure Policy is not mentioned. https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/deploy-preflight
- The what-if page has no mention of Azure Policy. What-if "doesn't make any changes to existing resources. Instead, it predicts the changes if the specified template is deployed." It needs the same permissions as a deployment (`Microsoft.Resources/deployments/*` plus write on the resources). https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-what-if
- "Policy definitions with a `deployIfNotExists` should use the Azure Resource Manager template what if to validate and test the changes that happen when deploying the ARM template." This is about testing a DINE template, not about policy evaluation inside what-if. https://learn.microsoft.com/en-us/azure/governance/policy/concepts/evaluate-impact
- "By design, Azure Policy exempts from policy evaluation all resources under the `Microsoft.Resources` resource provider except for subscriptions and resource groups." So the `Microsoft.Resources/deployments` resource itself is not evaluated; the resources inside it are evaluated when they are created or updated. https://learn.microsoft.com/en-us/azure/governance/policy/how-to/get-compliance-data

Result: no primary source states whether validate or what-if returns a policy deny for NSG, subnet or NIC resources. A Microsoft Q&A thread found by search (secondary, unverified) reports template validation failing with `InvalidTemplateDeployment` and an inner policy violation.

### Spec-only alternative: `validateResources`

`POST /providers/Microsoft.Resources/validateResources` (api-version 2022-06-01, operation `ResourceValidator_ValidateResources`, "Validates multiple ARM resources"). Request: `provider`, `type`, `location`, `scope`, `resources[]` ("In most cases, this should be the exact same resource body as on an ARM resource PUT request plus the apiVersion property"; all resources must share namespace, type and location), `validationType`, `performPreflightWithoutRbacWriteCheck`. `validationType` values: `ArmFull` ("Perform all available validation checks on the resources.") and `ArmPartial` ("Validate properties of the resource without verifying Azure Policy, RBAC, or involving the resource providers."). Response: `properties.validatedResources[]` (resource IDs).

Source: https://github.com/Azure/azure-rest-api-specs/blob/main/specification/resources/resource-manager/Microsoft.Resources/resourceValidator/stable/2022-06-01/resourceValidator.json. No Learn page was found (web search for `validateResources`, `ArmFull`, `ArmPartial` returned nothing). Availability, error shape and whether it returns `RequestDisallowedByPolicy` are unverified.

### Cost and latency

- ARM throttling uses a token bucket per region. Subscription and tenant limits: reads bucket 250, refill 25 per second; writes bucket 200, refill 10 per second; deletes bucket 200, refill 10 per second. Limits apply "per subscription, per service principal, and per operation type"; global subscription limits are 15 times the per-principal limits. Remaining quota is returned in `x-ms-ratelimit-remaining-subscription-reads` / `-writes` / `-deletes`. https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/request-limits-and-throttling
- The docs do not say whether `checkPolicyRestrictions`, validate or what-if count as reads or writes for throttling.
- What-if limits: it expands nested templates up to 500 nested templates, 800 resource groups, or 5 minutes; resources beyond that get change type `Ignore`. https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-what-if
- No source gives latency figures for `checkPolicyRestrictions`, validate or what-if. None of the cited pages mentions a charge or pricing for these calls.

## 3. The deny error (`RequestDisallowedByPolicy`)

### How a deny surfaces

- "When creating or updating a matched resource in a Resource Manager mode, deny prevents the request before being sent to the Resource Provider. The request is returned as a `403 (Forbidden)`." https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-deny
- `denyAction` (only `DELETE` is supported) also returns `403 (Forbidden)`. Cascade deletion of a parent does not get blocked by a `denyAction` on a child. https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-deny-action
- "The error message from a deny policy assignment includes the policy definition and policy assignment IDs. If the error information in the message is missed, it's also available in the Activity log." https://learn.microsoft.com/en-us/azure/governance/policy/troubleshoot/general
- Error code and documented example (abbreviated by Microsoft; the `{guid}` is a subscription ID): the message text contains `policyAssignment` (`name`, `id`) and `policyDefinition` (`name`, `id`). "The name of a `policyAssignment` or `policyDefinition` is the last segment of the `id` string." https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-policy-requestdisallowedbypolicy
- With `enforcementMode: DoNotEnforce` ("Disabled" in the docs table) "The policy effect isn't enforced during resource creation or update" and no Activity log entry is written. `Enroll` enforces only for enrolled resources. https://learn.microsoft.com/en-us/azure/governance/policy/concepts/assignment-structure
- Custom text: `nonComplianceMessages` on the assignment, optionally per `policyDefinitionReferenceId` inside an initiative; "only supported on definitions or initiatives with Resource Manager modes definitions". (Same page.) ALZ assignments use this with an `{enforcementMode}` token, for example "Subnets {enforcementMode} have a Network Security Group." (ALZ assignment files, see section 4.) The docs page does not describe the `{enforcementMode}` token.

### Structured error fields

The ARM error model allows `error.details[]` and `additionalInfo[]` entries of the form `{ "type": "...", "info": { ... } }`, where the schema of `info` depends on `type`. The ARM resource provider contract example (quoted in a Microsoft review file in azure-rest-api-specs, because the original contract repository returns 404) shows `type: "PolicyViolation"` with `info` fields `policySetDefinitionDisplayName`, `policySetDefinitionId`, `policyDefinitionDisplayName`, `policyDefinitionId`, `policyAssignmentDisplayName` and `policyAsssignmentId` (sic, spelled with three s in that example).

Sources:
- https://github.com/Azure/azure-rest-api-specs/blob/main/specification/advisor/resource-manager/Microsoft.Advisor/Advisor/stable/2020-01-01/feedback.md (quotes the ARM error model, links to the former `Azure/azure-resource-manager-rpc` repository, which is no longer reachable)
- `ErrorDefinition`/`TypedErrorInfo` (`type`, `info`) in the PolicyInsights spec above.

Whether real NSG/subnet deny responses carry `additionalInfo` with `PolicyViolation`, and which `info` fields they contain (for example `policyDefinitionReferenceId`, `policyAssignmentParameters`, `evaluationDetails`, the non-compliance message), is not documented on Learn. Listed under "Uncertain".

### Example deny payload and fields to extract

Composite example, built from the documented message format and the ARM error model. Values in angle brackets are placeholders. It is not a captured response.

```json
{
  "error": {
    "code": "RequestDisallowedByPolicy",
    "target": "nsg-vnet1-app",
    "message": "Resource 'nsg-vnet1-app' was disallowed by policy. Policy identifiers: '[{\"policyAssignment\":{\"name\":\"Management port access from the Internet should be blocked\",\"id\":\"/providers/Microsoft.Management/managementGroups/<mg>/providers/Microsoft.Authorization/policyAssignments/Deny-MgmtPorts-Internet\"},\"policyDefinition\":{\"name\":\"Management port access from the Internet should be blocked\",\"id\":\"/providers/Microsoft.Management/managementGroups/<mg>/providers/Microsoft.Authorization/policyDefinitions/Deny-MgmtPorts-From-Internet\"}}]'.",
    "additionalInfo": [
      {
        "type": "PolicyViolation",
        "info": {
          "policyDefinitionDisplayName": "Management port access from the Internet should be blocked",
          "policyDefinitionId": "/providers/Microsoft.Management/managementGroups/<mg>/providers/Microsoft.Authorization/policyDefinitions/Deny-MgmtPorts-From-Internet",
          "policyAssignmentDisplayName": "Management port access from the Internet should be blocked",
          "policyAssignmentId": "/providers/Microsoft.Management/managementGroups/<mg>/providers/Microsoft.Authorization/policyAssignments/Deny-MgmtPorts-Internet",
          "policySetDefinitionDisplayName": "<only when assigned through an initiative>",
          "policySetDefinitionId": "<only when assigned through an initiative>"
        }
      }
    ]
  }
}
```

The `message` follows the Learn example ("was disallowed by policy. Policy identifiers: …"); the exact quoting and JSON encoding inside the message, and where a `nonComplianceMessages` text is inserted, need an empirical check.

Fields to extract, in order of how well they are documented:

| Field | Where | Documented by |
|---|---|---|
| `error.code` = `RequestDisallowedByPolicy` | top level | Learn troubleshooting page |
| HTTP status `403` | response | effect-deny page |
| `error.target` | top level | Learn example (resource name) |
| Policy assignment name and ID | `error.message` text, and `additionalInfo[].info.policyAssignmentId` | Learn example (message); ARM error model (info) |
| Policy definition name and ID | same | same |
| Policy set definition ID and display name | `additionalInfo[].info` | ARM error model example only |
| Custom reason | `nonComplianceMessages` text, rendered in the message | assignment-structure page says it is "in addition to the default error message"; rendering location not documented |
| Correlation | `x-ms-correlation-request-id` header and the Activity log entry | troubleshooting page (Activity log); header name not covered by the sources above |

For a pre-check through `checkPolicyRestrictions`, the same identifiers come back as `policyInfo`/`policy` objects plus `evaluationDetails.reason` and `evaluatedExpressions` (section 1).

## 4. Azure Landing Zone policies that touch NSGs and subnets

Source repository: https://github.com/Azure/Azure-Landing-Zones-Library (`platform/alz`, commit `62cfa7f09f7eec0fe80a48fc5f7bbc108fb1bd30`, 2026-11-06). The ALZ custom definitions originate from https://github.com/Azure/Enterprise-Scale (`metadata.source`). ALZ documentation has moved to https://azure.github.io/Azure-Landing-Zones/policy/ (repository https://github.com/Azure/Azure-Landing-Zones). Built-in definitions: https://github.com/Azure/azure-policy/tree/master/built-in-policies/policyDefinitions/Network.

Default assignments in the archetypes (from `archetype_definitions/*.alz_archetype_definition.json`):

- `landing_zones`: `Deny-MgmtPorts-Internet`, `Deny-Subnet-Without-Nsg`, `Deny-IP-forwarding`, `Enforce-GR-Network0` (network guardrail initiative), `Enforce-Subnet-Private`, among others.
- `identity`: `Deny-MgmtPorts-Internet`, `Deny-Subnet-Without-Nsg`, `Deny-Public-IP`, `Deploy-VM-Backup`.
- `platform`: `Enforce-GR-Network0`, `Enforce-Subnet-Private`, among others.
- `corp`: `Deny-Public-IP-On-NIC`, `Deny-HybridNetworking`, among others.
- `root` deploys the definitions `Modify-NSG` and `Deny-Subnet-Without-Penp` but assigns neither directly. A code search of the library found no assignment of `Deny-Subnet-Without-Penp`.

### Table

| Policy (name / ID) | Effect (default) | What it evaluates | How it affects NSG/subnet changes |
|---|---|---|---|
| `Deny-Subnet-Without-Nsg` "Subnets should have a Network Security Group" (ALZ custom, v2.1.0, mode All). Assigned as `Deny-Subnet-Without-Nsg`; also in `Enforce-GR-Network0` as `Deny-Subnet-Without-NSG` | `Deny` (allowed: Audit, Deny, Disabled) | Two branches: (a) `type == Microsoft.Network/virtualNetworks` and count of `subnets[*]` with no `subnets[*].networkSecurityGroup.id` and name not in `excludedSubnets` ≠ 0; (b) `type == Microsoft.Network/virtualNetworks/subnets`, `name` not in `excludedSubnets`, `networkSecurityGroup.id` does not exist. `excludedSubnets` default: GatewaySubnet, AzureFirewallSubnet, AzureFirewallManagementSubnet, RouteServerSubnet | Any subnet PUT (or VNet PUT with inline subnets) whose body lacks `networkSecurityGroup.id` is denied. This includes creating a subnet first and associating the NSG later, and removing an NSG association. Does not look at NSG rules. |
| `Deny-MgmtPorts-From-Internet` "Management port access from the Internet should be blocked" (ALZ custom, v2.2.0, mode All). Assigned as `Deny-MgmtPorts-Internet`; also in `Enforce-GR-Network0` as `Deny-Mgmt-From-Internet` | `Deny` (allowed: Audit, Deny, Disabled); `ports` default `["22","3389"]` | Two branches: (a) `type == Microsoft.Network/networkSecurityGroups/securityRules` with `access == Allow`, `direction == Inbound`, destination port `*`, in `ports`, or a range (`a-b`) covering a port, or `destinationPortRanges[*]` matching; and source `*`, `Internet` or `0.0.0.0/0` in `sourceAddressPrefix` or `sourceAddressPrefixes[*]`; (b) `type == Microsoft.Network/networkSecurityGroups` with count of such `securityRules[*]` > 0 | Denies an NSG PUT with inline rules or a `securityRules` child PUT that allows inbound 22/3389 (by default) from `*`, `Internet` or `0.0.0.0/0`. Other broad sources (for example `0.0.0.0/1`, a service tag other than `Internet`) and `sourceApplicationSecurityGroups` are not matched by the rule text. Rule priority and deny rules above the allow are not considered. |
| `Deny-Subnet-Without-Udr` "Subnets should have a User Defined Route" (ALZ custom, v2.1.0) in `Enforce-GR-Network0` | `Deny` in the initiative (`subnetUdr`) | Same two-branch shape as the NSG policy, on `routeTable.id`; `excludedSubnets` default AzureBastionSubnet, RouteServerSubnet | Subnet PUT without `routeTable.id` is denied when enforced. A subnet PUT by nsgfw that omits the existing route table would be denied. |
| `35f9c03a-cc27-418e-9c0c-539ff999d010` "Gateway subnets should not be configured with a network security group" (built-in, v1.0.0) in `Enforce-GR-Network0` as `Deny-Nsg-GW-subnet` | `deny` (fixed) | `type == Microsoft.Network/virtualNetworks/subnets`, `name == GatewaySubnet`, `networkSecurityGroup.id` exists | Associating an NSG with `GatewaySubnet` is denied. Child-type branch only; a VNet PUT with inline subnets is not matched by this definition. |
| `Modify-NSG` "Enforce specific configuration of Network Security Groups (NSG)" (ALZ custom, v1.0.0) in `Enforce-GR-Network0` as `Modify-Nsg` | `Modify` in the definition; initiative parameter `modifyNsg` default `Disabled` | `type == Microsoft.Network/networkSecurityGroups` and count of `securityRules[*]` == 0 | When enabled: adds rule `DenyAnyInternetOutbound` (Deny, Outbound, `*` → `Internet`, any port, priority 1000) to an NSG created or updated with no security rules. `conflictEffect: audit`. Parent type only; `securityRules` child PUTs are not matched. |
| `Deny-Subnet-Without-Penp` "Subnets without Private Endpoint Network Policies enabled should be denied" (ALZ custom, v1.2.0) | `Deny`; `penpValue` default `Enabled` | Same two-branch shape on `privateEndpointNetworkPolicies` | Definition only; no default assignment found. Where assigned, a subnet PUT that omits or changes `privateEndpointNetworkPolicies` is denied. |
| `7bca8353-aa3b-429b-904a-9229c4385837` "Subnets should be private" (built-in, v1.1.0) assigned as `Enforce-Subnet-Private` | Assignment sets `Audit` and `enforcementMode: DoNotEnforce` | VNet `subnets[*].defaultOutboundAccess` or subnet `defaultOutboundAccess` not `false` | No deny by default. A subnet PUT that omits `defaultOutboundAccess` can be reported non-compliant. |
| `e920df7f-9a64-4066-9b58-52684c02a091` "Configure network security groups to enable traffic analytics" (built-in, v1.2.0); replaces deprecated ALZ `Deploy-Nsg-FlowLogs` and `Deploy-Nsg-FlowLogs-to-LA` | `DeployIfNotExists` (parameter) | `type == Microsoft.Network/networkSecurityGroups` and `location == nsgRegion`; related resource `Microsoft.Network/networkWatchers/flowlogs` | After NSG create/update, deploys a flow log resource in the Network Watcher resource group. Does not modify the NSG body. Not in the current default ALZ assignments. |
| `0db34a60-64f4-4bf6-bd44-f95c16cf34b9` "Deploy a flow log resource with target network security group" (built-in, v1.1.0) | `deployIfNotExists` (fixed) | NSG in `nsgRegion`; existence condition: flow log enabled with the given `storageId` | Same as above. |
| `cd6f7aff-2845-4dab-99f2-6d1754a754b0` "Deploy a Flow Log resource with target virtual network" (v1.1.1) and `3e9965dc-cc13-47ca-8259-a4252fd0cf7b` "Configure virtual network to enable Flow Log and Traffic Analytics" (v1.1.1) | `DeployIfNotExists` | `type == Microsoft.Network/virtualNetworks` in `vnetRegion`; related `networkWatchers/flowlogs` | Triggered by VNet create/update, not by NSG or subnet child PUTs. Does not modify the NSG. |
| `c251913d-7d24-4958-af87-478ed3b9ba41` "Flow logs should be configured for every network security group" (built-in, v1.1.0, mode Indexed) | `Audit` | NSG with count of `flowLogs[*]` == 0 | Audit only. |

Notes:
- `Enforce-GR-Network0` assigns initiative `Enforce-Guardrails-Network_20260714` (v2.1.0) with `enforcementMode: DoNotEnforce` in the library default. Parameter defaults in the initiative: `subnetNsg` Deny, `denyMgmtFromInternet` Deny, `subnetUdr` Deny, `subnetServiceEndpoint` Deny, `modifyNsg` Disabled, `modifyUdr` Disabled. Deployments can override both the enforcement mode and the parameters.
- NSG flow logs: "Network security group (NSG) flow logs retire on September 30, 2027. Because the feature is retiring, it no longer supports new NSG flow logs creation." https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview and https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-policy-portal. VNet flow log policies: https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-policy
- ALZ deprecation list (flow-log DINE replaced by `e920df7f-…`; `Deny-RDP-From-Internet` superseded by `Deny-MgmtPorts-From-Internet`): https://github.com/Azure/Azure-Landing-Zones/blob/main/docs/content/policy/deprecation-notice/_index.md
- Parent vs. child: NSG rules can be written inline through the NSG PUT (`securityRules[*]` aliases) or as the child type `Microsoft.Network/networkSecurityGroups/securityRules`; subnets likewise through the VNet PUT or the child type `Microsoft.Network/virtualNetworks/subnets`. The two ALZ deny policies above match both paths. Two closed rule proposals in the Microsoft-owned `Azure/azure-policy-linter` repository state that an enforcement policy matching only one path "misses any rule changes made through the other path": https://github.com/Azure/azure-policy-linter/issues/32 and https://github.com/Azure/azure-policy-linter/issues/33. These are issue texts, not product documentation.

## 5. Modify, append and deployIfNotExists as drift sources

- Order of evaluation: `append` and `modify` are evaluated before `deny`, "Since either could alter the request, a change made might prevent an audit or deny effect from triggering." `deployIfNotExists` and `auditIfNotExists` run after the resource provider returns success. "`PATCH` requests that only modify `tags` related fields restricts policy evaluation to policies containing conditions that inspect `tags` related fields." https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-basics
- `modify`: "Modify evaluates before the request gets processed by a Resource Provider during the creation or updating of a resource." It can add or replace tags, `identity.type` on VMs/VMSS, and aliases marked Modifiable. On existing resources it does not change anything during an evaluation cycle; it marks them non-compliant for a remediation task. If a property is not present in the request payload, "the modification may be skipped". `conflictEffect` default is `deny`; with `deny`, a non-modifiable alias blocks the request. Requires a managed identity for remediation. https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-modify
- `append`: "adds fields to the resource when the `if` condition of the policy rule is met. If the append effect would override a value in the original request with a different value, then it acts as a deny effect and rejects the request." https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-append
- `deployIfNotExists`: "runs after a configurable delay when a Resource Provider handles a create or update subscription or resource request and returned a success status code." `evaluationDelay` default `PT10M`; allowed values `AfterProvisioning`, `AfterProvisioningSuccess`, `AfterProvisioningFailure` or 0–360 minutes. The deployment goes to the resource group named in `resourceGroupName` (or the evaluated resource's resource group). https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-deploy-if-not-exists
- Remediation tasks can be started for DINE even when `enforcementMode` is `DoNotEnforce`. https://learn.microsoft.com/en-us/azure/governance/policy/concepts/assignment-structure
- Compliance visibility: for a resource create or update, "the effect event (append, audit, deny, deploy) and compliant status information for the individual resource becomes available in the portal and SDKs around 15 minutes later". Standard re-evaluation runs every 24 hours; on-demand scans exist. Results are in `Microsoft.PolicyInsights` `PolicyStates` and `PolicyEvents`. https://learn.microsoft.com/en-us/azure/governance/policy/how-to/get-compliance-data

Concrete drift cases from the ALZ and built-in definitions:

| Policy | Trigger on a tool-managed resource | Resulting change |
|---|---|---|
| `Modify-NSG` (when set to `Modify`) | NSG PUT whose body has zero `securityRules` | Rule `DenyAnyInternetOutbound`, priority 1000, Outbound Deny to `Internet`, is added in the same request. The stored NSG differs from the requested body. |
| Remediation of `Modify-NSG` | Remediation task on existing NSGs with zero rules | Same rule added outside any nsgfw request. |
| `Modify-vNet-DDoS` = built-in `94de2ad3-e0c1-4caf-ad78-5d47bbc83d3d` "Virtual networks should be protected by Azure DDoS Protection" (in `Enforce-GR-Network0`, initiative default `Modify`) | VNet PUT where `enableDdosProtection` is not true or `ddosProtectionPlan` is empty | Sets the VNet's DDoS protection properties. Not an NSG or subnet property; listed because a VNet PUT with inline subnets is a VNet request. |
| Flow-log DINE built-ins | NSG or VNet create/update | New `networkWatchers/flowLogs` resource; NSG `flowLogs` back-reference appears (read-only). NSG rules unchanged. |
| Any `append` on subnet or NSG aliases | Create/update | Added fields in the stored resource. No ALZ default assignment of this kind was found for NSGs or subnets. |

## Uncertain — candidates for an empirical check

1. Which resource types and effects `checkPolicyRestrictions` evaluates. In particular: does it return a `policyEvaluations` entry for `Deny-MgmtPorts-From-Internet` when `resourceContent` is an NSG with inline `securityRules`, and when it is a `securityRules` child with `resourceDetails.scope` set to the NSG ID? Does it evaluate `count` expressions over `[*]` aliases?
2. Whether `checkPolicyRestrictions` honours `enforcementMode: DoNotEnforce`, policy exemptions, `notScopes`, `resourceSelectors` and `overrides`.
3. Whether `checkPolicyRestrictions` reports `modify` (for example `Modify-NSG`) as `Required` plus `defaultValue`, and how it reports `deployIfNotExists` (`ifNotExistsDetails`).
4. Whether the management group scope accepts `resourceDetails` (the only example sends `pendingFields: type`) and whether it evaluates assignments at child subscriptions.
5. Whether `Deployments - Validate` (each `validationLevel`) and `What-If` report a policy deny for NSG, subnet and NIC resources, and in what error shape (`InvalidTemplateDeployment` with inner `RequestDisallowedByPolicy` is reported only by a secondary source).
6. Whether what-if shows `modify`/`append` changes (for example the `Modify-NSG` rule) in its predicted `after` state.
7. Availability and behaviour of `POST /providers/Microsoft.Resources/validateResources` (`ArmFull`), which has a spec but no Learn page: does it return `RequestDisallowedByPolicy`, and what are its throttling class and latency?
8. Latency and throttling class (read or write bucket) of `checkPolicyRestrictions`, validate and what-if.
9. The exact JSON of a real `RequestDisallowedByPolicy` response for an NSG and a subnet PUT: presence of `additionalInfo` with `PolicyViolation`; fields such as `policyDefinitionReferenceId`, `policyAssignmentParameters`, `evaluationDetails`; where the `nonComplianceMessages` text and the `{enforcementMode}` token appear.
10. Whether a `securityRules` child PUT also triggers evaluation of policies written against the parent `Microsoft.Network/networkSecurityGroups` type (for example `Modify-NSG` or the parent branch of `Deny-MgmtPorts-From-Internet`), and vice versa. The `azure-policy-linter` issues imply no, but this is not product documentation.
11. Whether a subnet update that only changes `networkSecurityGroup` but omits other properties (route table, `privateEndpointNetworkPolicies`, `defaultOutboundAccess`) is evaluated against the omitted values (request body) or the merged resource state.
12. Whether `Modify-NSG` is applied when an NSG is created with an empty `securityRules` array versus no `securityRules` property at all.

## Facts that open design tickets depend on

- Deny is synchronous: `403`, code `RequestDisallowedByPolicy`, before the resource provider; nothing is created or changed for the denied request.
- The documented deny message contains the policy assignment and policy definition names and IDs. Structured `additionalInfo` is allowed by the ARM error model but its content for policy denies is not documented on Learn.
- Assignments may carry custom `nonComplianceMessages` (Resource Manager modes only), optionally per definition reference inside an initiative.
- `enforcementMode: DoNotEnforce` disables the effect at create/update time; such assignments still produce compliance results.
- `checkPolicyRestrictions` exists at resource group, subscription and management group scope (API 2024-10-01), needs `Microsoft.PolicyInsights/checkPolicyRestrictions/read`, accepts a partial resource body and child-resource scope, and returns assignment/definition/set/reference IDs, effect, reason and evaluated expressions. Its coverage of effects and resource types is undocumented.
- ARM validate and what-if docs do not mention Azure Policy; their policy behaviour is unverified.
- ARM write throttling: bucket 200, refill 10 per second per subscription per service principal per region; reads 250 / 25 per second.
- ALZ default `landing_zones` and `identity` archetypes assign `Deny-Subnet-Without-Nsg` and `Deny-MgmtPorts-Internet` with `Deny`. Both match the parent and the child resource type.
- `Deny-Subnet-Without-Nsg` denies every subnet PUT without `networkSecurityGroup.id`, except for subnets named GatewaySubnet, AzureFirewallSubnet, AzureFirewallManagementSubnet and RouteServerSubnet (default parameter).
- The built-in "Gateway subnets should not be configured with a network security group" denies an NSG on `GatewaySubnet` when the network guardrail initiative is enforced.
- `Deny-MgmtPorts-From-Internet` checks only allow-inbound rules with sources `*`, `Internet` or `0.0.0.0/0` and destination ports 22 and 3389 (default), including ranges and `destinationPortRanges`. It ignores rule priority.
- `Modify-NSG`, when enabled, adds `DenyAnyInternetOutbound` at priority 1000 to NSGs created or updated with zero rules. ALZ ships it `Disabled` inside an initiative assigned with `DoNotEnforce`.
- `deployIfNotExists` runs after the resource provider succeeds, default delay 10 minutes; flow-log DINE policies create `networkWatchers/flowLogs` resources and leave NSG rules unchanged.
- NSG flow logs accept no new creations and retire on 2027-09-30; VNet flow log DINE built-ins exist.
- Compliance state for a created or updated resource is available about 15 minutes later; full re-evaluation every 24 hours.

## Sources

Microsoft Learn (retrieved 2026-11-09):
- https://learn.microsoft.com/en-us/rest/api/policyinsights/policy-restrictions/check-at-resource-group-scope?view=rest-policyinsights-2024-10-01
- https://learn.microsoft.com/en-us/rest/api/policyinsights/policy-restrictions/check-at-subscription-scope?view=rest-policyinsights-2024-10-01
- https://learn.microsoft.com/en-us/rest/api/policyinsights/policy-restrictions/check-at-management-group-scope?view=rest-policyinsights-2024-10-01
- https://learn.microsoft.com/en-us/rest/api/resources/deployments/validate?view=rest-resources-2025-04-01
- https://learn.microsoft.com/en-us/rest/api/resources/deployments/what-if?view=rest-resources-2025-04-01
- https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/deploy-preflight
- https://learn.microsoft.com/en-us/azure/azure-resource-manager/templates/deploy-what-if
- https://learn.microsoft.com/en-us/azure/azure-resource-manager/troubleshooting/error-policy-requestdisallowedbypolicy
- https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/request-limits-and-throttling
- https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-basics
- https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-deny
- https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-deny-action
- https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-modify
- https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-append
- https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-deploy-if-not-exists
- https://learn.microsoft.com/en-us/azure/governance/policy/concepts/assignment-structure
- https://learn.microsoft.com/en-us/azure/governance/policy/concepts/evaluate-impact
- https://learn.microsoft.com/en-us/azure/governance/policy/how-to/get-compliance-data
- https://learn.microsoft.com/en-us/azure/governance/policy/troubleshoot/general
- https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/management-and-governance
- https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-overview
- https://learn.microsoft.com/en-us/azure/network-watcher/nsg-flow-logs-policy-portal
- https://learn.microsoft.com/en-us/azure/network-watcher/vnet-flow-logs-policy

GitHub (Microsoft-owned repositories, retrieved 2026-11-09):
- https://github.com/Azure/azure-rest-api-specs/blob/main/specification/policyinsights/resource-manager/Microsoft.PolicyInsights/PolicyInsights/stable/2024-10-01/openapi.json and its `examples/PolicyRestrictions_*.json`
- https://github.com/Azure/azure-rest-api-specs/blob/main/specification/resources/resource-manager/Microsoft.Resources/deployments/stable/2026-06-01/deployments.json
- https://github.com/Azure/azure-rest-api-specs/blob/main/specification/resources/resource-manager/Microsoft.Resources/resourceValidator/stable/2022-06-01/resourceValidator.json
- https://github.com/Azure/azure-rest-api-specs/blob/main/specification/advisor/resource-manager/Microsoft.Advisor/Advisor/stable/2020-01-01/feedback.md
- https://github.com/Azure/Azure-Landing-Zones-Library/tree/main/platform/alz (policy_definitions, policy_assignments, policy_set_definitions, archetype_definitions)
- https://github.com/Azure/Azure-Landing-Zones/blob/main/docs/content/policy/deprecation-notice/_index.md
- https://github.com/Azure/azure-policy/tree/master/built-in-policies/policyDefinitions/Network (`NetworkSecurityGroupOnGatewaySubnet_Deny.json`, `NetworkSecurityGroup_FlowLog_DINE.json`, `NetworkSecurityGroup_FlowLog_TrafficAnalytics_DINE.json`, `NetworkSecurityGroup_FlowLog_Audit.json`, `VirtualNetwork_FlowLog_DINE.json`, `VirtualNetwork_FlowLog_TrafficAnalytics_DINE.json`, `PrivateSubnetOnly_Audit.json`)
- https://github.com/Azure/azure-policy-linter/issues/32 and https://github.com/Azure/azure-policy-linter/issues/33 (issue texts, not product documentation)
