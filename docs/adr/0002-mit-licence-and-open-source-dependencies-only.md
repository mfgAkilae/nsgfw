# MIT licence and open-source dependencies only

Status: accepted (2026-11-09, [Grilling: Tech stack and repository architecture](https://github.com/mfgAkilae/nsgfw/issues/10)). Amended on 2026-11-12 by [Review: Grill review of the complete design package](https://github.com/mfgAkilae/nsgfw/issues/23): the rule covers the code shipped in the image and its npm build graph, three exceptions are named, and `infra/` and the default HCL are also tested on OpenTofu.

nsgfw is published under the MIT licence. The code shipped in the image and its npm build graph must carry an OSI-approved permissive licence (MIT, Apache-2.0, ISC, BSD). Anyone who forks the tool or runs it on-premises then needs no licence from a third party. The cost is that features which component vendors sell must be built in the repo instead of bought.

The rule has three named exceptions:

- **Terraform providers under MPL-2.0:** azurerm and azapi ([azurerm licence](https://github.com/hashicorp/terraform-provider-azurerm/blob/main/LICENSE), [azapi licence](https://github.com/Azure/terraform-provider-azapi/blob/main/LICENSE), retrieved 2026-11-12).
- **Fonts under OFL-1.1,** such as the typeface of the console.
- **The Terraform CLI.** From version 1.6 it carries BUSL-1.1, which is not OSI-approved ([Terraform licence](https://github.com/hashicorp/terraform/blob/main/LICENSE), retrieved 2026-11-12). It is a tool the operator runs, not a dependency. `infra/` and the default HCL are also tested on OpenTofu, so that no installation needs a BUSL tool.

## Considered Options

- **Open source, but individual commercial libraries allowed.** Rejected. AG Grid Enterprise is licensed per developer and per deployment. Every operator and contributor would need their own licence, and the tool would not run as published.
- **Proprietary, with the repo public only for hosting.** Rejected.

## Consequences

- The Rule base table uses AG Grid Community (MIT). Context menu, clipboard copy and paste, and rule sections are Enterprise features there, so nsgfw builds them itself. MUI X row reordering is Pro-only and was ruled out for the same reason.
- A non-permissive licence can slip in through a transitive dependency. The increment plan decides how CI enforces the rule, for example with a licence check.
- The repository needs a `LICENSE` file (MIT) with the first code commit.
