---
title: "The order of NSG writes matters only across dominance gaps and for ASG membership, so the Tighten and Loosen phases are gone"
author: T3dev
date: 2026-11-10
branch: main
cost: { minutes: 16, tokens: 159201 }
id: l-f3fe9d74
scope: repo
status: active
replaces: l-65c90d71
src: agent
touches:
  - docs/adr/0018-write-order-from-dominance-gaps.md
---

The engine prototype (issue 22) checked whether, with deny Rules on both sides (ADR 0016), any mix of old and new NSG contents allows only what the old or the new Version allows. The map owner then chose the write-order rule below. ADR 0018 holds the detail and supersedes ADR 0009.

## Decided

- Every Zone has an Egress posture (destination-enforced by default), deny Rules land on both sides, and Zones carry Extra prefixes (ADR 0016, ADR 0017; from the earlier review round).
- Writes have no phases. A dominance gap is a flow between two Zones that the destination's inbound allows and the source's outbound denies. A gap only in the target means: write the source first. A gap only in the Deployed state means: write the destination first. A gap in both needs no edge.
- ASG membership goes in three steps: member changes that only close under the old contents, then the NSGs, then member changes that only open under the new contents.
- A Change set whose edges point both ways, or whose member change fits neither step, fails validation and is split. There is no interim content, no hold and no override.

## Tried and ruled out

- No order at all: it opens traffic that both Versions deny for Rules with a service tag on one side, the inbound Inherited default with a strict source, Zone removal (Retired NSG), legacy NSGs at onboarding, and ASG membership.
- Edges per Zone pair instead of per flow: far too many Change sets look unorderable, because a gap in both Versions for the same flow is harmless (the source denies in both).
- Classifying member changes against the old contents only: 25 of 4,000 random Change sets still opened, because the NSGs' target was evaluated with members that were not final yet.

## Watch out

- The guarantee assumes that one NSG PUT and one network interface write each take effect as a whole (issue 24 checks the NSG PUT).
- The prototype models one ASG object. A network interface in several ASG objects changes several memberships in one write, so classify it as one change.
- The current limits are 2,000 rules per NSG and 6,000 addresses per side (checked 2026-11-09).

In the code: docs/adr/0018-write-order-from-dominance-gaps.md; the prototype lives on the branch prototype/translation-engine-order-check (prototypes/translation-engine-order-check/: order-check.html, check.mjs, gap-order.mjs, member-order.mjs).
