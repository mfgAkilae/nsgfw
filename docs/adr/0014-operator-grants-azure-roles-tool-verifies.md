# The operator grants the Tool identity's Azure roles, and the tool verifies them

Status: accepted (2026-11-09, [Grilling: Hosting, identity and least-privilege role](https://github.com/mfgAkilae/nsgfw/issues/20)). Amended on 2026-11-09 by [Grilling: Review round on placement, egress posture and MVP shape](https://github.com/mfgAkilae/nsgfw/issues/27): a third, optional role holds the rights for tool-written ASG membership.

The brief requires a least-privilege custom role for the Tool identity and a documented reason for every permission. One Tool identity serves all Environments ([Grilling: Environment and tenancy model](https://github.com/mfgAkilae/nsgfw/issues/9)). In a Terraform Environment the tool writes nothing to Azure ([ADR 0010](0010-terraform-mode-data-contract-and-azure-observation.md)). Often a different team owns the management group of an Environment than the team that runs the tool. A tool that can assign roles could also widen its own rights.

We decided:

- **Two custom roles, and a third optional one.** `nsgfw Reader` holds only the reads the tool needs and is assigned in every Environment, at the Environment's scope. `nsgfw Writer` holds only what Managed NSGs need: NSG write, delete and join, subnet write, and `joinNetworkSecurityRule` on ASGs. It is assigned in ARM Environments only, at the Environment's scope or narrower, for example on the subscriptions that hold Zones. `nsgfw ASG Writer` holds what only tool-written ASG membership needs: ASG write and delete, `joinIpConfiguration`, network interface write and private endpoint write. An operator who uses no ASG objects never grants it. The full network interface PUT on other teams' VMs is the widest right the tool can hold, and across VNets an ASG becomes a list of IPs anyway ([ADR 0006](0006-asg-objects-one-managed-asg-per-vnet.md)). No role holds Compute writes.
- **Explicit actions only, no wildcards.** Every action is listed one by one with its reason, and the same list drives the tool's permission check. A new action arrives only with a tool version that needs it. An action whose need Microsoft does not document stays out until a test shows that it is needed.
- **One set of role definitions** with one management group as assignable scope, by default the tenant root management group, created by the `instance` Terraform module. The `environment-access` module creates the role assignments of one Environment, and that Environment's owner runs it.
- **The tool never assigns roles.** It holds no `Microsoft.Authorization/roleAssignments/write`.
- **The tool verifies its effective permissions** at Environment onboarding, at Zone onboarding, once a day and before the first write of every Deployment. A missing action flags the Environment or Zone with the actions it lacks and blocks Deployments to the affected Zones before their first write, like Drift, Policy and live limits ([ADR 0009](0009-tighten-then-loosen-deployments.md)). A missing read stops Drift polling where it applies and is flagged too.
- **The tool reads only inside Environments.** An Address object that stands for an Azure resource (subnet, VNet, External ASG object) must lie in an Environment. A subscription with shared infrastructure, such as a hub, joins an Environment without Zones and gets only the Reader there.

## Considered Options

- **One custom role.** Rejected. Terraform Environments would hold write rights, or need a second definition after all.
- **The tool assigns its own roles** through User Access Administrator with a condition. Rejected. It is a privilege-escalation surface.
- **Wildcards for reads,** such as `Microsoft.Network/*/read`. Rejected. Microsoft advises explicit actions, because wildcards include future actions automatically.
- **Role definitions per Environment.** Rejected. Every Environment would need a new apply on each upgrade, and the definitions could drift apart.
- **Read-only scopes outside Environments.** Rejected. It would add a concept with its own discovery, Drift observation and read filter for Roles.
- **Adding every candidate join action at once.** Rejected. Together with subnet write, they would let the identity attach any route table or NAT gateway to a subnet.

## Consequences

- Whoever applies the `instance` module needs the right to create role definitions at the chosen management group.
- After an upgrade that needs a new action, the permission check flags it until the role definitions are updated.
- An Environment owner who narrows the Writer also limits which subnets can become Zones. Zone onboarding then fails and names the missing actions.
