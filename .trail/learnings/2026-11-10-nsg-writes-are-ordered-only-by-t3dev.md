---
title: "NSG writes are ordered only by Crossing flows: the NSG that closes a flow goes before the one that opens it"
author: T3dev
date: 2026-11-10
branch: main
cost: { minutes: 18, tokens: 181957 }
id: l-28c0958d
scope: repo
status: active
replaces: l-f3fe9d74
src: agent
touches:
  - docs/adr/0018-write-order-from-dominance-gaps.md
  - GLOSSARY.md
---

A review of the engine prototype's write-order check (issue 22) tightened the rule of ADR 0018 on the day it was accepted. ADR 0018 holds the detail.

## Decided

- Writes have no phases. A Crossing flow is a flow between two Zones that one NSG denies before and allows after, while the other allows before and denies after. The NSG that closes is written first. Nothing else orders NSG writes.
- For a service tag such as VirtualNetwork the engine evaluates both cases, address inside the tag and outside, per NSG, and unites the edges. It cannot read what the tag contains.
- Any cycle of edges fails validation, not only edges both ways between two Zones. The Change set is then split.
- ASG membership still goes in three steps (closing member changes, NSGs, opening member changes).

## Tried and ruled out

- Edges from Dominance gaps (a gap in only one of the two states): safe, but a gap also arises when only one NSG changes or when the target allows the flow. Over 12,000 random Change sets it ordered 9,472 and rejected 867; the exact rule ordered 2,956 and rejected 11. Swapping one allowed port between a strict Zone and a Zone with the inbound Inherited default was rejected although any order is safe.
- Assuming what VirtualNetwork contains: up to 1,204 of 9,000 random Change sets opened traffic when Azure resolved the tag differently.
- No order at all: five cases open traffic that both Versions deny (one-sided tag Rules, inbound Inherited default with a strict source, Zone removal, legacy NSGs, ASG membership).

## Watch out

- An NSG that waits for another waits as a whole, including changes that close other traffic. There is no interim content.
- The guarantee assumes that one NSG PUT and one network interface write each take effect as a whole (issue 24).
- The prototype has three Zones and one ASG object, and checked the member steps with known tag contents only.

In the code: docs/adr/0018-write-order-from-dominance-gaps.md (the file name keeps the first wording); the term Crossing flow in GLOSSARY.md; scripts crossing-compare.mjs, crossing-tags.mjs and crossing-members.mjs on the branch prototype/translation-engine-order-check.
