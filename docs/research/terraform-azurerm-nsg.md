# Terraform azurerm modeling of NSGs, associations and ASGs

Research for GitHub issue #6. Retrieval date for every source: 2026-11-09.

## Question

How do the azurerm and azapi Terraform providers model NSGs, NSG rules, subnet associations, ASGs and NIC membership, and which modeling avoids conflicts when nsgfw generates code for existing repositories?

## Versions checked

| Component | Version | Source |
|---|---|---|
| `hashicorp/azurerm` | 5.13.0 (latest, published 2026-11-05) | https://registry.terraform.io/v1/providers/hashicorp/azurerm, https://github.com/hashicorp/terraform-provider-azurerm/releases/tag/v5.13.0 |
| `Azure/azapi` | 2.13.0 (latest, published 2026-09-28) | https://registry.terraform.io/v1/providers/azure/azapi, https://github.com/Azure/terraform-provider-azapi/releases/tag/v2.13.0 |
| Terraform CLI | 1.17.1 (latest, 2026-10-28) | https://github.com/hashicorp/terraform/releases/tag/v1.17.1 |
| ARM API used by azurerm Network resources | `Microsoft.Network` 2025-07-01 | "API Providers" section of each azurerm resource page below |

Provider documentation was read from the provider source at the release tag (`website/docs/...` for azurerm, `docs/...` for azapi). The Terraform Registry renders the same files. Registry URLs are given as `https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/<name>`; source URLs as `https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/<path>`.

Assumption: nsgfw targets azurerm 5.x. A 6.0 upgrade guide already exists on the 5.13.0 tag (`website/docs/6.0-upgrade-guide.html.markdown`). It lists no changes to the NSG, rule, association, subnet, VNet or ASG resources ([source](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/website/docs/6.0-upgrade-guide.html.markdown)). The 6.0 guide is unreleased and can change.

## Summary

- azurerm offers two mutually exclusive ways to model NSG rules: inline `security_rule` blocks in `azurerm_network_security_group`, or separate `azurerm_network_security_rule` resources. The docs forbid mixing them on one NSG because the rules "will overwrite" each other.
- Inline `security_rule` is `Optional` + `Computed` with attribute config mode. Omitting it means "do not manage rules"; `security_rule = []` deletes all rules. Every NSG update is one full-object PUT that carries the complete rule list.
- Standalone rule resources are one PUT each and run in parallel (Terraform default parallelism 10). Changing priorities across several rules can fail with Azure `SecurityRuleConflict`; a provider maintainer confirmed the provider cannot order these updates.
- Subnet association has three azurerm forms: `azurerm_subnet_network_security_group_association`, inline `subnet.security_group` in `azurerm_virtual_network`, and the write-only `network_security_group_id_wo` on `azurerm_subnet`. The association resource refuses to create when the subnet already has any NSG. It must then be imported.
- NIC membership in ASGs has a standalone association resource. VMSS and AKS node pools have only inline `application_security_group_ids` lists inside the owning resource, with no standalone association resource.
- `import` blocks (Terraform ≥ 1.5, `for_each` ≥ 1.7, `identity` ≥ 1.12) and `terraform query` with `list` blocks (≥ 1.14) cover NSGs, rules, ASGs, subnets, VNets and NICs. Associations have no list resource and no resource identity.
- `moved` across resource types needs provider support. azurerm NSG/rule resources do not support it. azapi supports moving any `azurerm_*` resource whose `id` is an ARM ID into `azapi_resource`.
- `azapi_update_resource` performs GET, merges the configured body into the response, then PUTs the whole resource. Destroying it does nothing in Azure.
- Azure stores no marker of Terraform management. Signals that exist: the azurerm/azapi User-Agent (seen by Resource Graph change tracking as a client type, not in the documented Activity Log schema), the caller identity in the Activity Log, and tags that someone sets on purpose. Terraform state is the only authoritative record.

## Findings per Covers bullet

### 1. Inline `security_rule` vs. separate `azurerm_network_security_rule`

**Documented conflict.** Both resource pages carry the same note: "At this time you cannot use a Network Security Group with in-line Network Security Rules in conjunction with any Network Security Rule resources. Doing so will cause a conflict of rule settings and will overwrite rules." ([network_security_group](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/network_security_group), [network_security_rule](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/network_security_rule))

**Removing inline rules.** The NSG page says: "Since `security_rule` can be configured both inline and via the separate `azurerm_network_security_rule` resource, we have to explicitly set it to empty slice (`[]`) to remove it." ([source](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/website/docs/r/network_security_group.html.markdown))

