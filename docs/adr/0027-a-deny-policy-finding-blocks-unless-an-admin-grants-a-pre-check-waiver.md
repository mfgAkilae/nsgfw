# A deny Policy finding blocks unless an admin grants a Pre-check waiver

Status: accepted (2026-11-12, [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23)). First decided on 2026-11-09 in [Grilling: Policy and security-layer visibility](https://github.com/mfgAkilae/nsgfw/issues/21).

Azure Policy can deny a write that the tool plans. `checkPolicyRestrictions` is the only documented way to ask beforehand, and its coverage is undocumented: no page says whether it honours `enforcementMode: DoNotEnforce`, `notScopes` or exemptions ([Azure Policy evaluation before deployment](../research/azure-policy-precheck.md)). A pre-check that only warns lets an approver approve a Change set that Azure then rejects. A pre-check that always blocks lets one false positive stop a Commit until the policy owner acts.

We decided:

- **The policy pre-check runs at Submit, on demand and before every Deployment.** Its result belongs to the Preview that the approver sees. It runs again in both pre-check stages of [ADR 0022](0022-a-version-exists-from-its-commit-and-deployments-plan-from-the-deployed-state.md), and before a Retry for the retried writes. It checks every write: NSG content, Retired NSGs, subnet associations and swaps.
- **A deny Policy finding blocks Submit and Commit.** It is a validation error. Audit and modify findings are information only and never block.
- **The tool classifies a finding by `policyEffect`, never by `result`.** Microsoft's example for the call shows a field restriction with `policyEffect: "Deny"` and `result: "Required"` ([check policy restrictions](https://learn.microsoft.com/en-us/rest/api/policyinsights/policy-restrictions/check-at-resource-group-scope?view=rest-policyinsights-2024-10-01), retrieved 2026-11-09), so the result alone would read a deny as information.
- **The tool filters findings that Azure does not enforce.** It reads the assignment and the exemptions itself. A deny finding whose assignment does not enforce, whose `notScopes` contain the resource, or that a valid exemption covers becomes information: "not enforced" or "exempt". A finding that the tool drops by mistake is safe: the real PUT fails as a permanent write error, and nothing opens.
- **A Pre-check waiver sends one write to Azure anyway.** An admin in at least one Affected Zone can waive one deny Policy finding on one resource for one Change set, with a mandatory reason. The tool then sends the write, and Azure decides; a deny there is a normal permanent write error. The waiver survives a Rebase while the finding stays the same. Approvers see it in the Preview, and it is an audit entry. It does not reset Approvals, because it does not change the content. An admin can also waive a finding in the Emergency Commit dialog.
- **A deny finding blocks the automatic Submit of a Change set that the tool prepares,** and the admins are notified.

## Considered Options

- **Deny findings as warnings at Submit.** Rejected. The approver's work would be wasted.
- **A pre-check only before the Deployment.** Rejected. An approver would approve a Change set that Azure rejects.
- **A pre-check on every Preview recompute.** Rejected. It costs one call per NSG and subnet write after every edit and risks throttling on large Change sets.
- **No waiver.** Rejected. A false positive would block the Commit until the policy owner acts.

## Consequences

- A waiver overrides the pre-check, not the policy. Where the policy does deny, the write fails with `RequestDisallowedByPolicy`, and the Deployment history stores the policy name and reason.
- A new deny finding at a scheduled time fails stage 1: no Version is created, and the Change set stays Approved without a schedule (ADR 0022).
- `nsgfw Reader` holds four policy reads for this: assignments, definitions, initiatives and exemptions ([ADR 0014](0014-operator-grants-azure-roles-tool-verifies.md)). A missing policy read only flags the Environment and falls back to IDs and unfiltered findings. A missing `Microsoft.PolicyInsights/checkPolicyRestrictions/read` blocks, because the pre-check cannot run.
- The classification by `policyEffect` joins the list of nightly tests.
