# One central Rule base across all Environments

Status: accepted (2026-11-09, [Grilling: Environment and tenancy model](https://github.com/mfgAkilae/nsgfw/issues/9))

The brief makes the naming pattern, Deployment mode, Terraform templates and Tool identity scope settings "per environment". That wording suggests one Rule base per Environment. We decided against it: an Environment partitions only Azure (a management group or a list of subscriptions, disjoint by subscription). One tool instance has exactly one Rule base, and Change sets and Versions are global. This keeps the tool's main promise: one Rule from Zone A to Zone B produces both the outbound NSG rule on A and the inbound NSG rule on B, even when A and B are in different Environments. It also lets the later packet tracer and rule analysis work on one rule set.

## Considered Options

- **One Rule base per Environment.** Rejected. A flow between two Environments, such as a spoke in a Terraform Environment that needs DNS from a hub in an ARM Environment, would need two unrelated Rules with two Approvals, and the tool could not show that they belong together.
- **One Environment per tool instance.** Rejected. Several Environments would need several containers, and flows between them could not be modelled at all.

## Consequences

- One Commit can span Environments with different Deployment modes. The ARM part can land while the Terraform pull request is still open. Deployment execution and the Terraform workflow must define how the Version, the audit log and rollback handle that state.
- Environment is the coarsest Scope for Roles and Approval requirements, so teams can still own their own part of the shared Rule base.