**Schema facts from source** ([network_security_group_resource.go L67–L79](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_security_group_resource.go#L67-L79)):

- `security_rule` is `TypeSet`, `Optional: true`, `Computed: true`, `ConfigMode: SchemaConfigModeAttr`, hashed by `hashNetworkSecurityRule`.
- Consequence of `Computed`: an NSG resource without any `security_rule` argument accepts whatever rules Azure returns. Rules added outside Terraform, in the portal or by standalone rule resources, then cause no diff on the NSG resource.
- Consequence of a set: rules are not ordered in config. Changing any field of a rule changes its hash, so the plan shows one element removed and one added. The API call is still one PUT.
- `priority` is validated as `IntBetween(100, 4096)`; `description` max 140 characters.

**Update behaviour** ([L246–L276](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_security_group_resource.go#L246-L276)): the provider GETs the NSG and replaces `properties.securityRules` with the configured list only `if d.HasChange("security_rule")`. It then PUTs the whole object. A tag-only change therefore PUTs back the rule list as read from Azure. The provider holds an in-process lock on the NSG ID during create, update and delete ([L212](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_security_group_resource.go#L212), [L273](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_security_group_resource.go#L273)).

**Standalone rule** ([network_security_rule_resource.go L178–L289](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_security_rule_resource.go#L178-L289)):

- One `SecurityRules.CreateOrUpdate` call (PUT on `.../networkSecurityGroups/{nsg}/securityRules/{rule}`) per rule.
- `name`, `resource_group_name` and `network_security_group_name` are `ForceNew`. Renaming a rule therefore means destroy plus create. `priority` and the match fields update in place.
- The file contains no `locks.` call. The lock was removed in commit [e9d45dbff "r/network_security_rule: removing the locks by default in 3.0"](https://github.com/hashicorp/terraform-provider-azurerm/commit/e9d45dbff) (2022-03-07). The `features { network { relaxed_locking } }` switch mentioned by a maintainer in [#15631](https://github.com/hashicorp/terraform-provider-azurerm/issues/15631) (2022) no longer appears in the features-block guide at 5.13.0 ([features-block](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/website/docs/guides/features-block.html.markdown)).
- In the same issue, the maintainer recommended inline rules "since it avoids these API concurrency issues by submitting these as a single API call" ([#15631](https://github.com/hashicorp/terraform-provider-azurerm/issues/15631)).

**Create-time import check.** NSG, rule, ASG and both association resources return an "already exists – needs to be imported" error when the target already exists. The exception is the provider feature `skip_import_check_on_create_and_allow_overwriting_existing_resources = true`. The docs warn: "could lead to Terraform overwriting existing resources without any warning" ([features-block](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/website/docs/guides/features-block.html.markdown)).

**Related issue reports:**

- [#32505](https://github.com/hashicorp/terraform-provider-azurerm/issues/32505) (open, label `waiting-response`): an NSG without inline rules, with rules managed by standalone resources, fails a tag-only update with `400 InvalidRequestFormat` since azurerm v4.71.0. Maintainers could not reproduce it (2026-06-08).
- [#17746](https://github.com/hashicorp/terraform-provider-azurerm/issues/17746) (open): incorrect dependency graph between NSG and rule resources.
- [#14434](https://github.com/hashicorp/terraform-provider-azurerm/issues/14434) (closed): the subnet association does not wait for standalone rules. Maintainers suggested `depends_on` or inline rules.

```hcl
# Option A: rules inline, NSG is authoritative for its full rule list
resource "azurerm_network_security_group" "zone_app" {
  name                = "nsg-vnet1-app"
  location            = "westeurope"
  resource_group_name = "rg-net"
  security_rule = [] # or blocks; [] deletes every custom rule
}

# Option B: NSG without inline rules, one resource per rule
resource "azurerm_network_security_rule" "r_1000_in" {
  name                        = "r-1000-in"
  priority                    = 1000
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_ranges     = ["443", "8443"]
  source_address_prefixes     = ["10.1.0.0/24"]
  destination_address_prefix  = "*"
  resource_group_name         = "rg-net"
  network_security_group_name = azurerm_network_security_group.zone_app.name
}
```

### 2. Renumbering priorities: plan and apply ordering, collision behaviour

- **Uniqueness scope.** The provider docs say: "The priority number must be unique for each rule in the collection" ([network_security_rule](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/network_security_rule)). Azure's error text is narrower: `Code="SecurityRuleConflict" Message="... Rules cannot have the same Priority and Direction."` ([#19202](https://github.com/hashicorp/terraform-provider-azurerm/issues/19202)). Open docs issue [#27046](https://github.com/hashicorp/terraform-provider-azurerm/issues/27046) asks to document that inbound and outbound rules may share a priority.
- **Terraform ordering.** Terraform walks the dependency graph in parallel: "a node is walked as soon as all of its dependencies are walked", bounded by `-parallelism` ([internals/graph](https://developer.hashicorp.com/terraform/internals/graph)). `-parallelism=n` "Defaults to 10" ([cli/commands/apply](https://developer.hashicorp.com/terraform/cli/commands/apply)). Standalone rules without `depends_on` between them have no defined order.
- **Collision with standalone rules.** If rules swap or shift priorities, a PUT can hit a priority still held by another rule that is not yet updated. Result: `SecurityRuleConflict`. Reports: [#293](https://github.com/hashicorp/terraform-provider-azurerm/issues/293) (2017) and [#19202](https://github.com/hashicorp/terraform-provider-azurerm/issues/19202) (2022). In #19202, maintainer magodo wrote: "different resource instances can not orchestrate by the provider". The maintainer gave two workarounds: (a) explicit `depends_on` so the rule that vacates a priority updates first; (b) move the rules into inline `security_rule` of the NSG and change priorities there, in one call.
- **Collision with inline rules.** The whole rule list goes out in one PUT ([source L260–L276](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_security_group_resource.go#L260-L276)). That a swap of priorities inside one PUT succeeds is the maintainer's claim in #19202. Microsoft docs were not checked for it, so it is listed under uncertain items.
- **Renaming plus renumbering.** Rule `name` is `ForceNew`. By default Terraform destroys the old object before it creates the replacement ([lifecycle](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle)). With `create_before_destroy`, the new rule is created while the old rule still holds the same priority and direction, which can collide. The lifecycle doc warns that create-before-destroy needs objects that can coexist.
- **`create_before_destroy` propagation.** "Terraform propagates and applies create_before_destroy behavior to all resource dependencies" ([lifecycle](https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle)). A setting on one resource in an existing repository can therefore change the order for generated resources that depend on it.

### 3. Subnet association: association resource vs. inline subnet blocks in `azurerm_virtual_network`

Three azurerm forms exist at 5.13.0.

**(a) `azurerm_subnet_network_security_group_association`** ([docs](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/subnet_network_security_group_association), [source](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/subnet_network_security_group_association_resource.go))

- Arguments `subnet_id` and `network_security_group_id`, both `ForceNew`. The resource `id` is the subnet ID; import uses the subnet ID.
- Create: locks the old and new NSG IDs, the route table, the VNet and the subnet. Then GETs the subnet. If the subnet already has any NSG it returns `ImportAsExistsAssociationError`: "we're intentionally not checking the ID - if there's a NSG, it needs to be imported" ([L131–L139](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/subnet_network_security_group_association_resource.go#L131-L139)). It then PUTs the full subnet object with the new NSG and waits for subnet and VNet provisioning state `Succeeded`.
- Read: if the subnet has no NSG, the resource is removed from state. If it has a different NSG, state takes that ID, and the next plan shows a replacement ([L211–L219](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/subnet_network_security_group_association_resource.go#L211-L219)).
- Delete: sets `networkSecurityGroup = nil` and PUTs the subnet ([L295–L297](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/subnet_network_security_group_association_resource.go#L295-L297)).
- Consequence, derived from source: changing which NSG a subnet uses through this resource is a replacement. The default order is delete (subnet without NSG) then create. With `create_before_destroy`, create would find the old NSG still attached and fail with the import error. The duration of the window without an NSG is not documented.

**(b) Inline `subnet { security_group = ... }` in `azurerm_virtual_network`** ([docs](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/virtual_network), [source](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/virtual_network_resource.go))

- The docs say: "you cannot use a Virtual Network with in-line Subnets in conjunction with any Subnet resources. Doing so will cause a conflict of Subnet configurations and will overwrite subnets." `subnet = []` is needed to remove inline subnets.
- `subnet` is `TypeSet`, `Optional`, `Computed`, `ConfigModeAttr` ([L200–L204](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/virtual_network_resource.go#L200-L204)). `security_group` is `Optional` and not `Computed` ([L292–L295](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/virtual_network_resource.go#L292-L295)).
- When an inline subnet is expanded, an empty `security_group` sets `NetworkSecurityGroup = nil` in the request ([L805–L811](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/virtual_network_resource.go#L805-L811), [L875–L881](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/virtual_network_resource.go#L875-L881)).
- Subnets are sent only `if d.HasChange("subnet")` ([L609–L621](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/virtual_network_resource.go#L609-L621)).
- The docs say nothing about combining inline subnets with `azurerm_subnet_network_security_group_association`. For the analogous route-table case, the docs do say: "If you declare the subnet inline inside `azurerm_virtual_network`, set `route_table_id` in that `subnet` block — do not also create an `azurerm_subnet_route_table_association` for the same subnet." An NSG equivalent of that note is absent.

**(c) `azurerm_subnet` with write-only NSG ID** ([docs](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/subnet), [source L316–L334](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/subnet_resource.go#L316-L334))

- `network_security_group_id_wo` (write-only, requires Terraform ≥ 1.11 for write-only attributes; [v1.11.0 CHANGELOG](https://github.com/hashicorp/terraform/blob/v1.11.0/CHANGELOG.md)) together with `network_security_group_id_wo_version`.
- `network_security_group_id` is a read-only (`Computed`) attribute.
- Docs: "This property is only meant for environments where Azure Policy requires Network Security Groups to be specified during Subnet creation/update. It is recommended to use the `azurerm_subnet_network_security_group_association` resource instead."
- Update writes the NSG only when `network_security_group_id_wo_version` changes. Otherwise it PUTs the subnet as read from Azure, keeping the current NSG ([L631–L638](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/subnet_resource.go#L631-L638)). A standalone `azurerm_subnet` therefore does not remove an NSG that another resource attached.
- Background: feature request [#16921](https://github.com/hashicorp/terraform-provider-azurerm/issues/16921) (policy "deny subnet without NSG").

```hcl
resource "azurerm_subnet_network_security_group_association" "zone_app" {
  subnet_id                 = data.azurerm_subnet.app.id # subnet owned by another repo or module
  network_security_group_id = azurerm_network_security_group.zone_app.id
}
```

### 4. ASGs, NIC membership, VMSS and AKS equivalents

**`azurerm_application_security_group`** ([docs](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/application_security_group)): arguments `name`, `resource_group_name`, `location` (all `ForceNew`) and `tags`. Rules reference ASGs through `source_application_security_group_ids` / `destination_application_security_group_ids`, in inline rules and in standalone rules alike ([network_security_rule](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/network_security_rule)).

**`azurerm_network_interface_application_security_group_association`** ([docs](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/network_interface_application_security_group_association), [source](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_interface_application_security_group_association_resource.go))

- One resource per NIC–ASG pair. Both arguments are `ForceNew`. The ID is Terraform-specific: `{networkInterfaceId}|{applicationSecurityGroupId}`, which is also the import ID.
- Create: locks the NIC ID and GETs the NIC. Errors with import-required if the ASG is already on the NIC. Otherwise adds the ASG and PUTs the whole NIC.
- The helper `mapFieldsToNetworkInterface` writes the same ASG list onto every IPv4 IP configuration of the NIC ([network_interface.go L90–L139](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_interface.go#L90-L139)). Per-ipconfig ASG membership cannot be expressed with this resource.
- Delete removes only that ASG from the list and PUTs the NIC.
- `azurerm_network_interface` has no ASG argument at 5.13.0. On update it re-applies the ASGs it read from Azure, so it does not remove memberships created by the association resource ([network_interface_resource.go L432–L435](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_interface_resource.go#L432-L435)).

**Private endpoints:** `azurerm_private_endpoint_application_security_group_association` exists, with ID `{privateEndpointId}|{applicationSecurityGroupId}` ([source doc](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/website/docs/r/private_endpoint_application_security_group_association.html.markdown)).

**VMSS:** `azurerm_linux_virtual_machine_scale_set`, `azurerm_windows_virtual_machine_scale_set` and `azurerm_orchestrated_virtual_machine_scale_set` take `network_interface.ip_configuration.application_security_group_ids` inline ([linux](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/linux_virtual_machine_scale_set), [windows](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/windows_virtual_machine_scale_set), [orchestrated](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/orchestrated_virtual_machine_scale_set)). The `docs/r` tree at 5.13.0 has no standalone VMSS–ASG association resource ([tree](https://github.com/hashicorp/terraform-provider-azurerm/tree/v5.13.0/website/docs/r)). `upgrade_mode` (`Automatic`, `Manual`, `Rolling`, default `Manual`) controls how model changes reach instances. The docs do not say how an ASG list change reaches existing instances under `Manual`.

**AKS:** `node_network_profile.application_security_group_ids` exists on `default_node_pool` of `azurerm_kubernetes_cluster` and on `azurerm_kubernetes_cluster_node_pool` ([cluster](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/kubernetes_cluster), [node pool](https://registry.terraform.io/providers/hashicorp/azurerm/5.13.0/docs/resources/kubernetes_cluster_node_pool)). In source it is a `TypeList`, `Optional`, not `ForceNew` ([kubernetes_nodepool.go L611–L618](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/containers/helpers/kubernetes_nodepool.go#L611-L618)). The node-pool doc notes: "To set the application security group, you must allow at least one host port. Without this, the configuration will fail silently." `node_network_profile` is not in the list of default-node-pool properties that require `temporary_name_for_rotation`.

```hcl
resource "azurerm_network_interface_application_security_group_association" "vm1_web" {
  network_interface_id          = data.azurerm_network_interface.vm1.id
  application_security_group_id = azurerm_application_security_group.web.id
}
```

### 5. Import of existing resources and `moved` blocks

**Import IDs (azurerm 5.13.0):**

| Resource | Import ID | Resource identity | List resource |
|---|---|---|---|
| `azurerm_network_security_group` | NSG ARM ID | yes ([source L43–L47](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_security_group_resource.go#L43-L47)) | yes |
| `azurerm_network_security_rule` | `.../networkSecurityGroups/{nsg}/securityRules/{rule}` | yes | yes (requires `network_security_group_id`) |
| `azurerm_application_security_group` | ASG ARM ID | yes | yes |
| `azurerm_subnet_network_security_group_association` | subnet ARM ID | no (`ImporterValidatingResourceId`) | no |
| `azurerm_network_interface_application_security_group_association` | `{nicId}\|{asgId}` | no | no |
| `azurerm_subnet`, `azurerm_virtual_network`, `azurerm_network_interface`, `azurerm_kubernetes_cluster_node_pool` | ARM ID | — | yes |

List-resource docs: [network_security_group](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/website/docs/list-resources/network_security_group.html.markdown), [network_security_rule](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/website/docs/list-resources/network_security_rule.html.markdown), and the [list-resources folder](https://github.com/hashicorp/terraform-provider-azurerm/tree/v5.13.0/website/docs/list-resources).

**Terraform language features:**

- `import` block: arguments `to`, `id` or `identity` (mutually exclusive), `for_each`, `provider`. "The ID must be known during the plan operation." ([import block](https://developer.hashicorp.com/terraform/language/block/import)). Introduced in v1.5.0 for "Root module authors" ([CHANGELOG v1.5.0](https://github.com/hashicorp/terraform/blob/v1.5.0/CHANGELOG.md)). `for_each` since v1.7.0 ([CHANGELOG v1.7.0](https://github.com/hashicorp/terraform/blob/v1.7.0/CHANGELOG.md)). `identity` since v1.12.0 ([CHANGELOG v1.12.0](https://github.com/hashicorp/terraform/blob/v1.12.0/CHANGELOG.md)). An import can target a resource in a child module with `to = module.x.type.name` ([single-resource](https://developer.hashicorp.com/terraform/language/import/single-resource)).
- Import blocks are idempotent: "applying an import action and running another plan does not generate another import action as long as that resource remains in your state" ([single-resource](https://developer.hashicorp.com/terraform/language/import/single-resource)).
- "A resource can have only one import block" (diagnostic in [internal/configs/module.go](https://github.com/hashicorp/terraform/blob/v1.17.1/internal/configs/module.go)).
- `terraform plan -generate-config-out=FILE` generates resource blocks for import blocks. It is still marked "Experimental" ([generating-configuration](https://developer.hashicorp.com/terraform/language/import/generating-configuration)).
- Bulk: `list` blocks in `.tfquery.hcl` and `terraform query [-generate-config-out=...]` (command added in v1.14.0, [CHANGELOG v1.14.0](https://github.com/hashicorp/terraform/blob/v1.14.0/CHANGELOG.md)). By default up to 100 results per list block; `include_resource = true` fetches attributes. "HCP Terraform uses resource identities to determine when resources are managed by another workspace." ([bulk](https://developer.hashicorp.com/terraform/language/import/bulk), [list block](https://developer.hashicorp.com/terraform/language/block/tfquery/list)).
- `moved`: renames an address in state without destroying it. Supports instance keys and module moves ([moved block](https://developer.hashicorp.com/terraform/language/block/moved), [refactoring](https://developer.hashicorp.com/terraform/language/modules/develop/refactoring)). "Note that removing a moved block is a breaking change." Moving between resource types works "only if the provider for the target resource type declares that it can convert from the source resource type" ([CHANGELOG v1.8.0](https://github.com/hashicorp/terraform/blob/v1.8.0/CHANGELOG.md)). Provider-side this is the plugin framework's `ResourceWithMoveState` ([state-move](https://developer.hashicorp.com/terraform/plugin/framework/resources/state-move)).
- azurerm NSG, rule and association resources are built on `terraform-plugin-sdk/v2` (import in [network_security_group_resource.go](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_security_group_resource.go)). No `MoveState` exists in the fetched network sources. Consequence: inline `security_rule` cannot be converted to `azurerm_network_security_rule` (or the reverse) with `moved`. The documented path is state removal plus import, as the maintainer described in [#19202](https://github.com/hashicorp/terraform-provider-azurerm/issues/19202).
- `removed` block with `lifecycle { destroy = false }` removes an object from state without destroying it ([removed block](https://developer.hashicorp.com/terraform/language/block/removed); since v1.7.0, [CHANGELOG v1.7.0](https://github.com/hashicorp/terraform/blob/v1.7.0/CHANGELOG.md)).

```hcl
# Adopt an existing NSG and its subnet association into generated code
import {
  to = azurerm_network_security_group.zone_app
  id = "/subscriptions/<sub>/resourceGroups/rg-net/providers/Microsoft.Network/networkSecurityGroups/nsg-vnet1-app"
}
import {
  to = azurerm_subnet_network_security_group_association.zone_app
  id = "/subscriptions/<sub>/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/vnet1/subnets/app"
}

# Hand a resource over without destroying it
removed {
  from = azurerm_network_security_rule.legacy_ssh
  lifecycle { destroy = false }
}
```

### 6. azapi as a fallback for unsupported properties

- **`azapi_resource`** ([docs](https://github.com/Azure/terraform-provider-azapi/blob/v2.13.0/docs/resources/resource.md)) manages any ARM resource through `type = "<resource-type>@<api-version>"`, `parent_id`, `name` and a dynamic `body`. Relevant flags:
  - `ignore_missing_property` (default `true`)
  - `ignore_null_property` (default `false`)
  - `list_unique_id_property`: list items are matched "by a `name` property (if present) or by list ordering" by default
  - `schema_validation_enabled` (default `true`)
  - `locks`: "A list of ARM resource IDs which are used to avoid create/modify/delete azapi resources at the same time"
- **`azapi_update_resource`** ([docs](https://github.com/Azure/terraform-provider-azapi/blob/v2.13.0/docs/resources/update_resource.md)) "can manage a subset of any existing Azure resource manager resource's properties". "When `azapi_update_resource` is deleted, no operation will be performed, and these properties will stay unchanged." In source, update GETs the resource, merges the configured `body` into the response (`MergeObjectWithOption`), then calls `CreateOrUpdate`. That is a full PUT, not a PATCH ([azapi_update_resource.go L470–L531](https://github.com/Azure/terraform-provider-azapi/blob/v2.13.0/internal/services/azapi_update_resource.go#L470-L531)).
- **Moving from azurerm.** `azapi_resource` implements `MoveState` for any source type starting with `azurerm` and uses the source `id`. Special cases exist for some data-plane IDs; the code errors when the ID cannot be parsed as an ARM ID ([azapi_resource.go L1478–L1530](https://github.com/Azure/terraform-provider-azapi/blob/v2.13.0/internal/services/azapi_resource.go#L1478-L1530); feature since azapi v2.1.0, [CHANGELOG](https://github.com/Azure/terraform-provider-azapi/blob/v2.13.0/CHANGELOG.md)). The subnet association ID equals the subnet ID, so a move would turn it into an `azapi_resource` for the whole subnet. The composite NIC–ASG ID `nic|asg` is not an ARM ID. Neither case is documented.
- **Locks are per provider.** azurerm and azapi each keep an in-process mutex map: azurerm [internal/locks/mutexkv.go](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/locks/mutexkv.go); azapi imports its own `internal/locks` ([azapi_update_resource.go L13](https://github.com/Azure/terraform-provider-azapi/blob/v2.13.0/internal/services/azapi_update_resource.go#L13)). A lock taken by one provider does not serialize calls made by the other. This is an inference from code structure: the two providers run as separate plugin processes.
- **Default tags.** azapi has provider-level `default_tags` ([azapi index](https://github.com/Azure/terraform-provider-azapi/blob/v2.13.0/docs/index.md)). The azurerm provider index at 5.13.0 lists no `default_tags` ([index](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/website/docs/index.html.markdown)).

```hcl
resource "azapi_update_resource" "subnet_nsg" {
  type        = "Microsoft.Network/virtualNetworks/subnets@2025-07-01"
  resource_id = data.azurerm_subnet.app.id
  body = {
    properties = { networkSecurityGroup = { id = azurerm_network_security_group.zone_app.id } }
  }
}
```

### 7. Can a Terraform-managed resource be detected from Azure?

- **No ownership field.** Terraform tracks ownership in state. The bulk-import doc says HCP Terraform uses resource identities to tell whether a resource "is managed by another workspace"; that check depends on HCP Terraform state ([bulk](https://developer.hashicorp.com/terraform/language/import/bulk)). No azurerm or azapi doc describes a marker written onto the Azure resource.
- **User-Agent.** azurerm sends `HashiCorp Terraform/<tfVersion> (+https://www.terraform.io) terraform-provider-azurerm/<version>`. Unless `disable_terraform_partner_id = true` or a custom `partner_id` is set, it appends `pid-222c6c49-1b0a-5959-a213-6608f9eb8820` ([client_options.go L105–L129](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/common/client_options.go#L105-L129)). Docs for both providers: `disable_terraform_partner_id` defaults to `false` ([azurerm index](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/website/docs/index.html.markdown), [azapi index](https://github.com/Azure/terraform-provider-azapi/blob/v2.13.0/docs/index.md)). Microsoft describes this mechanism as customer usage attribution, reported to the partner ([learn.microsoft.com](https://learn.microsoft.com/en-us/azure/marketplace/azure-partner-customer-usage-attribution)).
- **Activity Log.** The documented Administrative event schema has `caller` ("Email address of the user ..., UPN claim, or SPN claim"), `claims`, and `httpRequest` ("Usually includes the clientRequestId, clientIpAddress and method"). No user-agent field is documented ([activity log schema](https://learn.microsoft.com/en-us/azure/azure-monitor/platform/activity-log-schema)). Terraform runs can be recognized only through the identity they use.
- **Resource Graph change tracking.** `resourcechanges` carries `changeAttributes.changedBy`, `changedByType` and `clientType`. "Clients are recognized based on the user agent and client application ID ... If the client is supplied but not known, the field will show the client application ID." ([get-resource-changes](https://learn.microsoft.com/en-us/azure/governance/resource-graph/how-to/get-resource-changes)). The page does not say whether Terraform is a recognized `clientType`. A query example on the page covers the past seven days.
- **Tags.** Only tags that someone sets on purpose. azapi `default_tags` can set them per provider; azurerm needs per-resource `tags`.
- **Write-only state.** `network_security_group_id_wo` is not stored in state ([v1.11.0 CHANGELOG](https://github.com/hashicorp/terraform/blob/v1.11.0/CHANGELOG.md)). For subnets associated that way, state holds only the version counter and the computed `network_security_group_id`.

## Modeling options and conflict risks

"Existing repo" means a customer repository that already declares some of these objects. Every option inherits the create-time import check: generating a resource for an object that already exists fails until an `import` block or state import exists.

### NSG and rules

| Option | What nsgfw would own | Documented or derived conflict risks |
|---|---|---|
| A. NSG with inline `security_rule` list | NSG resource plus full rule list | Overwrites any rule not in the list, including rules from standalone resources in the same or another state (documented note). One PUT per NSG; maintainer recommends it against concurrency (#15631, #19202). `security_rule = []` deletes all custom rules. Set-typed plan output shows remove plus add for each changed rule. |
| B. NSG without inline rules + one `azurerm_network_security_rule` per rule | NSG resource (rules `Computed`) and N rule resources | Mixing with inline rules anywhere on that NSG overwrites rules (documented). Priority shifts across rules can fail with `SecurityRuleConflict`; no provider ordering (#19202). No provider lock on rule writes since 3.0, so parallel PUTs reach Azure (commit e9d45dbff). Rules added outside Terraform cause no diff, because `security_rule` is `Computed`. Open unreproduced report of tag-only NSG update failing (#32505). |
| C. Rules only (`azurerm_network_security_rule`), NSG resource stays in the existing repo | Rule resources only | Breaks if the existing repo's NSG uses inline `security_rule`: the next apply of that repo removes nsgfw rules, and the reverse also happens (documented note). Same priority-ordering risks as B. Any NSG update in the other repo PUTs the rule list it reads at that time. |
| D. `azapi_resource` for the NSG | NSG as raw ARM body | Same full-body semantics as A. List merge by `name` or order. `moved` from `azurerm_network_security_group` is possible (azapi MoveState). |
| E. `azapi_update_resource` on an NSG owned elsewhere | A subset of the NSG body | GET-merge-PUT of the full NSG, so the race window with other writers is the same. Destroy is a no-op, so removed rules stay in Azure. Locks are not shared with azurerm. |

### Subnet ↔ NSG

| Option | Conflict risks |
|---|---|
| `azurerm_subnet_network_security_group_association` | Fails on create if the subnet already has an NSG (import required). Replacement means detach then attach. The VNet docs state no rule for combining it with inline subnets; the inline expand sets the NSG to nil when `security_group` is empty. |
| Inline `subnet.security_group` in the VNet resource | Requires editing the VNet resource, which usually lives in the existing repo. Not compatible with `azurerm_subnet` resources (documented). |
| `azurerm_subnet.network_security_group_id_wo` | Requires owning the `azurerm_subnet` resource. Docs recommend the association resource instead. Needs Terraform ≥ 1.11. |
| `azapi_update_resource` on the subnet | Full-subnet GET-merge-PUT. Destroy leaves the NSG attached. |

### ASG membership

| Target | Option | Conflict risks |
|---|---|---|
| NIC | `azurerm_network_interface_application_security_group_association` | Applies to all IPv4 ipconfigs. Create fails if the pair already exists. `azurerm_network_interface` preserves memberships. |
| VMSS (linux, windows, orchestrated) | Inline `application_security_group_ids` in the VMSS resource | No standalone resource. nsgfw would have to edit a resource block owned by the existing repo. Instance roll-out under `upgrade_mode = "Manual"` is not documented. |
| AKS node pool | Inline `node_network_profile.application_security_group_ids` | No standalone resource. Needs `allowed_host_ports`, which "will fail silently" otherwise. Requires editing the cluster or node-pool resource. |
| Private endpoint | `azurerm_private_endpoint_application_security_group_association` | Composite Terraform ID. |

## Uncertain — candidates for an empirical check

1. Does a single NSG PUT with a full rule list succeed when rules swap priorities within the same direction? Source: maintainer claim in #19202 only; no Microsoft doc checked.
2. Is NSG priority uniqueness per direction or per NSG? Provider docs say per collection; Azure's error text and open docs issue #27046 say per direction.
3. What happens when several standalone `azurerm_network_security_rule` PUTs hit one NSG in parallel (default parallelism 10, no provider lock since 3.0)? Is the result `AnotherOperationInProgress`, retries, or success?
4. Can a standalone rule PUT be lost when it runs between the azurerm NSG resource's GET and PUT? The NSG resource locks only within azurerm and only on its own operations; the rule resource takes no lock.
5. Does issue #32505 (tag-only NSG update returns 400) reproduce on azurerm 5.13.0?
6. Inline VNet `subnet` blocks combined with `azurerm_subnet_network_security_group_association`: is there a perpetual diff and an NSG reset on the next VNet subnet change? Docs are silent; expected from source only.
7. How long is a subnet without an NSG when the association resource is replaced (destroy then create)? Is there any way to avoid the gap with azurerm resources?
8. Combining `azurerm_subnet.network_security_group_id_wo` with an association resource on the same subnet: undocumented.
9. VMSS: does changing `application_security_group_ids` reach existing instances under `upgrade_mode = "Manual"`, `Automatic` and `Rolling`, and what disruption occurs?
10. AKS: does changing `node_network_profile.application_security_group_ids` update existing nodes in place or roll the node pool?
11. Are `import` blocks allowed inside child modules on Terraform 1.17? The v1.5.0 CHANGELOG says "Root module authors"; the current reference pages read for this report do not state a restriction.
12. Does Resource Graph `resourcechanges.clientType` show a name for Terraform-originated changes, or the client application ID? Does the `pid-...` User-Agent token appear anywhere a customer can query?
13. `azapi_resource` MoveState from `azurerm_subnet_network_security_group_association` (ID equals subnet ID) and from the composite-ID NIC–ASG association: what is the outcome?
14. `terraform query` list resources for `azurerm_network_security_rule` need an NSG ID per block. How does this behave at tenant scale with the 100-result default limit?
15. The behaviour of `-generate-config-out` for `azurerm_network_security_group` with inline rules versus standalone rules (which form is generated?) is not documented.

## Facts that open design tickets depend on

- azurerm 5.13.0 and azapi 2.13.0 are current. Network resources use ARM API `Microsoft.Network` 2025-07-01.
- Inline `security_rule` and standalone `azurerm_network_security_rule` must not be mixed on one NSG (documented). `security_rule` is `Optional` + `Computed`. Omitting it leaves rules unmanaged; `[]` deletes all.
- An azurerm NSG update is a full-object PUT carrying the complete rule list, including tag-only updates.
- Standalone rules are separate PUTs with no provider lock and no defined order between them. Priority shifts can fail with `SecurityRuleConflict`.
- Rule `name` is `ForceNew`; priority changes are in place. Default replacement order is destroy then create.
- Valid priorities are 100–4096. Azure reports conflicts as same priority plus same direction.
- `azurerm_subnet_network_security_group_association` refuses to create on a subnet that already has any NSG. Its ID and import ID are the subnet ID. Both arguments are `ForceNew`. Delete detaches the NSG.
- Inline VNet subnets are documented as incompatible with `azurerm_subnet`. `azurerm_subnet` preserves an externally attached NSG unless `network_security_group_id_wo_version` changes.
- NIC–ASG membership has a standalone association resource that applies to all IPv4 ipconfigs. VMSS and AKS node pools have only inline ASG lists.
- AKS ASG assignment requires at least one `allowed_host_ports` entry.
- Import IDs: NSG/rule/ASG/subnet use ARM IDs. The NIC–ASG association uses `nicId|asgId`. Associations have no resource identity and no list resource.
- `import` blocks need Terraform ≥ 1.5, `for_each` ≥ 1.7, `identity` ≥ 1.12. `terraform query` needs ≥ 1.14. `removed` needs ≥ 1.7. Cross-type `moved` needs ≥ 1.8 plus provider support. Write-only attributes need ≥ 1.11.
- azurerm NSG/rule resources do not support cross-type `moved`. azapi supports `moved` from azurerm resources with ARM IDs.
- `azapi_update_resource` does GET-merge-PUT, and its destroy is a no-op.
- Provider locks are in-process and per provider. azurerm and azapi do not share them.
- Azure stores no Terraform-management marker. Available signals are the caller identity (Activity Log), `changedBy`/`clientType` in Resource Graph changes, the azurerm/azapi User-Agent with optional partner ID, and tags that someone sets on purpose.
- The provider feature `skip_import_check_on_create_and_allow_overwriting_existing_resources` turns create-time import errors into silent overwrites (documented warning).

## Notes on scope

- The issue asks for this file on branch `research/terraform-azurerm-nsg`. This research run did not create or switch branches; the file was written to the current working tree.
- Microsoft Learn pages were used only for Azure-side behaviour (Activity Log schema, Resource Graph changes, usage attribution), since Microsoft owns those claims. The Microsoft NSG documentation on rule evaluation and limits was not part of this ticket.
- Sources not used: blogs and forums. Every issue cited is from the provider's own tracker. Statements by maintainers there are marked as such.
