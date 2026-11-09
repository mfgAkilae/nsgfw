# Project brief: Azure NSG management tool

This is the original project brief, verbatim. It is the source of requirements for the wayfinder map and every design ticket.

## Working rules

All design decisions in this brief are settled. Where it still leaves something open, list it and ask before designing anything that depends on it. Never decide silently.

## Goal and target users

Build a graphical management tool for Azure Network Security Groups (NSGs). Users manage network access the way they would on a classic firewall appliance: a central rule base with objects, zones and ordered rules.

The tool translates this rule base into NSGs and NSG rules. It creates, updates, associates and deletes NSGs automatically in the affected subnets and VNets. NSGs are abstracted away: users never create or edit an NSG directly.

- Target users: network and security administrators who know classic firewall consoles (e.g., Palo Alto, Fortinet, Check Point) but are not necessarily Azure experts.
- UI language: English and German, switchable by the user

## Scope

- Azure scope: all subscriptions below a management group, up to the whole tenant
- Regions: multiple regions
- Network topology: mixed, i.e. hub-and-spoke as well as standalone VNets
- The tool never modifies NSGs it does not manage, unless they were explicitly imported (see "Source of truth and existing environment").

## Translation model

The translation engine (rule base → NSG rules) is the core of the tool. Design it explicitly and document it with worked examples.

### Objects

- Address objects: single IPs, CIDR ranges, Azure service tags, subnets, VNets, and groups of these.
- Service objects: protocol plus port or port range, and groups of these.
- Objects map to NSG constructs: IP prefixes, service tags and Application Security Groups (ASGs).
- ASG handling: the tool creates and manages ASGs, including NIC membership

### Zones

- A zone is: a subnet
- Zones are the main way users choose source and destination, as on a firewall.

### Rules

- Fields: name, source, destination, service, action (allow/deny), enabled, comment, ticket reference, owner, optional expiry date.
- The UI shows rules top-down with first-match semantics.
- The engine assigns NSG priorities (100–4096) so the effective order matches the UI. Leave gaps between priorities and renumber when rules are reordered.
- Use augmented rules (several prefixes, ports or service tags per rule) to save rule slots.

### Distributing a rule to NSGs

- A rule "A → B" becomes: an outbound rule on A's NSG plus an inbound rule on B's NSG
- NSG level: subnet NSGs only. The tool does not manage NIC-level NSGs, but detects existing ones and shows them, because traffic must be allowed by both.
- NSGs are stateful. Never generate rules for return traffic.
- One NSG per subnet, created automatically, named according to a naming pattern configurable per environment (e.g. nsg-{vnet}-{subnet}) and tagged as managed by the tool.

### Azure default rules

- Azure's default rules allow all traffic within the VNet (AllowVnetInBound, AllowVnetOutBound) and outbound to the Internet (AllowInternetOutBound). Firewall users expect an implicit deny instead.
- Handling: add explicit deny-all rules, inbound and outbound, at the lowest custom priority, keeping required exceptions such as AzureLoadBalancer health probes. Warn users that outbound traffic to the Internet and to Azure services then needs explicit allow rules.
- Always show the Azure default rules read-only in the UI, so users see the complete effective rule set.

### Limits and lifecycle

- Respect Azure limits: rules per NSG, prefixes per NSG, NSGs and ASGs per subscription and region. Take current values from Microsoft documentation, not from memory.
- Validate against these limits before deployment and show a clear warning.
- NSG that is no longer needed: keep it associated with only the deny-all rules, so the subnet stays protected and no Azure Policy is violated.

## Source of truth and existing environment

- Deployment mode: both modes, selectable per environment: direct deployment via the Azure Resource Manager API, or generated Terraform code delivered as a pull request
- In Terraform mode, generated code follows templates configurable per environment, so it fits existing repositories and modules. Resources managed by Terraform must never be changed directly through the API, or the tool will fight the Terraform state.
- Import: discover existing NSGs and rules and convert them into the rule base. Flag anything that cannot be mapped cleanly.
- Drift detection: detect changes made outside the tool (portal, CLI, other IaC). Show a diff and let the user adopt or overwrite them.
- Azure Policy: Landing Zone policies can deny deployments, e.g. subnets without an NSG or management ports open from the Internet. Show the policy name and reason in the UI, and check before deploying where possible.
- Other security layers: shown read-only, so users see what can override or bypass their NSG rules:
  - Azure Virtual Network Manager security admin rules, which are evaluated before NSGs and can override them.
  - Azure Firewall and user-defined routes in hub-and-spoke setups.

