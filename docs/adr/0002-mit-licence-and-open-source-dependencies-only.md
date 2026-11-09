# MIT licence and open-source dependencies only

Status: accepted (2026-11-09, [Grilling: Tech stack and repository architecture](https://github.com/mfgAkilae/nsgfw/issues/10))

nsgfw is published under the MIT licence, and every runtime and build dependency must carry an OSI-approved permissive licence (MIT, Apache-2.0, ISC, BSD). Anyone who forks the tool or runs it on-premises then needs no licence from a third party. The cost is that features which component vendors sell must be built in the repo instead of bought.

## Considered Options

- **Open source, but individual commercial libraries allowed.** Rejected. AG Grid Enterprise is licensed per developer and per deployment. Every operator and contributor would need their own licence, and the tool would not run as published.
- **Proprietary, with the repo public only for hosting.** Rejected.

## Consequences

- The Rule base table uses AG Grid Community (MIT). Context menu, clipboard copy and paste, and rule sections are Enterprise features there, so nsgfw builds them itself. MUI X row reordering is Pro-only and was ruled out for the same reason.
- A non-permissive licence can slip in through a transitive dependency. The increment plan decides how CI enforces the rule, for example with a licence check.
- The repository needs a `LICENSE` file (MIT) with the first code commit.
