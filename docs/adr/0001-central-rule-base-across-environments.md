# One central Rule base across all Environments

Status: accepted (2026-11-09, [Grilling: Environment and tenancy model](https://github.com/mfgAkilae/nsgfw/issues/9)). Amended on 2026-11-12 by [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23): the instance is the root Scope for Roles, and the consequence on a Commit across Deployment modes says what was decided.

The brief makes the naming pattern, Deployment mode, Terraform templates and Tool identity scope settings "per environment". That wording suggests one Rule base per Environment. We decided against it: an Environment partitions only Azure (a management group or a list of subscriptions, disjoint by subscription). One tool instance has exactly one Rule base, and Change sets and Versions are global. This keeps the tool's main promise: one Rule from Zone A to Zone B produces both the outbound NSG rule on A and the inbound NSG rule on B, even when A and B are in different Environments. It also lets the later packet tracer and rule analysis work on one rule set.

## Considered Options

- **One Rule base per Environment.** Rejected. A flow between two Environments, such as a spoke in a Terraform Environment that needs DNS from a hub in an ARM Environment, would need two unrelated Rules with two Approvals, and the tool could not show that they belong together.
- **One Environment per tool instance.** Rejected. Several Environments would need several containers, and flows between them could not be modelled at all.

## Consequences

- One Commit can span Environments with different Deployment modes. The ARM part can land while the Terraform pull request is still open. The Version exists from the moment of the Commit, and each affected Environment gets a Deployment with its own result ([ADR 0022](0022-a-version-exists-from-its-commit-and-deployments-plan-from-the-deployed-state.md)). A Terraform Deployment counts as deployed only when Azure shows its target ([ADR 0010](0010-terraform-mode-data-contract-and-azure-observation.md)). The Deployment history records each Deployment per Environment. A rollback is a Restore or a Revert, each a new Change set with its own Commit.
- The instance is the root Scope for Roles; Environment is the coarsest Scope for Approval requirements. Teams can still own their own part of the shared Rule base.