## Change workflow

Changes work like on a firewall: edit, review, then commit.

1. Edits go into a pending change set, not straight to Azure.
2. Before commit, a preview shows exactly which NSGs, rules, associations and ASGs will be created, changed or deleted.
3. Commit deploys the change set. Approval: configurable per scope, from no approval up to four-eyes approval
4. Every committed version of the rule base is stored and can be rolled back.

Also required:

- Partial failures: deployments are idempotent and resumable. If some updates fail, show exactly which ones and offer retry or rollback. Never leave a silent half-applied state.
- Concurrency: detect or prevent conflicting edits by two administrators.
- Audit log: who changed what, when and why (comment or ticket), plus the deployment result.

## Security and access

- Sign-in: Microsoft Entra ID (SSO).
- Roles in the tool: viewer, editor, approver, admin, each limited to a scope (subscription, VNet or zone).
- Tool identity in Azure: a managed identity when running in Azure, a service principal with certificate-based authentication when running on-premises. Both get a least-privilege custom role. Document every required permission and why, including subnet write and NSG join permissions needed for associations.
- Scope of that identity: a management group or individual subscriptions, chosen per environment during onboarding
- No secrets in code or configuration; use Key Vault where secrets are unavoidable.

## Visibility and troubleshooting

- Hit counts and traffic logs: NSGs have no native hit counters. integrate VNet flow logs / Traffic Analytics via Log Analytics in a later phase, not in the MVP
- Policy check ("packet tracer"): answer "Is traffic from X to Y on port Z allowed?" from the tool's rule base, and verify it with Network Watcher (effective security rules, IP flow verify).
- Rule analysis: find shadowed, redundant and overly broad rules (any/any, Internet as source) as well as unused objects.
- Optional: a topology view of VNets, subnets and zones with their NSGs.

## UI requirements

Model the UI on firewall management consoles.

- Rule base table with columns: number, name, source, destination, service, action, hits, comment.
- Drag-and-drop reordering, inline editing, search and filter, clone, disable and bulk actions.
- Object library with an object picker that includes Azure service tags.
- Zone overview.
- Pending changes panel with the preview from the change workflow.
- Audit log and deployment history views.

## Technical requirements

- Platform: web app
- Hosting: one container image that runs both in Azure Container Apps and on-premises
- Stack: TypeScript end-to-end, with a Node.js backend and a React frontend (e.g. Fluent UI). The rule model and its validation are shared between frontend and backend
- Storage for rule base, versions and audit log: PostgreSQL (Azure Database for PostgreSQL in Azure, standard PostgreSQL on-premises)
- Azure access through the Azure SDK for JavaScript or the ARM REST API, with retries and throttling handling. Use Azure Resource Graph to discover NSGs, subnets and associations across subscriptions.
- Deployment of the tool itself as IaC: Terraform
- Tests: thorough unit tests for the translation engine with concrete rule-base-to-NSG examples, plus integration tests against a dedicated test subscription.

## Phases

The MVP is deliberately broad. Build it in small, testable increments, starting with the translation engine.

### MVP

- Management group or subscription scope, multiple regions, subnet-level NSGs.
- Objects: IP/CIDR, service tags, subnets, and ASGs including NIC membership.
- Rule base UI in English and German, translation engine, preview and commit.
- Both deployment modes: direct via the ARM API and Terraform pull request.
- Configurable approval workflow.
- Versioning and rollback.
- Import of existing NSGs and drift detection.
- Entra ID sign-in and audit log.

### Later

- Flow-log hit counts.
- Policy check ("packet tracer") and rule analysis.
- Optional topology view.

## How to proceed

1. Read the whole brief. List every assumption you would have to make, then ask before continuing.
2. Before writing code, deliver an architecture proposal, the data model of the rule base, and the translation algorithm with worked examples (rule base in, NSG rules out).
3. Verify Azure limits, API behaviour and rule evaluation order against current Microsoft documentation.
4. Wait for confirmation, then build the MVP in small, testable steps.
