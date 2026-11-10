# Translation engine

Status: draft from [Task: Translation engine design doc with worked examples][t31], 2026-11-10. It describes, step by step, what the ADRs and the closed tickets decided for the Translation engine. It decides nothing itself. Four gaps found while writing were decided by the map owner on 2026-11-10 and are recorded in ADR 0005, ADR 0010, ADR 0016 and ADR 0018. What is still open is listed under [Open points](#open-points). The worked examples come from the prototype of [Prototype: Translation engine worked examples][t22]; its `engine.js` is a reference, not code to merge. The design-package review covers this document. Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## What the engine is

The Translation engine is `packages/engine`. It is pure: the same inputs give the same outputs, and it does no I/O ([architecture](architecture.md#the-translation-engine-boundary)). The server calls it for the Preview, at validation, at the Commit and when a Deployment plans its writes.

| Part | Answers | Section |
|---|---|---|
| Translate | Which NSG rules does every Managed NSG hold for this Rule base? | [Translate](#translate-from-the-rule-base-to-nsg-rules) |
| Evaluate | Does the Rule base allow this flow, and which Rule or posture element decides? | [Evaluate](#evaluate-the-rule-base-evaluation-function) |
| Preview and Affected Zones | What changes against the last Version, and whose Approval does it need? | [Preview and Affected Zones](#preview-and-affected-zones) |
| Plan | Which writes does a Deployment make, and in which order? | [Plan](#plan-the-write-order) |
| Import | Which Rules does an existing NSG become, and where do they go in the Rule base? | [Import](#import) |

The Data contract and the order check at Rebase use the same functions and are described here too. Whether the Data contract generator and the Import mapping live in this package is open in [Grilling: Server internals at the design target][t30].

## Inputs and outputs

| Input | Content | Why |
|---|---|---|
| Rule base of one Version, or of a Change set on its base Version | Rules in order (Rule ID, source, destination, service, action, enabled flag); Objects with their VNet bindings; the ASG members of every ASG object; Zones with Egress posture, Extra prefixes and Inherited defaults; the Internal address space | the only source of NSG content |
| Azure inventory snapshot | VNets with address spaces and peerings; subnets with prefixes; network interfaces and private endpoints with their IPs; the ASG members of every External ASG object; the Environment of each subscription with its Deployment mode and naming patterns; the existing NSGs at Import | Coverage, the IP fallback and the tag facts depend on Azure ([ADR 0004](../adr/0004-place-rules-by-coverage.md)) |
| NSG rules stored with the last committed Version | names and priorities per Managed NSG and direction | priorities stay stable ([ADR 0005](../adr/0005-stable-nsg-rule-identity.md)); live Azure state never feeds into them |
| Deployed state of every resource a Deployment touches | the content the tool last wrote | the write order ([ADR 0018](../adr/0018-write-order-from-dominance-gaps.md)) |
| Limits data file | each limit with documentation URL and date | limit checks |

| Output | Content |
|---|---|
| Target content | every Managed NSG and Retired NSG with its NSG rules (name, priority, direction, access, protocol, ports, source, destination, description); every NSG rule from a Rule carries that Rule's ID |
| ASGs | the Managed ASGs per VNet and the membership of every network interface and private endpoint |
| Findings | errors and warnings as codes with parameters, limit counts per NSG, Rules without effect, the cost of every Rule |
| Preview and Affected Zones | the diff against the last Version, and the Zones whose Approval the Change set needs |
| Write plan | writes, dependency edges, Crossing-flow edges, member steps, or "not orderable" with the flows that cause it |
| Engine version | stored with every Version ([Engine version](#engine-version)) |

## The example estate

All worked examples use one small estate.

| VNet | Address space | Connected to |
|---|---|---|
| hub | 10.0.0.0/16 | peered with spoke1, spoke2, spoke3 |
| spoke1 | 10.1.0.0/16 | hub |
| spoke2 | 10.2.0.0/16 | hub |
| spoke3 | 10.3.0.0/16, fd00:3::/48 | hub |
| lab | 10.1.0.0/16 (the range of spoke1 again) | nothing |

| Zone | VNet | Prefixes | Special |
|---|---|---|---|
| web, app, db, billing | spoke1 | 10.1.1.0/24, 10.1.2.0/24, 10.1.3.0/24, 10.1.4.0/24 | |
| api | spoke2 | 10.2.1.0/24 | |
| pg | spoke2 | 10.2.5.0/24 | PostgreSQL flexible server |
| aks | spoke2 | 10.2.8.0/22 | AKS nodes, Azure CNI Overlay |
| appgw | hub | 10.0.1.0/24 | Application Gateway v2 |
| dual, dual2 | spoke3 | 10.3.1.0/24 + fd00:3:0:1::/64, 10.3.2.0/24 + fd00:3:0:2::/64 | dual-stack |
| labapp | lab | 10.1.2.0/24 (the prefix of app again) | |

Subnets that are not Zones: hub/mgmt (10.0.9.0/24) and lab/clients (10.1.4.0/24). Objects: `onprem-clients` 192.168.10.0/24, `net-10` 10.0.0.0/8, `spoke1-range` 10.1.0.0/16, `web01` 10.1.1.5. The Internal address space is the default: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 and fc00::/7. Every Zone is destination-enforced unless an example says otherwise. Managed NSGs are named `nsg-<vnet>-<zone>` and Managed ASGs `asg-<object>-<vnet>`.

The tables list the NSG rules that come from Rules. The posture NSG rules of every Managed NSG are shown once, in [Example 6](#example-6-every-block-of-one-managed-nsg), and left out of the other tables unless they matter. Each example names its key in the prototype, so `node run.mjs <key>` and `worked-examples.html` on the branch [`prototype/translation-engine-worked-examples`][proto] show the full output.

## Translate: from the Rule base to NSG rules

Translation runs per Managed NSG. For every enabled Rule, in Rule base order, the engine decides whether the Rule lands on the NSG, builds both sides, splits the Rule into NSG rules and leaves out what has no effect. Then it adds the posture NSG rules, assigns priorities and counts limits.

### Step 1: Coverage

Coverage is the set of Zones an Object stands for ([ADR 0004](../adr/0004-place-rules-by-coverage.md), [ADR 0006](../adr/0006-asg-objects-one-managed-asg-per-vnet.md), [ADR 0017](../adr/0017-extra-prefixes-and-vnet-bindings.md)).

| Object | Coverage |
|---|---|
| Zone | itself |
| VNet | the Zones inside it, by Azure containment |
| single IP, CIDR range | every Zone whose prefixes or Extra prefixes it overlaps, in every VNet; with a VNet binding only Zones in the bound VNets |
| any | every Zone |
| ASG object, External ASG object | the Zones that hold its ASG members |
| Address group | the union of its members |
| service tag, subnet that is not a Zone | no Zone |

The Coverage of a Rule's source is the union over its source Objects, and the same holds for its destination.

### Step 2: Placement

A Rule lands as outbound NSG rules on every Zone in the Coverage of its source and as inbound NSG rules on every Zone in the Coverage of its destination. Allow and deny Rules land the same way ([ADR 0016](../adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md)). A Rule can land in both directions on one Zone: "web → any" lands inbound on web too, because any covers web.

A disabled Rule lands nowhere. A Rule that produces no NSG rule anywhere, because it covers no Zone or a side resolves to nothing, stays valid. The Preview marks it "no effect", and it never blocks a Commit ([Grilling: Rule placement and default posture][t12], point 7).

### Step 3: The two sides of an NSG rule

On the NSG of Zone Z, the **own side** is the side that placed the Rule there: the destination for inbound NSG rules, the source for outbound ones. The other side is the **far side**.

1. **Flatten.** Address groups are replaced by their members, recursively.
2. **Own-side pruning.** The own side keeps only the members whose Coverage includes Z. The far side stays complete ([Grilling: Priority assignment and rule packing][t13], point 9). Pruning keeps or drops whole members. It never cuts a prefix: `spoke1-range` on the NSG of web stays 10.1.0.0/16.
3. **Resolve each member:**

| Member | Becomes |
|---|---|
| any | `*` |
| Zone | its prefixes and Extra prefixes |
| single IP, CIDR range | its own value, also when it has a VNet binding |
| subnet that is not a Zone, VNet | the subnet's prefixes, the VNet's address space |
| service tag | the tag |
| ASG object, External ASG object | a reference to its ASG in Z's VNet, if it has ASG members there; on the far side also the private IPs of its ASG members in other VNets (the **IP fallback**, [ADR 0006](../adr/0006-asg-objects-one-managed-asg-per-vnet.md)) |

Two more cases use the IP fallback. On a Zone whose service takes no ASGs in NSG rules (PostgreSQL flexible server), every ASG member is written as its IPs. In a Terraform Environment, the IPv6 addresses of an ASG object's members are written as IPs also inside the ASG's VNet, because the Terraform association resource writes membership on IPv4 IP configurations only ([Grilling: Terraform mode workflow][t17], point 13).

4. **Partition.** Each side is cut into partitions, because Azure does not mix these kinds in one field ([Grilling: Priority assignment and rule packing][t13], point 8):
   - one prefix list, split into an IPv4 list and an IPv6 list;
   - one IP-fallback prefix list per ASG object, split the same way;
   - each service tag on its own;
   - ASG references in chunks of 10.
5. **Normalize.** Within a list the engine removes duplicates and prefixes contained in another prefix of the same list. `*` replaces the whole list. It does not join adjacent prefixes into supernets, so every prefix in an NSG rule comes from an Object.

A side without any partition gives no NSG rule. This is the case for an ASG object without ASG members.

### Step 4: The split

Per direction, a Rule becomes one NSG rule for each combination of **protocol group × source partition × destination partition**. A combination of an IPv4 list with an IPv6 list is skipped. The engine never merges NSG rules of several Rules, so every NSG rule belongs to exactly one Rule.

A protocol group is one protocol (`Tcp`, `Udp`, `Icmp`, `Esp`, `Ah`) with all its ports in one list. Overlapping and adjacent port ranges are merged. The Service object any, alone or in a list, makes one group with protocol `*` and ports `*`.

#### Example 1: Coverage of a host, a CIDR range and any

Prototype key `coverage`. Shows [ADR 0004](../adr/0004-place-rules-by-coverage.md) and [ADR 0016](../adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md). web and app are strict here, so their outbound side shows.

| # | Rule ID | Source | Destination | Service | Action |
|---|---|---|---|---|---|
| 1 | 1 | web01 (10.1.1.5) | Zone db | mssql | allow |
| 2 | 2 | spoke1-range (10.1.0.0/16) | Zone db | ssh | allow |
| 3 | 3 | any | Zone web | https | allow |

`nsg-spoke1-web`, outbound (strict):

| Priority | NSG rule | Access | Protocol | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| 1109 | `nsgfw-r1-out-bfda4830` | Allow | Tcp | 1433 | 10.1.1.5 | 10.1.3.0/24 |
| 2100 | `nsgfw-r2-out-bfda4830` | Allow | Tcp | 22 | 10.1.0.0/16 | 10.1.3.0/24 |
| 3090 | `nsgfw-r3-out-f4770e74` | Allow | Tcp | 443 | * | 10.1.1.0/24 |

`nsg-spoke1-web`, inbound:

| Priority | NSG rule | Access | Protocol | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| 2100 | `nsgfw-r3-in-f4770e74` | Allow | Tcp | 443 | * | 10.1.1.0/24 |

`nsg-spoke1-app`, outbound (strict):

| Priority | NSG rule | Access | Protocol | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| 1439 | `nsgfw-r2-out-bfda4830` | Allow | Tcp | 22 | 10.1.0.0/16 | 10.1.3.0/24 |
| 2760 | `nsgfw-r3-out-f4770e74` | Allow | Tcp | 443 | * | 10.1.1.0/24 |

`nsg-spoke1-db`, inbound:

| Priority | NSG rule | Access | Protocol | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| 1439 | `nsgfw-r1-in-bfda4830` | Allow | Tcp | 1433 | 10.1.1.5 | 10.1.3.0/24 |
| 2760 | `nsgfw-r2-in-bfda4830` | Allow | Tcp | 22 | 10.1.0.0/16 | 10.1.3.0/24 |

- Rule 1 lands outbound on web only, with the host as source. The host covers web, not app.
- Rule 2 covers web, app and db with its source. It lands outbound on web and app. On db, which is destination-enforced, the engine leaves it out ([Step 5](#step-5-nsg-rules-without-effect-on-a-destination-enforced-zone)).
- Rule 3 has any as source, so it lands outbound on every strict Zone, web itself included.
- The same Rule has different priorities in different NSGs.

The same placement explains why any is not the Internet (prototype key `internet`). "Zone web → Internet https" has a service tag as destination, covers no Zone there and lands only outbound on web: 1 NSG, 1 NSG rule. "Zone web → any https" covers every Zone with its destination. It lands inbound on web, app and db too (3 NSGs, 4 NSG rules) and opens web → app and web → db on 443.

#### Example 2: The split cross product

Prototype key `split`. Shows [ADR 0005](../adr/0005-stable-nsg-rule-identity.md) and [Grilling: Priority assignment and rule packing][t13], point 8.

| # | Rule ID | Source | Destination | Service | Action |
|---|---|---|---|---|---|
| 1 | 1 | onprem-clients (192.168.10.0/24), jumphost (172.16.9.9), AzureFrontDoor.Backend (service tag), web-servers (ASG object: vm-web1, vm-web2) | Zone db | https, tcp/8443, dns-udp | allow |

`nsg-spoke1-db`, inbound: 2 protocol groups × 3 source partitions × 1 destination partition.

| Priority | NSG rule | Access | Protocol | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| 2097 | `nsgfw-r1-in-bfda4830` | Allow | Tcp | 443, 8443 | 192.168.10.0/24, 172.16.9.9 | 10.1.3.0/24 |
| 2098 | `nsgfw-r1-in-2353925a` | Allow | Tcp | 443, 8443 | AzureFrontDoor.Backend | 10.1.3.0/24 |
| 2099 | `nsgfw-r1-in-b13b57e4` | Allow | Tcp | 443, 8443 | ASG asg-web-servers-spoke1 | 10.1.3.0/24 |
| 2100 | `nsgfw-r1-in-ed02de44` | Allow | Udp | 53 | 192.168.10.0/24, 172.16.9.9 | 10.1.3.0/24 |
| 2101 | `nsgfw-r1-in-ee508396` | Allow | Udp | 53 | AzureFrontDoor.Backend | 10.1.3.0/24 |
| 2102 | `nsgfw-r1-in-97567a00` | Allow | Udp | 53 | ASG asg-web-servers-spoke1 | 10.1.3.0/24 |

The six NSG rules take consecutive priorities. On web, which holds the ASG members, the two outbound NSG rules are left out, because web is destination-enforced.

#### Example 3: Own-side pruning and normalization

Prototype key `pruning`. Shows [Grilling: Priority assignment and rule packing][t13], points 9 and 10. Address group AppServers = Zone app, Zone api and host 10.1.2.5, which lies inside app. app and api are strict.

| # | Rule ID | Source | Destination | Service | Action |
|---|---|---|---|---|---|
| 1 | 1 | AppServers | Zone db | http, tcp/80-90, tcp/91 | allow |

| NSG | Direction | Priority | NSG rule | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| `nsg-spoke1-app` | outbound | 2100 | `nsgfw-r1-out-bfda4830` | 80-91 | 10.1.2.0/24 | 10.1.3.0/24 |
| `nsg-spoke2-api` | outbound | 2100 | `nsgfw-r1-out-bfda4830` | 80-91 | 10.2.1.0/24 | 10.1.3.0/24 |
| `nsg-spoke1-db` | inbound | 2100 | `nsgfw-r1-in-bfda4830` | 80-91 | 10.1.2.0/24, 10.2.1.0/24 | 10.1.3.0/24 |

On app the source is only app's prefix: api is pruned, and the host drops out because app's prefix contains it. On db the far side stays complete. The three services merge to one port range.

#### Example 4: Extra prefixes and a VNet binding

Prototype keys `aks` and `binding`. Shows [ADR 0017](../adr/0017-extra-prefixes-and-vnet-bindings.md).

Zone aks holds the nodes of an AKS cluster with Azure CNI Overlay. Its NSG sees pod addresses from 10.244.0.0/16, which belong to no subnet. db is strict. `aks-pods` is the CIDR object 10.244.0.0/16.

| # | Rule ID | Source | Destination | Service | Action |
|---|---|---|---|---|---|
| 1 | 1 | aks-pods | Zone aks | kubelet (tcp/10250) | deny |
| 2 | 2 | Zone aks | Zone db | postgres | allow |

| | Without Extra prefixes | With Extra prefix 10.244.0.0/16 on aks |
|---|---|---|
| Coverage of aks-pods | no Zone | aks |
| Intra-zone default of aks | 10.2.8.0/22 ↔ 10.2.8.0/22, so pod to pod traffic hits the Deny-all rules | 10.2.8.0/22, 10.244.0.0/16 ↔ the same list |
| Rule 1 inbound on aks | deny 10.244.0.0/16 → 10.2.8.0/22 | deny 10.244.0.0/16 → 10.2.8.0/22, 10.244.0.0/16 |
| Rule 2 inbound on db | allow 10.2.8.0/22 → 10.1.3.0/24 | allow 10.2.8.0/22, 10.244.0.0/16 → 10.1.3.0/24 |

VNet lab reuses the range of spoke1, and its Zone labapp has the prefix of app. `app-servers` is the CIDR object 10.1.2.0/24, and the Rule is "Zone web → app-servers ssh allow".

| | `app-servers` without VNet binding | bound to spoke1 |
|---|---|---|
| Coverage | app, labapp | app |
| `nsg-spoke1-app` inbound | `nsgfw-r1-in-bfda4830` allow 10.1.1.0/24 → 10.1.2.0/24 tcp/22 | the same |
| `nsg-lab-labapp` inbound | the same NSG rule, which lets 10.1.1.0/24 in. In lab that is the clients subnet, not Zone web. | no NSG rule |

The binding limits where the Rule lands. It does not change the prefix in the NSG rules: on every NSG where the Rule lands, the far side still carries 10.1.2.0/24.

### Step 5: NSG rules without effect on a destination-enforced Zone

The Egress posture of a Zone decides its outbound side ([ADR 0016](../adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md)). A strict Zone gets every outbound NSG rule. A destination-enforced Zone has an egress allow to the Internal address space below its Rules, and the engine leaves out the outbound NSG rules that change nothing. It walks the outbound NSG rules of the Zone from the bottom up:

1. A **deny** NSG rule is left out when its destination lies entirely inside Zones: the addresses of Zones cover it, and no subnet that is not a Zone overlaps it, in any VNet of the inventory. The same deny then lands inbound wherever the destination is.
2. An **allow** NSG rule is left out when its destination lies inside the Internal address space and no deny NSG rule that stays below it overlaps it. The egress allow lets that traffic out anyway.
3. Every other NSG rule stays.

The destination counts as known when it is a prefix list or ASG references, whose members' IPs the engine knows. A service tag is never known, so an NSG rule with a tag as destination always stays. Two NSG rules overlap when protocol, ports, source and destination all overlap, and a side with a tag counts as overlapping.

The second condition of case 1 matters where address spaces overlap. In the example estate, 10.1.4.0/24 is Zone billing in spoke1 and the clients subnet in lab, which is not a Zone. A deny to 10.1.4.0/24 lands inbound on billing only. If it were left out on the destination-enforced Zone labapp, labapp could reach the lab clients although the Rule base denies it, so the deny stays outbound ([Example 15](#example-15-the-constraint-merge) shows one). The price: where an unmanaged subnet reuses the prefix of a Zone, a deny to that prefix lands outbound on every Zone in its source Coverage.

The check runs per NSG rule, not per Rule. A Rule with the destinations "Zone db" and "Internet" keeps its NSG rule to the tag and loses the one to db.

#### Example 5: An allow that must stay, denies inside and outside Zones

Prototype keys `zone-zone` and `kept-allow`. Shows [ADR 0016](../adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md).

First the plain case: "Zone web → Zone db mssql allow".

| Egress posture of web | `nsg-spoke1-db` inbound | `nsg-spoke1-web` outbound | Cost of the Rule |
|---|---|---|---|
| destination-enforced | 2100 `nsgfw-r1-in-bfda4830` allow 10.1.1.0/24 → 10.1.3.0/24 tcp/1433 | left out; the egress allow at 4094 lets it out | 1 NSG, 1 NSG rule |
| strict | the same | 2100 `nsgfw-r1-out-bfda4830` allow 10.1.1.0/24 → 10.1.3.0/24 tcp/1433; no egress allow | 2 NSGs, 2 NSG rules |

Now three Rules, with web destination-enforced:

| # | Rule ID | Source | Destination | Service | Action |
|---|---|---|---|---|---|
| 1 | 1 | Zone web | Zone db | smb | allow |
| 2 | 2 | Zone web | Zone app | smb | deny |
| 3 | 3 | Zone web | net-10 (10.0.0.0/8) | smb | deny |

`nsg-spoke1-web`, outbound:

| Priority | NSG rule | Access | Protocol | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| 1439 | `nsgfw-r1-out-bfda4830` | Allow | Tcp | 445 | 10.1.1.0/24 | 10.1.3.0/24 |
| 2760 | `nsgfw-r3-out-bfda4830` | Deny | Tcp | 445 | 10.1.1.0/24 | 10.0.0.0/8 |

- Rule 3 stays: 10.0.0.0/8 reaches outside Zones, for example to on-premises, and no inbound NSG decides there.
- Rule 1 stays: the deny of Rule 3 below it overlaps it. Without Rule 1, web → db on 445 would hit that deny and never reach the egress allow.
- Rule 2 is left out: app lies inside Zones, and `nsg-spoke1-app` holds the deny inbound.

Inbound, the denies land on every Zone their destination covers:

| NSG | Priority | NSG rule | Access | Source | Destination |
|---|---|---|---|---|---|
| `nsg-spoke1-app` | 1439 | `nsgfw-r2-in-bfda4830` | Deny | 10.1.1.0/24 | 10.1.2.0/24 |
| `nsg-spoke1-app` | 2760 | `nsgfw-r3-in-bfda4830` | Deny | 10.1.1.0/24 | 10.0.0.0/8 |
| `nsg-spoke1-db` | 1439 | `nsgfw-r1-in-bfda4830` | Allow | 10.1.1.0/24 | 10.1.3.0/24 |
| `nsg-spoke1-db` | 2760 | `nsgfw-r3-in-bfda4830` | Deny | 10.1.1.0/24 | 10.0.0.0/8 |
| `nsg-spoke1-web` | 2100 | `nsgfw-r3-in-bfda4830` | Deny | 10.1.1.0/24 | 10.0.0.0/8 |

Rule 3 also lands inbound on web itself and closes smb inside web, above the Intra-zone default. The Rule base says so: 10.0.0.0/8 covers web.

### Step 6: The posture of every Managed NSG

Around the NSG rules from Rules, every Managed NSG gets fixed posture NSG rules. They belong to no Rule. The bands are the same in every Managed NSG and per direction ([Grilling: Priority assignment and rule packing][t13], point 2, as changed by [Grilling: Import and drift handling][t18] and [Prototype: Translation engine worked examples][t22]).

| Priorities | Block | NSG rules |
|---|---|---|
| 100–119 | Platform exceptions | 100 `nsgfw-platform-lb`: inbound allow from `AzureLoadBalancer`. 101 `nsgfw-platform-lb-v6`: inbound allow from fe80::1234:5678:9abc, on dual-stack Zones. The rest is reserved. |
| 120–4079 | Rules | 3,960 values per direction |
| 4080–4089 | Intra-zone default | 4080 `nsgfw-intrazone-<in\|out>-v4`, 4081 `…-v6`: allow from the Zone's prefixes and Extra prefixes to the same list, in both directions |
| 4090–4095 | Inherited defaults and egress allow | 4090 `nsgfw-inherit-in-vnet` and `nsgfw-inherit-out-vnet`: `VirtualNetwork` to `VirtualNetwork`. 4091 `nsgfw-inherit-out-internet`: `*` to `Internet`. 4094 `nsgfw-egress-internal-v4` and 4095 `nsgfw-egress-internal-v6`: outbound allow to the Internal address space, on destination-enforced Zones. |
| 4096 | Deny-all rules | `nsgfw-denyall-in`, `nsgfw-denyall-out`: deny `*` to `*` |
| 65000 and above | Azure default rules | read-only; never reached behind the Deny-all rules, except outbound on an Application Gateway v2 Zone |

Priorities are unique per direction, so inbound and outbound use the same numbers. [Task: Empirical checks of undocumented Azure behaviour][t24] confirmed this (T1).

Special cases:

- **Dual-stack Zone.** IPv4 and IPv6 never share an NSG rule, so a Rule with both families gives two NSG rules per protocol group. Whether Azure accepts both families in one NSG rule is a deferred check; if it does, a later engine version can write one ([Engine version](#engine-version)).
- **Application Gateway v2 Zone.** It has no outbound Deny-all rule and no egress allow, because Azure forbids NSG rules there that deny outbound connectivity. Below its Rules the Azure default rules decide outbound traffic. Rules land outbound as usual and nothing is left out, so the NSG is right if the setting is ever removed. The outbound deny to `VirtualNetwork` from [Grilling: Rule placement and default posture][t12], point 14, waits for a deferred check.
- **Retired NSG.** Platform exceptions and Deny-all rules only. It has no Rules, no Intra-zone default, no Inherited defaults and no egress allow. On an Application Gateway v2 subnet it keeps outbound open.
- **PostgreSQL flexible server Zone.** Only the IP fallback of Step 3 differs.

#### Example 6: Every block of one Managed NSG

Prototype key `bands`. Shows the bands, [ADR 0011](../adr/0011-import-preserves-behaviour.md) and [ADR 0016](../adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md). db is destination-enforced and has all three Inherited defaults, as after an Import.

| # | Rule ID | Source | Destination | Service | Action |
|---|---|---|---|---|---|
| 1 | 1 | any | Zone db | mssql | allow |
| 2 | 2 | Zone db | Storage.WestEurope (service tag) | https | allow |

`nsg-spoke1-db`, inbound:

| Priority | NSG rule | Access | Protocol | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| 100 | `nsgfw-platform-lb` | Allow | * | * | AzureLoadBalancer | * |
| 2100 | `nsgfw-r1-in-f4770e74` | Allow | Tcp | 1433 | * | 10.1.3.0/24 |
| 4080 | `nsgfw-intrazone-in-v4` | Allow | * | * | 10.1.3.0/24 | 10.1.3.0/24 |
| 4090 | `nsgfw-inherit-in-vnet` | Allow | * | * | VirtualNetwork | VirtualNetwork |
| 4096 | `nsgfw-denyall-in` | Deny | * | * | * | * |

`nsg-spoke1-db`, outbound:

| Priority | NSG rule | Access | Protocol | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| 2100 | `nsgfw-r2-out-e1c4caee` | Allow | Tcp | 443 | 10.1.3.0/24 | Storage.WestEurope |
| 4080 | `nsgfw-intrazone-out-v4` | Allow | * | * | 10.1.3.0/24 | 10.1.3.0/24 |
| 4090 | `nsgfw-inherit-out-vnet` | Allow | * | * | VirtualNetwork | VirtualNetwork |
| 4091 | `nsgfw-inherit-out-internet` | Allow | * | * | * | Internet |
| 4094 | `nsgfw-egress-internal-v4` | Allow | * | * | * | 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 |
| 4095 | `nsgfw-egress-internal-v6` | Allow | * | * | * | fc00::/7 |
| 4096 | `nsgfw-denyall-out` | Deny | * | * | * | * |

Rule 2 lands only outbound on db, because a service tag covers no Zone. Rule 1 also covers db with its source any; its outbound NSG rule is left out. A single NSG rule takes the middle of the Rules band.

### Step 7: NSG rule names

An NSG rule from a Rule is named `nsgfw-r<Rule ID>-<in|out>-<hash>` ([ADR 0005](../adr/0005-stable-nsg-rule-identity.md)). The hash has 8 hex characters and covers only the split key: the protocol, and the kind and identity of the partition on each side (IPv4 or IPv6 prefix list, the IP-fallback list of one ASG object, service tag name, ASG chunk). It does not cover prefixes, ports or the Rule's name. The description is `Rule <Rule ID>: <Rule name>`, cut to 140 characters. Posture NSG rules have the fixed names of Step 6.

The hash function is part of the engine. Changing it renames every NSG rule, so it is fixed with the first engine version. If two split keys of one Rule get the same hash, two NSG rules in one NSG would share a name, which Azure rejects. The engine reports that as a validation error that names the Rule.

#### Example 7: What keeps a name and what adds one

Prototype key `names`. Shows [ADR 0005](../adr/0005-stable-nsg-rule-identity.md). Rule 1042 is "Zone web → Zone db https allow". `nsg-spoke1-db`, inbound, over three Commits and a fourth Change set:

| Edit | NSG rules of Rule 1042 |
|---|---|
| Version 1 | 2100 `nsgfw-r1042-in-bfda4830`: Tcp 443, 10.1.1.0/24 → 10.1.3.0/24 |
| add tcp/8443 and onprem-clients to the Rule | 2100 `nsgfw-r1042-in-bfda4830`: Tcp 443, 8443, source 10.1.1.0/24, 192.168.10.0/24. Same name, changed content. |
| rename the Rule | the same NSG rule; only the description changes |
| add dns-udp and the AzureFrontDoor.Backend tag | 2100 stays. New: 2101 `nsgfw-r1042-in-2353925a` (Tcp, tag), 2102 `nsgfw-r1042-in-ed02de44` (Udp, prefixes), 2103 `nsgfw-r1042-in-ee508396` (Udp, tag) |

A new protocol or a new partition adds NSG rules with new names. They take the free numbers right next to their sibling.

### Step 8: Priorities

Priorities are assigned per Managed NSG and per direction, against the NSG rules stored with the last committed Version ([ADR 0005](../adr/0005-stable-nsg-rule-identity.md), [Grilling: Priority assignment and rule packing][t13], points 1 to 6).

1. **Order.** The NSG rules of the direction are listed in Rule base order. The NSG rules of one Rule stay together, in a fixed order. They share the action, so their order changes no verdict.
2. **Keep.** An NSG rule keeps its stored priority while its order relative to its neighbours holds. The prototype keeps the largest set of NSG rules whose stored priorities are still ascending in the new order, so moving one Rule renumbers only that Rule's NSG rules.
3. **Fill gaps.** A run of new or moved NSG rules goes into the gap between its kept neighbours, or between a neighbour and the edge of the band:
   - NSG rules of a Rule that already has NSG rules next to the gap take the free numbers right next to them.
   - The others are spread evenly: with `n` Rules in a gap between the priorities `lo` and `hi`, Rule `j` sits at `lo + j × (hi − lo) / (n + 1)`, rounded, with its block of NSG rules centred there. The edges of the band count as 119 and 4080, so one Rule in an empty band lands at 2100. On the first Commit this spreads the whole direction.
4. **Window rebalance.** When the gap has too few free numbers, the engine grows a priority range around the spot, doubling its radius, until the NSG rules inside fill at most half of it. It spreads only these NSG rules evenly over the range. The fill threshold is an engine parameter. This rule was settled in the prototype without a decision of its own ([Prototype: Translation engine worked examples][t22], resolution).

The Rules band cannot run full before the NSG rule limit of Step 9 is reached: it has 3,960 values per direction, against 1,994 NSG rules per NSG.

#### Example 8: Insert, move, disable and a window rebalance

Prototype keys `stable` and `window`. Shows [ADR 0005](../adr/0005-stable-nsg-rule-identity.md). Four Rules land inbound on db. Then Rule 5 is inserted between Rule 1 and Rule 2, Rule 4 is moved to the top, and Rule 2 is disabled, each in its own Commit.

| NSG rule in `nsg-spoke1-db`, inbound | Version 1 | Rule 5 inserted | Rule 4 moved to the top | Rule 2 disabled |
|---|---|---|---|---|
| `nsgfw-r1-in-bfda4830` | 911 | 911 | 911 | 911 |
| `nsgfw-r5-in-bfda4830` | | 1307 | 1307 | 1307 |
| `nsgfw-r2-in-bfda4830` | 1703 | 1703 | 1703 | removed |
| `nsgfw-r3-in-bfda4830` | 2496 | 2496 | 2496 | 2496 |
| `nsgfw-r4-in-f4770e74` | 3288 | 3288 | 515 | 515 |

Each edit changes one NSG rule. For the window rebalance, the stored NSG rules sit close together after many edits, and Rule 7 is inserted between Rule 3 and Rule 4, where no number is free:

| NSG rule | Stored | After the insert |
|---|---|---|
| `nsgfw-r1-in-bfda4830` | 500 | 500 |
| `nsgfw-r2-in-bfda4830` | 1000 | 998 |
| `nsgfw-r3-in-bfda4830` | 1001 | 1000 |
| `nsgfw-r7-in-bfda4830` (new) | | 1002 |
| `nsgfw-r4-in-f4770e74` | 1002 | 1003 |
| `nsgfw-r5-in-bfda4830` | 1003 | 1005 |
| `nsgfw-r6-in-bfda4830` | 3000 | 3000 |

The range grows from 1000–1003 over 999–1004 to 997–1006, where five NSG rules fill half of ten numbers. Rules 1 and 6 keep their priorities. The Preview shows one added NSG rule and groups the four renumbered ones.

### Step 9: Limits

The engine counts per Managed NSG, posture NSG rules included, and compares with the limits data file ([Grilling: Priority assignment and rule packing][t13], points 12 to 14; [Grilling: ASG model and NIC membership][t14], point 13). Ambiguous limits count conservatively until a nightly test settles them.

| Limit | Value | Counted as |
|---|---|---|
| NSG rules per NSG | 1,994 | 2,000 minus the six Azure default rules |
| Prefixes per side per NSG | 6,000 | summed over all NSG rules of the NSG, source and destination apart |
| ASGs per NSG | 100 | distinct ASGs referenced |
| ASGs per subscription and region | 3,000 | |
| ASGs per IP configuration | 20 | memberships in Unmanaged ASGs included |
| IP configurations per ASG | 4,000 | |
| ASG members per ASG that an NSG on a private endpoint subnet references | 50 | |
| NSGs per subscription and region | from the limits data file | checked at Zone onboarding |

A breach is a validation error that blocks the whole Change set. The message names the NSG, the limit, the count and the Rules with the most NSG rules there. From 90 % of a limit the Change set and the Zone overview show a warning. More than 10 ASGs on one side is no breach: Step 3 chunks them.

Prototype key `limits`: 1,800 Rules with one host each into db give 1,807 NSG rules of 1,994 (91 %) and a warning. 200 more Rules give 2,007 and block: "nsg-spoke1-db: 2007 NSG rules, limit 1994". One Rule with an Address group of 6,100 hosts gives 6,106 source prefixes against 6,000 and blocks too.

The engine also reports the cost of every Rule: "lands on N NSGs, M NSG rules".

### Step 10: Managed ASGs and membership

For every ASG object the engine derives one Managed ASG per VNet that holds ASG members of the object ([ADR 0006](../adr/0006-asg-objects-one-managed-asg-per-vnet.md)). A new Managed ASG gets its name from the Environment's ASG naming pattern and keeps it; an ASG adopted in place keeps its own name. For every network interface and private endpoint the engine derives the Managed ASGs it belongs to. A Managed ASG without ASG members is deleted once no NSG rule references it. The engine never writes the Unmanaged ASG of an External ASG object.

#### Example 9: An ASG object across two spokes

Prototype keys `asg-spokes` and `asg-pg`. Shows [ADR 0006](../adr/0006-asg-objects-one-managed-asg-per-vnet.md). ASG object web-servers has the members vm-web1 (Zone web, spoke1, 10.1.1.4) and vm-api1 (Zone api, spoke2, 10.2.1.4). api is strict. The Rule is "web-servers → Zone db mssql allow".

| NSG | Direction | Priority | NSG rule | Source | Destination |
|---|---|---|---|---|---|
| `nsg-spoke1-db` | inbound | 2099 | `nsgfw-r1-in-2252f95a` | 10.2.1.4 (IP fallback: the member in spoke2) | 10.1.3.0/24 |
| `nsg-spoke1-db` | inbound | 2100 | `nsgfw-r1-in-b13b57e4` | ASG asg-web-servers-spoke1 | 10.1.3.0/24 |
| `nsg-spoke2-api` | outbound | 2100 | `nsgfw-r1-out-b13b57e4` | ASG asg-web-servers-spoke2 | 10.1.3.0/24 |

Two Managed ASGs exist, one per VNet with members. On db, ASGs and member IPs never share a side, so the Rule gives two NSG rules. On web the outbound NSG rule is left out. With "web-servers → Zone pg postgres", the NSG of pg gets one NSG rule with the source 10.1.1.4, 10.2.1.4: a PostgreSQL flexible server Zone takes no ASGs, also not for the member in its own VNet.

## Evaluate: the Rule base evaluation function

The map asks for an evaluation function of the Rule base that the later packet tracer can reuse. The engine needs the same function now: for Import notes, Crossing flows and member steps.

**Input.** A flow: source address, destination address, protocol and destination port, plus for each end the Zone it lies in, or "outside every Zone". The Zone is part of the input, because the same address can lie in two Zones (overlapping address spaces, the same Extra prefix on two Zones).

**Verdict.** A flow passes up to two Managed NSGs: outbound on the source Zone and inbound on the destination Zone. The Rule base allows the flow when every side that exists allows it. A flow inside one Zone passes the same NSG twice, outbound and inbound. A flow between two addresses outside every Zone passes no Managed NSG, and the function has no verdict for it.

Each side is evaluated top-down, first match wins:

| Order | Inbound on the destination Zone | Outbound on the source Zone |
|---|---|---|
| 1 | Platform exceptions | |
| 2 | the Rules that land inbound on the Zone, in Rule base order | the Rules that land outbound on the Zone, in Rule base order, without what [Step 5](#step-5-nsg-rules-without-effect-on-a-destination-enforced-zone) leaves out |
| 3 | Intra-zone default | Intra-zone default |
| 4 | Inherited default: inbound from `VirtualNetwork` | Inherited defaults: outbound to `VirtualNetwork`, outbound to `Internet` |
| 5 | | Egress posture: destination-enforced allows the Internal address space |
| 6 | deny | deny; on an Application Gateway v2 Zone the Azure default rules |

This is the evaluation of the NSG rules that Translate generates, mapped back to Rules through the Rule ID in the name. It returns the verdict per side and the Rule or posture element that decides.

It is not one first-match pass over the Rule base, for three reasons:

- **Service tags cover no Zone.** "Internet → Zone B allow" lands only on B. For a source inside Zone A, A's outbound side never sees this Rule, and a later Rule or the Deny-all rule decides there. The two sides can be decided by different Rules.
- **A destination-enforced source has handed its decision to the destination.** Its outbound side allows internal traffic that a deny Rule closes inbound at the destination. The verdict of the flow is the same; the deciding side differs.
- **The posture differs per Zone:** Egress posture, Inherited defaults and the Application Gateway v2 exception.

Where no service tag and no overlapping address space is involved, the destination side is decided by the first Rule in the Rule base that matches the flow, as on one firewall ([ADR 0004](../adr/0004-place-rules-by-coverage.md)). A strict source Zone is decided by the same Rule.

**Service tags make the verdict three-valued.** The engine cannot read what a tag contains for an NSG. Where a tag decides, the function evaluates both cases, address inside the tag and outside, and returns "allow", "deny" or "depends on the tag", with the cases. It assumes only the documented facts of [ADR 0018](../adr/0018-write-order-from-dominance-gaps.md): the address spaces of the NSG's own VNet and of directly peered VNets are inside `VirtualNetwork` and outside `Internet`, and `AzureLoadBalancer` is the host's virtual IP 168.63.129.16, so no address of a Zone is inside it. Every other tag is evaluated both ways.

**Not evaluated:** Security layers (AVNM admin rules, NIC-level NSGs), routing, Azure Firewall, and whether the two ends can reach each other at all. The function answers what the Managed NSGs do.

## Preview and Affected Zones

**Preview.** The engine translates the Change set and compares the result with the NSG rules of the last Version, per NSG and by NSG rule name:

| Class | Meaning |
|---|---|
| added | the name is new |
| removed | the name is gone |
| changed | same name, other content |
| renumbered | same content, other priority; the Preview groups these ("12 NSG rules renumbered") |

The Preview also lists new, retired and deleted NSGs, subnet associations, Managed ASGs and membership changes, Rules without effect, the cost of every Rule, limit use, the write plan with its edges and steps, and the number of writes ([Grilling: Priority assignment and rule packing][t13], points 7 and 15).

**Affected Zones** come from the Rule base before and after the Change set, not from the Preview ([ADR 0008](../adr/0008-approval-by-affected-zones.md) as amended by [ADR 0016](../adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md)):

1. A Rule counts as changed when it was added, removed, edited or moved, or when an Object or Zone it uses changed what it covers. A Zone's Egress posture and Inherited defaults do not change what it covers.
2. For every changed Rule, before and after: every Zone in the Coverage of its destination, and from the Coverage of its source the Zones with a strict Egress posture, or all of them when the destination reaches outside Zones.
3. The Zones of added or removed ASG members.
4. The Zones the Change set onboards, removes or changes.
5. Every destination-enforced Zone, when the Internal address space changes.

#### Example 10: Affected Zones

Prototype key `affected`. Shows [ADR 0008](../adr/0008-approval-by-affected-zones.md) and [ADR 0016](../adr/0016-destination-enforced-egress-and-deny-rules-on-both-sides.md). web, app and db are destination-enforced, api is strict. The Change set adds three Rules.

| Rule | Affected Zones | Why |
|---|---|---|
| any → Zone db mssql allow | db, api | db is the destination. api is a strict source. web and app are sources too, but destination-enforced. |
| Zone web → Internet https allow | web | the destination reaches outside Zones, so the source counts |
| Zone app → Zone web https allow | web | only the destination |

A later Change set that sets app to strict affects only app, although two outbound NSG rules appear on its NSG and Rule 3 uses app.

## Plan: the write order

A Deployment plans from the Deployed state to the target ([ADR 0018](../adr/0018-write-order-from-dominance-gaps.md)). The plan is a set of writes and a set of edges "this write before that write".

**Writes.** One whole-NSG write for every Managed NSG or Retired NSG whose content differs, one write per new or deleted Managed ASG, one subnet write per new association or swap, and one or two writes per network interface or private endpoint whose membership changes, one per member step. A deleted network interface needs no write.

**Edges.**

1. **Dependencies.** A Managed ASG exists before a member joins it and before an NSG rule references it. An association follows its NSG. A Managed ASG is deleted after its last member has left and after no NSG rule references it.
2. **Crossing flows.** For every pair of Zones whose NSGs both change, the engine looks for a flow that one NSG denies in the Deployed state and allows in the target, while the other allows it in the Deployed state and denies it in the target. With a = "the source's outbound side allows" and b = "the destination's inbound side allows":

   | Deployed a | Target a | Deployed b | Target b | Edge |
   |---|---|---|---|---|
   | allow | deny | deny | allow | source NSG first |
   | deny | allow | allow | deny | destination NSG first |
   | any other combination | | | | none |

   Each side is evaluated with the function above. Where a tag decides, the engine evaluates both cases per NSG and takes the edges of all cases together.
3. **Member steps.** The engine plans membership as atoms: one IP configuration, or one private endpoint, joining or leaving one Managed ASG. Azure may apply the atoms of a step in any combination, inside one write and across parallel writes ([Task: Empirical checks of undocumented Azure behaviour][t24], T5). An atom that, applied alone to the Deployed members, only closes traffic under the Deployed NSG contents goes before every NSG write. Every other atom goes after every NSG write. A step is valid only if every combination of its atoms passes: before the NSG writes no combination allows a flow that the Deployed state denies, and after them no combination allows a flow that the target denies. For a flow, only the atoms of its two endpoints count. The atoms of one network interface in one step go into one write. The Crossing flows of point 2 are computed against the members as they are after the first step.

**Not orderable.** A cycle among the Crossing-flow edges, or a member step that fails in some combination of its atoms, fails validation. The Preview names the flows, and the fix is to split the Change set into two Commits.

**Order.** Writes without an edge between them run in any order, in parallel where the write budget allows. A write behind a Crossing-flow edge or behind a member-step boundary waits until the write before it has reported `Succeeded` and the Settle time (instance setting, 10 s by default) has passed. `Succeeded` alone is not enough: traffic that a write closed still passed up to 0.22 s after an NSG PUT and 0.75 s after a network interface write reported it (T4). Dependency edges wait for `Succeeded` only. A failed write is retried on its own. Only the writes with an edge from it wait, in later Deployments too, because every Deployment plans its edges from the Deployed state.

The plan assumes that one whole-NSG PUT takes effect as a whole (T2) and that a rejected PUT applies nothing (T3), as measured, and that one subnet write that swaps the NSG takes effect as a whole, which [Task: Empirical check of subnet NSG swaps and private endpoint ASG writes][t33] measures.

How the engine finds Crossing flows and runs the combination test at the design target is open in [Grilling: Server internals at the design target][t30]. The prototype tests one address per range segment and one port per port segment, for pairs of changed Zones only. When no deny NSG rule references the ASGs of a flow's atoms, the states before and after a step suffice.

#### Example 11: A Crossing flow, and a cycle

Prototype keys `crossing` and `cycle`. Shows [ADR 0018](../adr/0018-write-order-from-dominance-gaps.md). web and api are strict and sit in spokes that are not peered. Imported Rules with the `VirtualNetwork` tag land on one side only.

| | Rule | Lands on |
|---|---|---|
| Deployed state | Rule 1: Zone web → VirtualNetwork ssh allow | `nsg-spoke1-web` outbound, 2100 `nsgfw-r1-out-768a8319` |
| Target | Rule 2: VirtualNetwork → Zone api ssh allow (Rule 1 removed) | `nsg-spoke2-api` inbound, 2100 `nsgfw-r2-in-47ee7e59` |

The flow web → api on tcp/22, in the case that both tags contain the other spoke:

| State | web outbound | api inbound | Flow |
|---|---|---|---|
| Deployed state | allow (Rule 1) | deny (Deny-all rule) | closed |
| Target | deny (Deny-all rule) | allow (Rule 2) | closed |
| api written first | allow (still Rule 1) | allow (already Rule 2) | **open** |
| web written first | deny | deny | closed |

One edge: the NSG of web before the NSG of api. The engine cannot know whether the tags contain the other spoke. With a user-defined route to a hub firewall they do, because Azure adds the prefixes of user-defined routes to the tag. The engine takes the edge because one case needs it.

The cycle: the Change set also swaps "Zone api → VirtualNetwork rdp" for "VirtualNetwork → Zone web rdp". Now api → web on tcp/3389 crosses the other way, and the edges are web before api and api before web. Validation fails: "The write order has a cycle: NSG of Zone web → NSG of Zone api → NSG of Zone web", with both flows. Split into a Commit that removes Rules 1 and 2 and a Commit that adds the two new Rules, neither Deployment has an edge.

#### Example 12: A service tag evaluated both ways

Prototype key `tag-both`. Shows [ADR 0018](../adr/0018-write-order-from-dominance-gaps.md). api has the Inherited default "inbound from `VirtualNetwork`".

| | Deployed state | Target |
|---|---|---|
| web | destination-enforced | strict |
| Rule 1: Zone web → Zone api any deny | 2100 `nsgfw-r1-in-1dbabe7d` on api | removed |
| web → api closed by | the deny on api | the Deny-all rule on web |

Whether api lets web in after the change depends on whether api's `VirtualNetwork` tag contains spoke1. The engine evaluates both cases. In the case "contains", api opens and web closes, so the edge is: NSG of web before NSG of api. An engine that assumed "does not contain" would find no edge, and writing api first would open web → api.

#### Example 13: The three ASG member steps

Prototype key `members`. Shows [ADR 0018](../adr/0018-write-order-from-dominance-gaps.md) and [ADR 0006](../adr/0006-asg-objects-one-managed-asg-per-vnet.md). ASG objects admins (vm-web1) and batch (vm-web2) are allowed into db: Rule 1 "admins → Zone db rdp", Rule 2 "batch → Zone db mssql". The Change set removes vm-web1 from admins, adds vm-app1 to batch and adds Rule 3 "Zone web → Zone db https".

| Step | Write | Why there |
|---|---|---|
| 1 | vm-web1-nic leaves asg-admins-spoke1 | only closes under the Deployed NSG contents: rdp from 10.1.1.4 into db |
| 2 | NSG of db: `nsgfw-r1-in-b13b57e4` removed, 3420 `nsgfw-r3-in-bfda4830` added | |
| 3 | vm-app1-nic joins asg-batch-spoke1 | only opens under the target: mssql from 10.1.2.4 into db |
| 3 | delete Managed ASG asg-admins-spoke1 | its last member has left, and no NSG rule references it |

Rule 1 now has no effect, because admins is empty. Affected Zones: db (Rules 1, 2 and 3), web and app (their ASG members). Step 2 starts a Settle time after step 1 reports `Succeeded`, and step 3 a Settle time after step 2, so this Deployment waits 20 s by default.

Another Change set moves vm-web2 from batch to admins: two atoms. Leaving asg-batch-spoke1 alone only closes mssql, so it goes into the first step. Joining asg-admins-spoke1 opens rdp, so it goes into the last. In between the network interface is in neither ASG, which only closes. One write that held both atoms would have passed through "in both" or "in neither" in an order Azure picks.

If admins and batch were both denied into db above "Zone web → Zone db any allow", leaving batch first would open db to vm-web2 through that allow. Leaving opens and joining only closes, so the order turns around: vm-web2-nic joins asg-admins-spoke1 in the first step and leaves asg-batch-spoke1 in the last, and in between it is in both ASGs, which stays denied.

#### Example 14: The first Commit of an NSG adopted in place, and a failed write

Prototype keys `legacy` and `failed`. Shows [ADR 0011](../adr/0011-import-preserves-behaviour.md) and [ADR 0018](../adr/0018-write-order-from-dominance-gaps.md). db's existing NSG holds only the Azure default rules, so AllowVnetInBound lets the VNet in. The onboarding Change set adopts it in place, and the same Change set switches web from strict to destination-enforced. The legacy NSG is the Deployed state of db.

| db in the Change set | web → db in the Deployed state | in the target | Edge |
|---|---|---|---|
| opts out of Inherited defaults | closed by web's Deny-all rule; db's legacy NSG would let it in | web's egress allow lets it out; closed by db's Deny-all rule | NSG of db before NSG of web |
| keeps Inherited defaults (the Import default) | the same | db still lets the VNet in, so the flow opens, as the target says | none |

There is no interim content: the legacy NSG rules are replaced in one write.

A failed write: a Deployment writes the NSGs of web, api, app and db, with the edge "web before api" from Example 11. If the write of web fails, api waits, and app and db are written. If the write of db fails instead, nothing waits. If a newer Version is committed while web still has its old content, the new Deployment plans from the Deployed state and api still waits for web.

## Data contract

In a Terraform Environment the same target content goes into one JSON file per Terraform root module ([ADR 0010](../adr/0010-terraform-mode-data-contract-and-azure-observation.md)). The file is deterministic: the same target gives the same bytes. It holds:

- the data contract version and a revision value (the prototype also writes the engine version);
- every Managed NSG of the root module: resource group, location, `flushConnection`, marker tags and the complete list of NSG rules in the ARM shape, the same body as in ARM mode;
- the NSG of every Zone's subnet;
- the Managed ASGs with their marker tags, and the membership of every network interface and private endpoint;
- import entries for resources that already exist in Azure.

One NSG rule in the prototype's Data contract (prototype key `contract`):

```json
{
  "name": "nsgfw-r2-in-f4770e74",
  "properties": {
    "priority": 2099,
    "direction": "Inbound",
    "access": "Allow",
    "protocol": "Tcp",
    "sourcePortRange": "*",
    "sourceAddressPrefix": "*",
    "destinationAddressPrefix": "10.3.1.0/24",
    "destinationPortRange": "443",
    "description": "Rule 2: any to dual"
  }
}
```

**Steps.** A Deployment without Crossing-flow edges and member steps is one pull request. Otherwise each step of the write order is its own pull request, and the tool opens the next one after Azure shows the previous target. Every pull request carries the whole Data contract of the root module: the resources of later steps still have their Deployed content (prototype key `pr-steps`: first the NSG of dual, which closes, then the NSG of dual2, which opens). Deleting Managed ASGs rides in the last pull request.

Inside one pull request, Terraform's own graph orders the writes. The Data contract names an ASG by its resource ID, so Terraform sees no dependency from an NSG to a Managed ASG on its own. The default HCL therefore lets the NSG resource depend on the Managed ASG resources, and every replacement HCL must keep that: a Managed ASG is created before an NSG rule references it and destroyed only after ([ADR 0010](../adr/0010-terraform-mode-data-contract-and-azure-observation.md)).

The field names of the file are not fixed yet. The prototype and the HCL sketch in the [architecture draft](architecture.md#deployment) use different ones.

## Import

Import runs in the onboarding Change set and turns each NSG rule of the existing NSG into one Rule ([ADR 0011](../adr/0011-import-preserves-behaviour.md), [Grilling: Import and drift handling][t18]).

**Mapping.** For the NSG of Zone X:

| Side | NSG rule value | Becomes |
|---|---|---|
| own side | `*` or a prefix that contains X | Zone X |
| own side | a prefix inside X | a CIDR or single IP object |
| own side | a prefix disjoint from X | dropped, with an info Import note |
| far side | `*` | any |
| far side | a service tag | the tag; `VirtualNetwork` gets a warning Import note |
| far side | a prefix | by exact match, in this order: a Zone in the same or a peered VNet, an existing Address object with this value, a subnet Address object, a VNet object, a new CIDR or single IP object |
| far side | an ASG | an External ASG object, or an ASG object if the admin adopts the ASG in place |

A new single IP or CIDR object whose prefix also matches Zones in VNets that X is not connected to gets a VNet binding to X's VNet and its peered VNets, with an info Import note. Protocol and ports become Service objects; protocol `*` with ports is approximated as tcp and udp, with a warning. A custom deny-all and an `AzureLoadBalancer` allow are dropped as redundant with the posture (info). A deny from `AzureLoadBalancer` has no effect below the Platform exceptions (warning). The prototype also maps `VirtualNetwork` on the own side to Zone X; the ticket decided only prefixes there.

**Inherited defaults.** Import sets each flag whose Azure default rule took effect: a flag is not set when a custom NSG rule above the default matches everything the default matches. A subnet without an NSG gets all three.

**Constraint merge.** The imported Rules are placed in the Rule base by constraints:

1. Each imported NSG and direction is a policy and keeps its order.
2. The existing Rule base is one more policy and keeps its order.
3. Where two Rules of different policies overlap and have different actions, the deny comes first. A service tag counts as overlapping.
4. If the constraints form a cycle, the engine moves a deny above an allow of its own imported policy. That only closes flows, and a warning Import note lists them.
5. Among the orders that fit, existing Rules stay as early as possible and imported Rules go as low as their constraints allow. Any fitting order gives the same verdicts.

The tool recomputes this placement on every Rebase until someone moves an imported Rule by hand.

**Import notes for changed flows.** The engine compares the new NSG of X with the old one, with the evaluation function, and lists the flows whose verdict changes: opening as warning, closing as info.

**Merge proposal.** Imported Rules of different NSGs that differ only in their own Zone can be merged into one Rule with several Zones when that breaks no order constraint. The Change set proposes it ([Grilling: Review round on placement, egress posture and MVP shape][t27], point 17).

#### Example 15: The constraint merge

Prototype key `merge`. Shows [ADR 0011](../adr/0011-import-preserves-behaviour.md). Zone billing is onboarded in place. The Rule base has three Rules:

| # | Rule ID | Name | Source | Destination | Service | Action |
|---|---|---|---|---|---|---|
| 1 | 1 | no telnet | any | net-10 | telnet | deny |
| 2 | 2 | web to anything https | Zone web | any | https | allow |
| 3 | 3 | spoke1 sql to db | spoke1-range | Zone db | mssql | allow |

The legacy NSG `nsg-billing`:

| Direction | Priority | Name | Access | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| inbound | 100 | allow-web-https | Allow | tcp/443 | 10.1.1.0/24 | * |
| inbound | 200 | deny-spoke1-https | Deny | tcp/443 | 10.1.0.0/16 | * |
| inbound | 300 | allow-onprem-rdp | Allow | tcp/3389 | 192.168.10.0/24 | * |
| outbound | 100 | billing-to-db | Allow | tcp/1433 | * | 10.1.3.0/24 |
| outbound | 110 | deny-internet | Deny | any | * | Internet |

Constraints: 100 before 101 before 102 (inbound order), 103 before 104 (outbound order), 1 before 2 before 3 (Rule base), Rule 101 before Rule 2 (deny first: both match web → billing on 443), Rule 104 before Rule 3 (deny first: the tag counts as overlapping). The Rule base after Import:

| # | Rule ID | Name | Source | Destination | Service | Action | From |
|---|---|---|---|---|---|---|---|
| 1 | 1 | no telnet | any | net-10 | telnet | deny | |
| 2 | 100 | allow-web-https | Zone web | Zone billing | https | allow | inbound 100 |
| 3 | 101 | deny-spoke1-https | spoke1-range | Zone billing | https | deny | inbound 200 |
| 4 | 2 | web to anything https | Zone web | any | https | allow | |
| 5 | 103 | billing-to-db | Zone billing | Zone db | mssql | allow | outbound 100 |
| 6 | 104 | deny-internet | Zone billing | Internet | any | deny | outbound 110 |
| 7 | 3 | spoke1 sql to db | spoke1-range | Zone db | mssql | allow | |
| 8 | 102 | allow-onprem-rdp | onprem-clients | Zone billing | rdp | allow | inbound 300 |

`nsg-billing` after the first Commit, without the posture NSG rules at 100, 4080, 4094 to 4096:

| Direction | Priority | NSG rule | Access | Ports | Source | Destination |
|---|---|---|---|---|---|---|
| inbound | 779 | `nsgfw-r1-in-f4770e74` | Deny | 23 | * | 10.0.0.0/8 |
| inbound | 1439 | `nsgfw-r100-in-bfda4830` | Allow | 443 | 10.1.1.0/24 | 10.1.4.0/24 |
| inbound | 2100 | `nsgfw-r101-in-bfda4830` | Deny | 443 | 10.1.0.0/16 | 10.1.4.0/24 |
| inbound | 2760 | `nsgfw-r2-in-74c6eca4` | Allow | 443 | 10.1.1.0/24 | * |
| inbound | 3420 | `nsgfw-r102-in-bfda4830` | Allow | 3389 | 192.168.10.0/24 | 10.1.4.0/24 |
| inbound | 4090 | `nsgfw-inherit-in-vnet` | Allow | * | VirtualNetwork | VirtualNetwork |
| outbound | 911 | `nsgfw-r1-out-f4770e74` | Deny | 23 | * | 10.0.0.0/8 |
| outbound | 1703 | `nsgfw-r101-out-bfda4830` | Deny | 443 | 10.1.0.0/16 | 10.1.4.0/24 |
| outbound | 2496 | `nsgfw-r103-out-bfda4830` | Allow | 1433 | 10.1.4.0/24 | 10.1.3.0/24 |
| outbound | 3288 | `nsgfw-r104-out-756db418` | Deny | * | 10.1.4.0/24 | Internet |
| outbound | 4090 | `nsgfw-inherit-out-vnet` | Allow | * | VirtualNetwork | VirtualNetwork |

- Inherited defaults: inbound from `VirtualNetwork` and outbound to `VirtualNetwork` are set. Outbound to `Internet` is not, because deny-internet matched everything the Azure default rule matched.
- Rule 101 stays outbound on billing, web and db, the Zones its source covers: 10.1.4.0/24 is also the clients subnet of lab, which is not a Zone, so its destination does not lie entirely inside Zones ([Step 5](#step-5-nsg-rules-without-effect-on-a-destination-enforced-zone)). On web the allow of Rule 100 stays above it at 1879, because that deny overlaps it.
- Rule 103 stays outbound on billing, because the deny of Rule 104 below it has a tag as destination, which counts as overlapping.
- Existing Rules now apply to billing: Rule 1 closes telnet into billing (info Import note).
- billing starts destination-enforced, so outbound traffic to Internal addresses outside its old `VirtualNetwork` tag opens (warning Import note, accepted in ADR 0011).
- The Deployment writes the NSGs of billing, db (Rule 103 lands inbound there) and web, with no edge. Affected Zones: billing, db and web.

A cycle (prototype key `cycle-break`): the Rule base has "spoke1-range → any tcp/8080 allow" above "any → any tcp/8000-8100 deny". The legacy NSG of billing has "allow 10.1.2.0/24 on 8080" above "deny 10.1.0.0/16 on 8000-8100". Four constraints form a cycle: the imported allow before the imported deny (NSG order), the imported deny before the existing allow (deny first), the existing allow before the existing deny (Rule base order), and the existing deny before the imported allow (deny first). The engine moves the imported deny above the imported allow. app → billing on 8080, which the legacy NSG allowed, now closes, and a warning Import note says so.

## Order conflicts at Rebase

A Rebase conflicts when both sides changed the same Rule, Object or Zone ([ADR 0007](../adr/0007-isolated-change-sets-with-optimistic-rebase.md)). For a Rule that the Change set inserted or moved, the engine adds one check: the Rebase conflicts when the latest Version changed the order between that Rule and an overlapping Rule with the other action. Two Rules overlap when their sources, destinations and services overlap; a service tag counts as overlapping.

Prototype key `rebase`: a Change set on Version 5 inserts Rule 9 "app10 → Zone db ssh allow" between Rule 2 and Rule 3. If Version 6 moved the deny Rule 1 "Zone app → Zone db ssh" from above Rule 9's place to below it, the Rebase conflicts and an Author confirms the position. If Version 6 moved the allow Rule 4 "onprem-clients → Zone db ssh" to the top, the Rebase is clean and the Approvals stay.

## Engine version

Every output carries the engine version, and every Version stores the one that produced its NSG rules ([Grilling: Review round on placement, egress posture and MVP shape][t27], point 20). When a new engine version translates an unchanged Rule base differently, the tool prepares a Change set "re-translation" with the usual Preview, instead of changing NSGs with the next Commit. Prototype key `engine-version`: an engine that writes IPv4 and IPv6 in one NSG rule changes the NSGs of dual and dual2 and nothing in the Rule base. What the next unrelated Commit does while that Change set is open is with [Grilling: Operations: restore, exit, upgrades and exposure][t29].

The hash function of Step 7, the fill threshold of Step 8 and the address-family split of Step 3 change output, so a change to any of them is a new engine version.

## Where the prototype differs

The prototype is a reference for behaviour, with these known shortcuts:

- It finds Crossing flows by testing sample addresses and ports. That does not scale to the design target ([Grilling: Server internals at the design target][t30]).
- It puts the deletion of a Managed ASG into the first pull request step. The decided rule is the last pull request ([ADR 0010](../adr/0010-terraform-mode-data-contract-and-azure-observation.md)).
- It models network interfaces only, no private endpoints.
- Its Data contract field names, NSG names and resource groups are placeholders.
- It checks the member steps with one ASG object per network interface, classifies each network interface's change as a whole with the other network interfaces at their Deployed or target members, and splits a change only as leave first, join last. The decided rule plans single atoms by their own effect and tests every combination of a step's atoms ([ADR 0018](../adr/0018-write-order-from-dominance-gaps.md)). The difference matters only with deny Rules on ASG objects or with several ASG objects per network interface.
- Its `engine.js` carries three of the four decisions from the status line, since the commit that came with this document: the name hash of 8 characters, the stricter test for a deny that is left out, and `AzureLoadBalancer` as the documented address. The fourth, the HCL rule, has no counterpart in the prototype.

## Open points

- Whether one subnet write that swaps the NSG takes effect as a whole, and the lag and ASG swaps of private endpoint writes: [Task: Empirical check of subnet NSG swaps and private endpoint ASG writes][t33]. The write order and the member steps themselves were decided in [Grilling: Write order under data-plane lag and split ASG membership writes][t32].
- How the engine finds Crossing flows and runs the combination test of the member steps at the design target, where the Preview runs, where the Azure inventory is stored, and the package placement of the Import mapping and the Data contract generator: [Grilling: Server internals at the design target][t30].
- An engine upgrade with an open re-translation Change set: [Grilling: Operations: restore, exit, upgrades and exposure][t29].
- Deferred checks that can change engine output, each with a nightly integration test and the conservative default described here ([Task: Empirical checks of undocumented Azure behaviour][t24]): IPv4 and IPv6 prefixes in one NSG rule, a service tag inside a prefix list, an ASG on one side with prefixes on the other, the count of prefixes per NSG rule or per NSG, whether the Azure default rules count against 2,000, an outbound deny on an Application Gateway v2 subnet, and ASG membership on IPv6 IP configurations.
- The field names of the Data contract and the data contract version 1: with the Terraform stage of the increment plan.

[t12]: https://github.com/mfgAkilae/nsgfw/issues/12
[t13]: https://github.com/mfgAkilae/nsgfw/issues/13
[t14]: https://github.com/mfgAkilae/nsgfw/issues/14
[t17]: https://github.com/mfgAkilae/nsgfw/issues/17
[t18]: https://github.com/mfgAkilae/nsgfw/issues/18
[t22]: https://github.com/mfgAkilae/nsgfw/issues/22
[t24]: https://github.com/mfgAkilae/nsgfw/issues/24
[t27]: https://github.com/mfgAkilae/nsgfw/issues/27
[t29]: https://github.com/mfgAkilae/nsgfw/issues/29
[t30]: https://github.com/mfgAkilae/nsgfw/issues/30
[t31]: https://github.com/mfgAkilae/nsgfw/issues/31
[t32]: https://github.com/mfgAkilae/nsgfw/issues/32
[t33]: https://github.com/mfgAkilae/nsgfw/issues/33
[proto]: https://github.com/mfgAkilae/nsgfw/tree/prototype/translation-engine-worked-examples/prototypes/translation-engine-worked-examples
