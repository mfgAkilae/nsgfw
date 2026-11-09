# Adopt existing NSGs in place at Zone onboarding

Status: accepted (2026-11-09, [Grilling: Zone onboarding and NSG lifecycle](https://github.com/mfgAkilae/nsgfw/issues/11))

When a subnet becomes a Zone and already has an Unmanaged NSG that is associated with only that subnet and with no NIC, the tool imports that NSG in place as the Zone's Managed NSG. The NSG keeps its name and resource group, gets the managed-NSG marker tag, and is exempt from the Environment's naming pattern. The tool creates a new NSG with a name from the naming pattern only when the subnet has no NSG, or when the existing NSG is also associated with other subnets or NICs.

To replace an NSG, the tool must change the subnet's association, and Azure changes it only through a full subnet PUT. The Terraform association resource replaces an association by deleting it first and creating the new one afterwards, so the subnet is briefly without an NSG. The Azure Landing Zone policy `Deny-Subnet-Without-Nsg` denies exactly that subnet PUT ([Research: Azure Policy evaluation before deployment](https://github.com/mfgAkilae/nsgfw/issues/5), [Research: Terraform azurerm modeling of NSGs, associations and ASGs](https://github.com/mfgAkilae/nsgfw/issues/6)). Adopting in place needs no subnet write. Anything that refers to the NSG by its resource ID, such as an NSG flow log or a resource lock, keeps working.

## Considered Options

- **Always replace the existing NSG with a new one named by the pattern.** Rejected. Names would be consistent, but every onboarding would need a subnet write, Terraform mode would hit the delete-then-create gap under the ALZ policy, and everything that refers to the old NSG would lose its target.
- **Let the admin choose adopt or replace per subnet.** Rejected. It means two paths to build and test for the same result. The replace path stays only for NSGs that are also associated with other subnets or NICs, where adopting would change traffic outside the Zone.

## Consequences

- Not every Managed NSG follows its Environment's naming pattern. The UI shows each Zone's actual NSG name and never derives it from the pattern.
- Import converts the adopted NSG's rules into Rules, as for any other imported NSG.
- An NSG that is also associated with other subnets or NICs still needs a swap. How Terraform mode swaps an NSG without the delete-then-create gap is open in [Grilling: Terraform mode workflow](https://github.com/mfgAkilae/nsgfw/issues/17).
