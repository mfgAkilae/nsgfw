# Empirical checks of undocumented Azure behaviour

Ticket: [Task: Empirical checks of undocumented Azure behaviour](https://github.com/mfgAkilae/nsgfw/issues/24). Run on 2026-11-10 in a dedicated test subscription, region North Europe.

T7 and T8 come from [Task: Empirical check of subnet NSG swaps and private endpoint ASG writes](https://github.com/mfgAkilae/nsgfw/issues/33), which [Grilling: Write order under data-plane lag and split ASG membership writes](https://github.com/mfgAkilae/nsgfw/issues/32) opened. They ran on 2026-11-10 in the same subscription and region, with the same harness.

T10 comes from [Task: Empirical check of ASGs on dual-stack network interfaces](https://github.com/mfgAkilae/nsgfw/issues/41), which [Grilling: ASG membership of private endpoints and multi-IP network interfaces](https://github.com/mfgAkilae/nsgfw/issues/39) opened. It ran on 2026-11-10 in the same subscription and region, with its own script.

## Question

Which Azure behaviours that Microsoft documentation leaves open does the design depend on, and what does a dedicated test subscription show for them?

## Scope (decided with the map owner on 2026-11-10)

The ticket collects about 60 open points from eight research tickets and seven grilling tickets. Almost all of them already have a conservative default in the design. A positive result could only enable behaviour that also runs as a nightly integration test and has a fallback (map Notes, "Documentation before tests"). Checking them now would not change the design package.

Only the write order (then ADR 0018, now [ADR 0023](../adr/0023-writes-are-ordered-only-by-crossing-flows-with-a-settle-time.md)) has no fallback. Its guarantee assumes four things. These are the design-deciding checks, run now:

| Check | Question | Source |
|---|---|---|
| T1 | Is priority uniqueness per direction or per NSG? Can one NSG PUT swap, rotate or shift priorities? What does a colliding child-rule PUT return? | NSG/ASG research U3, ARM research U3 |
| T2 | Does one whole-NSG PUT take effect as a whole on the data plane, or rule by rule? | ARM research U2 |
| T3 | Does a failed NSG PUT apply nothing? | ARM research U2 |
| T4 | Is a change in effect on the data plane once the long-running operation reports `Succeeded`? (measured inside T2 and T5) | NSG/ASG research U15 |
| T5 | Does one network interface PUT that changes ASG membership take effect as a whole, on the source and the destination side? | [Grilling: Review round on placement, egress posture and MVP shape](https://github.com/mfgAkilae/nsgfw/issues/27) |
| T6 | Does MSAL Node redeem an authorization code with a user-assigned managed identity token as client assertion in Container Apps? | [ADR 0013](../adr/0013-backend-sign-in-and-separate-directory-and-azure-principals.md) ("verify before the increment plan") |
| T7 | Does one subnet PUT that swaps the subnet's NSG for another take effect as a whole, on the source and the destination side, or is the subnet briefly without an NSG? How long after `Succeeded`? | [ADR 0003](../adr/0003-adopt-existing-nsgs-in-place.md) (a shared NSG is swapped), [ADR 0023](../adr/0023-writes-are-ordered-only-by-crossing-flows-with-a-settle-time.md) |
| T8 | How does one private endpoint PUT that swaps its ASG behave: interim states, and the lag after `Succeeded` against the Settle time? | [ADR 0024](../adr/0024-asg-membership-is-written-as-atoms-in-member-steps.md) (when the check ran, private endpoints were atoms like network interfaces; they no longer are) |
| T9 | Which rights does a private endpoint PUT need that changes only its ASGs? Added when T8's first write failed. | [ADR 0014](../adr/0014-operator-grants-azure-roles-tool-verifies.md) (`nsgfw ASG Writer`) |
| T10 | Does Azure accept ASGs on the IPv6 IP configuration of a dual-stack network interface, and must they match the IPv4 ones? What does the azurerm association write there? | [ADR 0006](../adr/0006-asg-objects-one-managed-asg-per-vnet.md), [ADR 0024](../adr/0024-asg-membership-is-written-as-atoms-in-member-steps.md), [Grilling: Terraform mode workflow](https://github.com/mfgAkilae/nsgfw/issues/17) point 13 |

Every other point moves to the backlog as a nightly integration test. The design keeps its current default until then (see [Deferred checks](#deferred-checks-nightly-integration-tests)).

## Checklist for the human

What the map owner provided or should provide:

- [x] A dedicated test subscription with no production workloads and no deny policies on networking. The brief requires one for integration tests.
- [x] A service principal with Owner on that subscription only: `az ad sp create-for-rbac --name nsgfw-empirical-checks --role Owner --scopes /subscriptions/<test-subscription>`. The agent needs Owner because the prober VM gets a role assignment on its own resource group. The credential stays outside the repo.
- [ ] Recommended: a cost budget with an alert on the test subscription.
- [x] After the checks the map owner deleted the service principal, its Owner role assignment and its app registration (2026-11-10). The nightly integration tests need a new principal.
- [x] T6: the app registration `nsgfw-t6-msal-check` and one interactive sign-in, both done with [t6-register.sh](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/t6-register.sh) (steps in [T6](#t6-msal-node-with-a-managed-identity-as-federated-credential)).
- [x] After T6 the map owner deleted the app registration `nsgfw-t6-msal-check` and its service principal.
- [x] T7 and T8: the map owner created a new service principal `nsgfw-empirical-checks` with Owner on the test subscription only (same command as above) and handed its credential to the agent through a one-time secret prompt. It never touched the repo or the disk of the run.
- [x] T10: the map owner handed over the same principal's credential again through a one-time secret prompt.
- [ ] After T7 to T10: the map owner decides whether this principal stays for the nightly integration tests or is deleted with its Owner role assignment.

The test subscription does not accept new resources in West Europe: "The selected region is currently not accepting new customers" (`RequestDisallowedByAzure`). The checks use North Europe, plus Sweden Central for one resource in another region. The subscription has a quota of 0 cores for the Basv2 family and 10 for the BS family per region, so the VMs are `Standard_B1s`.

## Cost

Retail list prices in EUR from the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices), retrieved 2026-11-10. Billing rules from the pricing pages, retrieved 2026-11-10.

| Resource | Price | Billing rule |
|---|---|---|
| VM `Standard_B1s`, Linux, North Europe | 0.0101 €/h (`Standard_B2ats_v2`: 0.0092 €/h, but the subscription has no Basv2 quota) | "We charge for the number of full minutes your virtual machine is running" ([Linux VM pricing](https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/)) |
| OS disk Standard SSD E4 | 2.15 €/month | "billed on an hourly basis" ([Managed disks pricing](https://azure.microsoft.com/en-us/pricing/details/managed-disks/)); the disk keeps billing while the VM is deallocated |
| Standard public IPv4 (prober only, for its ARM calls) | 0.0045 €/h | |
| Storage account (results only, a few KB) | negligible | |
| Private endpoint (T8) | 0.009 €/h, data processed 0.009 €/GB in and out | Meter "Standard Private Endpoint" of "Virtual Network Private Link". The TCP probes move a few tens of MB. |
| VNet, NSG, ASG, NIC, user-assigned identity, Run Command | no meter | The price API returns no meter for Run Command. |
| Azure Bastion: not used | Basic 0.1706 €/h, Standard 0.2603 €/h, Premium 0.4040 €/h, Developer free | "billed hourly from the moment the resource is deployed until the resource is deleted, regardless of outbound data usage" ([Bastion pricing](https://azure.microsoft.com/en-us/pricing/details/azure-bastion/)). Neither page says whether a partial hour counts as a full hour. |
| Container Apps, Consumption (T6) | free grant: 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests "per subscription per month" ([Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing)) | The management meter "applies to the Dedicated plan, private endpoint, and planned maintenance". T6 uses none of them. |

One run of T1 to T5 keeps three VMs and one public IP for about one hour, so it costs about 0.05 €. Resources left behind after a failed teardown cost about 32 € per month, with the private endpoint about 38 €. The script deletes the resource group in a `finally` block, the group carries an `expiresOn` tag, and after the teardown the script lists every resource group in the subscription that still carries the checks' `purpose` tag.

## Setup

[run.py](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/run.py) runs on the agent's machine and uses only the Python standard library. It creates `rg-nsgfw-checks-<timestamp>`, deploys an ARM template that the script builds itself, starts [checker.py](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/checker.py) on `vm-a` through Run Command, waits for the results in the storage account, downloads them, and deletes the resource group. Before saving, it replaces every subscription, tenant and principal ID with `<redacted>`.

```
vnet-checks 10.90.0.0/16
├─ src 10.90.1.0/24, nsg-src (no custom rules)
│   └─ vm-a 10.90.1.10 and 10.90.1.11 (second IP configuration, for T8): prober and controller,
│      user-assigned identity with Network Contributor on the resource group, public IP for
│      outbound ARM calls (no inbound rule allows anything)
├─ dst 10.90.2.0/24, nsg-dst (the NSG under test)
│   ├─ vm-b 10.90.2.10: TCP listeners on 5001–5006
│   └─ vm-c 10.90.2.11: TCP listeners on 5001–5006
└─ pe 10.90.3.0/24, nsg-pe, privateEndpointNetworkPolicies Enabled (T8)
    └─ pe-blob 10.90.3.10: private endpoint to the blob service of storage account stpe…
       (public network access off), in asg-pe1 at deployment
nsg-scratch: not associated, for T1
nsg-swap-a, nsg-swap-b: not associated at deployment, for T7
asg-x, asg-y, asg-d1, asg-d2, asg-pe1, asg-pe2 (North Europe), asg-other (Sweden Central)
```

`vm-a` does everything that needs a timestamp: the ARM writes, the polling of the async operation every 0.25 s, and the TCP probes. All times therefore come from one clock. The prober runs four staggered workers per target and port. Each worker opens a new TCP connection every 80 ms (one probe every 20 ms per pair) with a 100 ms timeout, and closes with RST. A dropped SYN, which is what an NSG deny looks like, counts as closed. Every probe is a new flow, so `flushConnection` (off) does not matter.

`nsg-dst` always ends with `deny-probe-ports` (priority 4000, deny TCP 5001–5006 from any). Its other rules depend on the check.

## Results

Two runs on 2026-11-10, both in North Europe on `Standard_B1s`: a full run (T1, T2, T3, T5 with 10 swaps per side) and a second run of T5 with 20 swaps per side and a per-probe state log. Raw results: [run 1](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-011057-results.json) ([log](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-011057-checker.log)), [run 2](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-012017-results.json) ([log](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-012017-checker.log)). A full run takes 12 minutes from resource group creation to deletion.

Three more runs on 2026-11-10 for T7 to T9, same region and VM size, 30 swaps per series. The first stopped at deployment: Azure rejected `nic-a` because its two IP configurations referenced different ASGs (see [ASG membership is per network interface](#asg-membership-is-per-network-interface)). Run 3 measured T7 and stopped T8 at its first private endpoint write, which led to T9. Run 4 measured T9 and T8 ([results](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-085103-results.json), [log](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-085103-checker.log)). The three runs kept resources for 4, 10 and 18 minutes, about 0.03 € in all. Every resource group is deleted; after each teardown the script found no resource group with the checks' tag left in the subscription.

**Measurement limits.** Probes start every 20 ms per target and port. A probe that starts just before a port opens waits for its 100 ms timeout, so the opening of a port is seen up to about 0.12 s late. A "both closed" gap below about 0.15 s is therefore indistinguishable from a clean switch. A "both open" window is measured to about 20 ms, because a connected probe is never late. Times "relative to Succeeded" use the first poll that returned `Succeeded`. The poll runs every 0.25 s, so the real end of the operation lies up to 0.25 s earlier. No check can prove atomicity. It can only find, or fail to find, a counterexample at this resolution. One region, one VM size, two runs.

### T1: priorities are unique per direction, and one PUT can renumber freely

| Attempt on `nsg-scratch` | Result |
|---|---|
| Inbound and outbound rule, both priority 100, one PUT | 200, `Succeeded`; both rules exist |
| Two inbound rules with priority 100, one PUT | 400 `SecurityRuleConflict`: "Rules cannot have the same Priority and Direction"; NSG unchanged |
| Swap two priorities (100 and 101) in one PUT | 200, `Succeeded` |
| Rotate three priorities in one PUT | 200, `Succeeded` |
| Shift three rules up by one (100–102 to 101–103) in one PUT | 200, `Succeeded` |
| Child-rule PUT that takes another inbound rule's priority | 400 `SecurityRuleConflict`; NSG unchanged |
| Child-rule PUT outbound with the priority of an inbound rule | 201, `Succeeded` |

Uniqueness is per direction, as Azure's error text says (NSG/ASG U3, ARM U3). Every collision is rejected synchronously, so a whole-NSG PUT validates the target list as a whole.

### T2: one NSG PUT took effect as a whole

`nsg-dst` swapped between "only 5001 open" and "only 5002 open" in one whole-NSG PUT. The opening rule came first in the array and the deny rule last.

| Series | Swaps | Observations (2 targets) | Both ports open | Longest "both closed" | LRO duration |
|---|---|---|---|---|---|
| 3 rules | 20 | 40 | 0 | 0.15 s (5 above 0.1 s) | 0.47–0.93 s |
| 302 rules (300 fillers) | 10 | 20 | 0 | 0.12 s (2 above 0.1 s) | 1.04–1.31 s |

No observation showed both ports open, on either host. The longest "both closed" gaps lie within the opening-detection limit. At this resolution, one NSG PUT switched from the old to the new rule set as a whole (ARM U2).

### T3: a rejected NSG PUT applied nothing

From "only 5001 open", each PUT sent "only 5002 open" plus one defect. A partial apply would have opened 5002.

| Defect | Response | NSG after 20 s | 5002 opened |
|---|---|---|---|
| Duplicate priority | 400 `SecurityRuleConflict` | unchanged, `Succeeded` | no |
| Invalid prefix `10.90.300.0/24` | 400 `SecurityRuleInvalidAddressPrefix` | unchanged, `Succeeded` | no |
| Reference to a missing ASG | 400 `InvalidResourceReference` | unchanged, `Succeeded` | no |
| ASG in another region (Sweden Central) | 400 `InvalidResourceReference` | unchanged, `Succeeded` | no |
| 2,002 rules | 400 `SecurityRuleCountLimitReached`: "A security group cannot have more than 2000 security rules." | unchanged, `Succeeded` | no |

Every defect was rejected synchronously, before an async operation started. No case produced an accepted PUT that ended `Failed`, so that path stays untested. The design keeps handling it as documented.

### T4: `Succeeded` is not a data-plane barrier

| Write | New state in effect, relative to the observed `Succeeded` | Old allow still connected, at most |
|---|---|---|
| NSG PUT (T2, 60 observations) | −0.11 s to +0.25 s | +0.22 s |
| NIC PUT, ASG membership (T5, 90 observations) | −0.70 s to +0.77 s | +0.75 s |
| Subnet PUT, NSG swap (T7, 120 observations) | +0.07 s to +0.74 s | +0.66 s |
| Private endpoint PUT, ASG membership (T8, 30 observations) | −131 s to −2.4 s | −2.1 s |

The data plane switched within about one second of the response in every case. But a closing change could still let traffic through up to 0.22 s (NSG) and 0.75 s (NIC) after the operation reported `Succeeded`. One NIC PUT took 12.5 s to report `Succeeded`, while its data-plane effect came 11 s before that. The operation status is neither an early nor a late bound for the data plane (NSG/ASG U15).

### T5: one NIC PUT that moves an IP configuration between ASGs did not take effect as a whole

`nsg-dst` held allow rules for `asg-x` (source, 5003), `asg-y` (source, 5004), `asg-d1` (destination, 5005) and `asg-d2` (destination, 5006). One NIC PUT replaced the IP configuration's single ASG with the other one. On the source side, `vm-a`'s NIC moved, and the inbound NSG on the hosts of `vm-b` and `vm-c` evaluated it. On the destination side, `vm-b`'s NIC moved, and `vm-c` stayed closed throughout as a control.

| Run | Side | Swaps | Both memberships in effect (both open) | Neither membership in effect (both closed > 0.15 s) |
|---|---|---|---|---|
| 1 | source (`nic-a`) | 10 | 2 swaps, one host each, 0.27–0.28 s | 0 |
| 1 | destination (`nic-b`) | 10 | 7 swaps, 0.29–0.33 s | 3 swaps, 0.35–0.37 s |
| 2 | source (`nic-a`) | 20 | 1 swap, both hosts, 0.27–0.28 s | 1 swap, both hosts, 0.37–0.44 s |
| 2 | destination (`nic-b`) | 20 | 0 | 0 |

14 of 60 swaps went through an interim state that lasted 0.27 to 0.44 s. In both directions the state log shows one clean step per port: the interim is steady, not a lost probe. Azure applied the removal of one ASG and the addition of the other as two separate data-plane changes, in either order. In run 1 one host saw the interim and the other did not. The frequency differs between runs, which used different VMs and probably different hosts.

### T7: one subnet PUT that swaps the NSG took effect as a whole

Run 3 ([results](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-083643-results.json), [log](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-083643-checker.log)). `nsg-swap-a` allows 5002 and `nsg-swap-b` allows 5003, inbound from `src` and outbound to `dst`. Both deny 5001–5006 otherwise, in both directions. A subnet without an NSG lets 5001 through, because the default rules allow traffic inside the VNet. One subnet PUT moved the subnet from one NSG to the other: GET the subnet, change `networkSecurityGroup.id`, PUT it back without the read-only lists. On the destination side, `dst` (vm-b, vm-c) swapped while `src` kept `nsg-src`. On the source side, `src` (vm-a) swapped while `dst` had `nsg-dst` with only an allow for 5001–5006 from `src`. The probe port 5001 had ten workers per target, one probe every 10 ms even while closed. 5002 and 5003 were probed every 20 ms, as in T5.

| Side | Swaps | Observations (2 targets) | Probes on 5001 after the baseline | Connects on 5001 | 5002 and 5003 open together | Longest "both closed" | LRO duration |
|---|---|---|---|---|---|---|---|
| destination (`dst`) | 30 | 60 | 31,572 | 0 | 0 | 0.16 s (3 above 0.15 s) | 0.44–1.89 s |
| source (`src`) | 30 | 60 | 30,391 | 0 | 0 | 0.15 s | 0.44–1.08 s |

The probe port never opened, so the subnet never stood without an NSG. No observation had both switch ports open, so the old and the new NSG never let their allows through together. The "both closed" gaps lie at the opening-detection limit of about 0.15 s; three gaps on the destination side reached 0.16 s. A short moment in which both NSGs applied would also read as "both closed", and it can only close traffic. At this resolution, one subnet PUT switched the subnet from one NSG to the other as a whole. A window without an NSG of 10 ms or more would have shown at each target in every swap. Every switch took effect after the first observed `Succeeded`, 0.07 to 0.74 s later.

### T8: a private endpoint takes its new ASG long before `Succeeded`

Run 4. `nsg-pe` on the subnet `pe` holds `pe1-443-from-src1` (allow TCP 443 from 10.90.1.10 to `asg-pe1`), `pe2-443-from-src2` (allow TCP 443 from 10.90.1.11 to `asg-pe2`) and `deny-443` (priority 4000). The subnet has `privateEndpointNetworkPolicies: Enabled`, which Microsoft requires before NSG rules that reference an ASG apply to a private endpoint ([Configure an ASG with a private endpoint](https://learn.microsoft.com/en-us/azure/private-link/configure-asg-private-endpoint), page date 2026-08-10, retrieved 2026-11-10). The two ASGs are told apart by source IP, because "Source port filtering is interpreted as \*" for traffic to a private endpoint ([Private endpoint limitations](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview#limitations), page date 2026-08-11, retrieved 2026-11-10). Microsoft documents no port list for storage private endpoints, so the check uses only 443. `vm-a` probed 10.90.3.10:443 from each of its two IPs every 20 ms. Before the series, both IPs reached the endpoint under an allow without ASGs, and only the first IP did under the ASG rules: the rules applied. One private endpoint PUT then replaced the endpoint's single ASG with the other one, 30 times.

| Measure | Value |
|---|---|
| LRO duration | 12.9–143 s, median 14.1 s; 3 of 30 above 20 s |
| New ASG in effect, after the synchronous PUT response | 9.9–11.8 s, median 10.6 s |
| New ASG in effect, relative to the observed `Succeeded` | −131 s to −2.4 s: always before |
| In both ASGs (both IPs connected) | 1 swap, 0.37 s (into `asg-pe1`); 3 more overlaps of 2–12 ms lie below the probe spacing |
| In neither ASG (both IPs closed) | at most 0.12 s, within the opening-detection limit |

Private endpoint writes are slow, but their data-plane effect never came after `Succeeded`. The lag after `Succeeded` is negative in every swap, so a Settle time after `Succeeded` covers it with room to spare. One swap passed through "in both ASGs" for 0.37 s, as T5 saw for network interfaces. One region, one storage private endpoint, one run.

### T9: an ASG write on an automatically approved private endpoint needs the approval right on the linked resource

Run 3 stopped T8 at its first private endpoint write. The prober's identity held Network Contributor on the resource group, which includes `Microsoft.Network/privateEndpoints/write` and `Microsoft.Network/virtualNetworks/subnets/join/action`. Azure answered: "has permission to perform action 'Microsoft.Network/privateEndpoints/write' … however, it does not have permission to perform action(s) 'Microsoft.Storage/storageAccounts/PrivateEndpointConnectionsApproval/action' on the linked scope(s)" (`LinkedAuthorizationFailed`). For run 4 the identity got Storage Account Contributor on T8's storage account only, and T9 checked three private endpoints to a second storage account on which it held no role. Each write changed only the endpoint's ASGs.

| Private endpoint | Connection | State | ASG-only PUT with network rights only |
|---|---|---|---|
| `pe-auto2` | `privateLinkServiceConnections` (automatic) | Approved | 403 `LinkedAuthorizationFailed` |
| `pe-manual2` | `manualPrivateLinkServiceConnections` | Approved | 200, `Succeeded` after 12 s |
| `pe-pending2` | `manualPrivateLinkServiceConnections` | Pending | 200, `Succeeded` after 14 s |

Microsoft documents the approval action only as what makes a new private endpoint's connection approved automatically. Create and update need `privateEndpoints/write` and `subnets/join/action` ([Azure RBAC permissions for Azure Private Link](https://learn.microsoft.com/en-us/azure/private-link/rbac-permissions), page date 2026-03-30, retrieved 2026-11-10). The page does not say that every later write on an automatically approved endpoint checks the approval action again, nor whether `*/privateEndpointConnectionsApproval/action` is valid in a custom role. In the test, it was checked again. The action belongs to the target service (`Microsoft.Storage/…`, `Microsoft.KeyVault/…`, `Microsoft.Sql/…`) and sits on the target resource, which may live in another team's subscription.

### ASG membership is per network interface

The first deployment for T8 gave `nic-a` a second IP configuration without ASGs, while the first was in `asg-x`. Azure rejected the network interface synchronously: "All IPConfigurations on a Network Interface should reference the same set of Application Security Groups" (`AllIpConfigurationsOnANicMustBelongToTheSameApplicationSecurityGroups`). Microsoft Learn does not document this rule: the ASG overview, the network interface pages, the NSG overview and the networking limits ("Application security groups per IP configuration, per NIC: 20") say nothing about it (retrieved 2026-11-10). One public bug report shows the same error ([OCPBUGS-5419](https://issues.redhat.com/browse/OCPBUGS-5419)). An ASG member is therefore a whole network interface: a write that joins or leaves an ASG must change every IP configuration of the interface at once. T10 narrows the rule to one address family: an IPv6 IP configuration may reference other ASGs than the IPv4 ones.

### T10: Azure accepts any ASGs on an IPv6 IP configuration, and the effective view keeps an IPv6 leave

Two runs on 2026-11-10 in North Europe on `Standard_B1s`, network API 2024-05-01, Terraform 1.17.1 with azurerm 5.13.0. Run 1 ([results](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-140336-t10-results.json)) sent cases 1 to 4. Run 2 ([results](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-141225-t10-results.json)) timed joins and leaves. Script: [t10.py](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/t10.py), Terraform: [t10-tf/main.tf](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/t10-tf/main.tf). Synchronous control-plane writes and reads only, no probes. The runs kept resources for 7 and 17 minutes, under 0.01 €. Both resource groups are deleted, and after each teardown no group with the checks' tag was left in the subscription.

**Setup.** `vnet-v6` 10.91.0.0/16 and fd00:91::/48, one subnet `dual` (10.91.1.0/24 and fd00:91:0:1::/64) with `nsg-v6`. One VM `vm-v6`, whose only network interface `nic-v6` has `ipconfig-v4` (10.91.1.10, primary) and `ipconfig-v6` (fd00:91:0:1::4), without ASGs at deployment. Two plain ASGs `asg-a` and `asg-b`, as the tool creates a Managed ASG. `nsg-v6` holds `in-5001-to-asg-a` (inbound allow from any to `asg-a`), `out-5002-from-asg-a` (outbound allow from `asg-a` to any) and `in-5003-to-asg-b`. The VM exists only for the effective security rules. Each write is a GET of the network interface, the ASGs set per IP configuration, a PUT and the async operation polled to the end; then a GET and a POST to `effectiveNetworkSecurityGroups`. Between cases, one PUT took both IP configurations out of every ASG.

**How the effective view shows membership.** An ASG rule appears among the network interface's effective security rules only while one of its IP configurations is in the ASG. The any side lists `0.0.0.0/0` for an IPv4 member, `::/0` for an IPv6 member, and both when both are members (in `sourceAddressPrefixes` or `destinationAddressPrefixes`; the singular field shows only the first). The view does not expand an ASG into member IPs. The baseline without ASGs listed none of the three rules. The view also lists one rule collection from an Azure Virtual Network Manager configuration that applies to the test subscription from outside these checks.

| Case | Sent, IPv4 / IPv6 | Response, operation | GET afterwards | Effective view |
|---|---|---|---|---|
| 1 | `asg-a` / none | 200, `Succeeded` after 1.2 s | as sent | `asg-a`: `0.0.0.0/0` |
| 2 | `asg-a` / `asg-a` | 200, `Succeeded` after 7.7 s | as sent | `asg-a`: `0.0.0.0/0`, `::/0` |
| 3 | none / `asg-a` | 200, `Succeeded` after 7.9 s | as sent | `asg-a`: `::/0` |
| extra | `asg-a` / `asg-b` | 200, `Succeeded` after 7.9 s | as sent | `asg-a`: `0.0.0.0/0`, `::/0` (IPv6 stale); `asg-b`: `::/0` |
| 4, azurerm association | the provider's PUT | `terraform apply` exit 0 after 3.9 s | `asg-a` / none | `asg-a`: `0.0.0.0/0`; `asg-b`: `::/0` (stale) |

Azure accepted every combination. `AllIpConfigurationsOnANicMustBelongToTheSameApplicationSecurityGroups` (see above) does not reach across address families: the IPv6 IP configuration may carry no ASG, the same ASGs or other ASGs than the IPv4 one. Whether the rule holds between two IPv6 IP configurations was not checked; `nic-v6` had one. The azurerm association did what its source says ([network_interface.go L90–L139](https://github.com/hashicorp/terraform-provider-azurerm/blob/v5.13.0/internal/services/network/network_interface.go#L90-L139)): it put `asg-a` on the IPv4 IP configuration only and left the IPv6 one as it was. `terraform destroy` removed it again. Writes that touch the IPv6 IP configuration take longer: 5.9 to 7.9 s against 1.2 to 3.4 s for IPv4 alone, over both runs.

The two stale entries came after the reset that took the IPv6 IP configuration out of an ASG. Run 2 timed that. It joined and left `asg-a` with one IP configuration at a time, three rounds per family with the order alternating, and after each `Succeeded` polled the effective view every 2 s (each call took about 3.7 s) for up to 150 s.

| Write | Effective view followed |
|---|---|
| IPv4 join | 2 of 3 at the first poll (3.7–3.9 s). The third kept a stale IPv6 entry next to the new IPv4 one for 154 s. |
| IPv4 leave | 3 of 3 at the first poll (3.7–4.0 s) |
| IPv6 join | 3 of 3 at the first poll (3.5–3.7 s) |
| IPv6 leave | 0 of 3: `::/0` stayed in all 27 polls, for 151–152 s |

The GET showed the IPv6 IP configuration without the ASG, but the effective view kept the IPv6 membership until the IPv4 IP configuration left the same ASG: the IPv4 leave of round 2 cleared both entries at the first poll. Run 1 agrees: the reset after the extra case took `asg-a` off the IPv4 IP configuration and cleared the stale IPv6 entry of `asg-a`, but the IPv6 entry of `asg-b`, which the IPv4 IP configuration never held, stayed until the end of the run.

The effective view is the control plane's account of the rules on the network interface. With the ASG on the IPv6 IP configuration it applies the ASG's rules to IPv6 traffic; after an IPv6 leave it goes on applying them. Whether the data plane does the same stays untested. If it does, an IPv6 leave does not take effect within any Settle time.

**Documented in passing.** "While it's possible to create NSG rules for IPv4 and IPv6 within the same NSG, it isn't currently possible to combine an IPv4 subnet with an IPv6 subnet in the same rule when specifying IP prefixes" ([IPv6 for Azure Virtual Network](https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/ipv6-overview#limitations), page date 2024-10-16, updated 2026-07-27, retrieved 2026-11-10). This answers NSG/ASG U19: one address family per NSG rule, as the engine writes already. No Microsoft page says anything about ASGs and IPv6: not that one, not the [ASG overview](https://learn.microsoft.com/en-us/azure/virtual-network/application-security-groups) (2025-07-25) and not the [NSG overview](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview) (updated 2025-10-23), all retrieved 2026-11-10.

### Documented: at most 50 IP configurations per ASG on a private endpoint subnet

"Fifty is the number of IP Configurations that can be tied to each respective ASG that's coupled to the NSG on the private endpoint subnet. Connection failures may occur with more than 50 members" ([Private endpoint limitations](https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview#limitations), page date 2026-08-11, retrieved 2026-11-10). The general limit is 4,000 IP configurations per ASG ([networking limits](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#azure-networking-limits), page date 2026-08-04, retrieved 2026-11-10). Not tested.

## What this means for the design

These are facts for a design decision. The decision itself belongs to its own ticket.

- **Priorities (T1).** Uniqueness per direction holds, as assumed in [Grilling: Priority assignment and rule packing](https://github.com/mfgAkilae/nsgfw/issues/13). Bands per direction and renumbering in one PUT need no change.
- **NSG PUT (T2, T3).** ADR 0018's assumption that one NSG PUT takes effect as a whole held in 30 swaps. A rejected PUT applied nothing.
- **Write order (T4).** ADR 0018 writes the closing NSG "first". `Succeeded` of that write does not mean its change is in effect: traffic it closes passed up to 0.22 s later. A write that waits for it can only start after the closing write has taken effect, not merely after it reports `Succeeded`.
- **ASG membership (T5).** ADR 0018's assumption that one network interface write takes effect as a whole does not hold when the write removes one ASG and adds another. For up to 0.44 s the IP configuration was in both ASGs or in neither. "Neither" can fall through to rules without ASGs, so it can open traffic that both states deny. The three member steps in ADR 0018 must not rely on several membership changes in one write being applied together.
- **Sign-in (T6).** The managed identity as federated credential works with MSAL Node in Container Apps, as [ADR 0013](../adr/0013-backend-sign-in-and-separate-directory-and-azure-principals.md) planned. The increment plan can start from it.
- **Subnet NSG swap (T7).** ADR 0018's assumption that one subnet write that swaps the NSG takes effect as a whole held in 60 swaps, on the source and the destination side. Onboarding a subnet whose NSG is shared can keep the swap in one subnet write ([ADR 0003](../adr/0003-adopt-existing-nsgs-in-place.md)). Its lag after `Succeeded` (up to 0.74 s) stays below half the Settle time.
- **Private endpoint writes (T8).** The data-plane effect came 2 to 131 s before `Succeeded`, and one swap passed through "in both ASGs". The atom model and the Settle time cover private endpoints as decided. Private endpoint writes take 13 s to more than 2 minutes, which lengthens member steps that contain them.
- **Rights for private endpoint writes (T9).** `nsgfw ASG Writer` as decided in ADR 0014 cannot change the ASGs of a private endpoint whose connection was approved automatically: Azure also checks `…/privateEndpointConnectionsApproval/action` on the linked resource, which belongs to the target service and may sit outside the Environment. Endpoints with manual connections need network rights only. This needs a decision.
- **ASG members are network interfaces.** Every IP configuration of a network interface must reference the same ASGs (T10 narrows this to the IPv4 IP configurations). ADR 0018 defines a membership atom as one IP configuration; in Azure it is one network interface, and a write must change all its IP configurations together.
- **50 members per ASG on private endpoint subnets.** Microsoft documents connection failures above 50 IP configurations per ASG that the NSG of a private endpoint subnet references. The ASG limits that block a Change set ([ADR 0006](../adr/0006-asg-objects-one-managed-asg-per-vnet.md)) do not include it yet.
- **Dual-stack network interfaces (T10).** Point 13 of [Grilling: Terraform mode workflow](https://github.com/mfgAkilae/nsgfw/issues/17) stands: Azure accepts the azurerm association on a dual-stack network interface, the association writes the IPv4 IP configurations only, and the IPv6 addresses need the IP fallback. The premise in ADR 0006 and ADR 0018 that every IP configuration must carry the same ASGs holds within IPv4 only, so an ARM-mode membership write could leave the IPv6 IP configurations out as well. An IPv6 leave did not reach the effective view within 150 s in 3 of 3 tries, until the IPv4 IP configuration left the same ASG. Whether ARM mode writes ASGs onto IPv6 IP configurations, and what Adopt does with an ASG that already holds IPv6 IP configurations, needs a decision.

## T6: MSAL Node with a managed identity as federated credential

**Result: it works.** MSAL Node redeemed an authorization code, and fetched an app-only Graph token, with a user-assigned managed identity token as its only client credential. The app registration held no secret and no certificate. ADR 0013 needs no fallback for Container Apps. Its certificate fallback stays as the documented path, and the nightly integration test covers this flow.

**Setup.** [t6.py](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/t6.py) deploys a user-assigned identity `id-nsgfw-t6`, a Consumption-only Container Apps environment without Log Analytics, and the Container App `ca-nsgfw-t6`: `node:22-alpine` with 0.25 vCPU and one replica, running [t6-app.mjs](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/t6-app.mjs). The app builds a `ConfidentialClientApplication` whose `clientAssertion` callback fetches a token for `api://AzureADTokenExchange` from the Container Apps identity endpoint (`IDENTITY_ENDPOINT`, header `X-IDENTITY-HEADER`, API version 2019-08-01) for the identity's client ID. Sign-in uses the authorization code flow with PKCE and the scope `User.Read`. `/cc` calls `acquireTokenByClientCredential` for `https://graph.microsoft.com/.default`. `/result` reports outcomes only, never tokens or IDs.

**The human's part.** The map owner ran [t6-register.sh](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/t6-register.sh) in Cloud Shell, signed in as themselves. It runs in PowerShell and Bash alike:

```
curl -sSL https://raw.githubusercontent.com/mfgAkilae/nsgfw/research/empirical-checks/docs/research/empirical-checks/t6-register.sh | bash -s -- <subscription-id> <tenant-id> <managed-identity-object-id> <app-fqdn> <resource-group>
```

It creates the app registration (single tenant, Web redirect `https://<app-fqdn>/redirect`), adds the federated credential (issuer `https://login.microsoftonline.com/<tenant-id>/v2.0`, subject = the identity's object ID, audience `api://AzureADTokenExchange`), creates the service principal, and sets `CLIENT_ID` on the Container App. Then the map owner signed in once in the browser.

| Observation | Value |
|---|---|
| MSAL Node / Node.js | 7.2.1 / v22.23.4 |
| Authorization code redeemed | yes; token type Bearer, scopes `openid profile User.Read email`, access and ID token |
| Client credentials (Graph `.default`) | yes, access token |
| Managed identity token for the assertion | issuer `https://login.microsoftonline.com/<tenant-id>/v2.0`, `aud` a GUID (not the string `api://AzureADTokenExchange`), lifetime 86,700 s (about 24 h) |
| Assertion callback calls | 2 for 2 token requests: MSAL fetches a fresh assertion per request and caches only the resulting tokens |

Raw result: [20261110-t6-result.json](https://github.com/mfgAkilae/nsgfw/blob/research/empirical-checks/docs/research/empirical-checks/results/20261110-t6-result.json). The Container App ran about 15 minutes inside the free grant, so T6 cost nothing.

Two traps for the next run: Cloud Shell opens in PowerShell, where Bash syntax such as `APP_ID=$(…)` fails, hence the shell-neutral `curl … | bash` line. And `az containerapp` needs the `containerapp` extension, which the script installs without a prompt.

## Deferred checks (nightly integration tests)

These points stay open. The design keeps the default in the right column until a nightly integration test shows otherwise. The increment plan turns them into backlog items.

| Open point | Source | Default until tested |
|---|---|---|
| Several service tags, or a service tag with CIDRs, in one prefix list | NSG/ASG U6 | One service tag per NSG rule, as documented |
| ASG mixed with prefixes on one side, several ASGs per side, ASG members in another VNet | NSG/ASG U7, U8, U11 | As documented; member IPs where the ASG's members sit in another VNet |
| `If-Match` on NSG, subnet and NIC PUTs | ARM U4 | Lost-update check through `resourcechanges` after the Deployment |
| NSG PUT without `securityRules` | ARM U1 | The tool always sends the full list |
| 6,000 addresses per rule or per NSG; default rules against the 2,000; port ranges per rule | NSG/ASG U16, U17, U10 | The engine counts conservatively |
| Does an ASG on an IPv6 IP configuration match IPv6 traffic, and does an IPv6 leave take effect on the data plane? (T10: Azure accepts the write; the effective view applies the ASG to IPv6 and keeps it after an IPv6 leave) | ASG grilling; T10 | Member IPs for IPv6 |
| Pod IPs on AKS nodes (Azure CNI without overlay) and the node pool's ASG | ASG grilling | No assumption that pod IPs match |
| AKS with Azure CNI Overlay under Deny-all rules with Extra prefixes | Review round | Documented outbound Rules; onboarding shows a warning |
| Deny-all and DNS (168.63.129.16) and IMDS (169.254.169.254) | Special subnets 3 | Documented: not filtered unless a service tag targets them |
| `flushConnection`: are allowed flows kept, how fast are flows re-evaluated | NSG/ASG U14 | Environment setting, off |
| Deleting an ASG that an NSG rule still references | Deployment grilling | Assumed rejected; the write order does not depend on it |
| Protocol `*` with a port range matches only TCP and UDP | Import grilling | Import writes tcp and udp Service objects with a warning Import note |
| ARM response for an NSG on GatewaySubnet, RouteServerSubnet, AzureFirewallSubnet | Special subnets 1 | The tool never onboards these subnets |
| `checkPolicyRestrictions`: NSG content, child checks, inherited assignments, `DoNotEnforce`, `notScopes`, exemptions; the real `RequestDisallowedByPolicy` payload | Policy 1, 2, 4, 6, 9; Policy grilling | The tool filters itself; a deny at write time is a failed Deployment |
| Reader reads policy objects on ancestor management groups | Policy grilling | Unknown names show as IDs |
| Linked access checks (`join` actions) for subnet, NIC and private endpoint PUTs | ARM U10, U15; Hosting grilling | Writer roles without them; the tool maps `LinkedAuthorizationFailed` to the missing action (see the linked-access test below). T9 answered one linked check: an ASG write on an automatically approved private endpoint needs the target's `privateEndpointConnectionsApproval/action`. The `join` actions stay untested, because the prober held Network Contributor. |
| Resource Graph actions in a custom role; `permissions/read` for the self-check; Reader polling LRO status of a narrower Writer | ARM U5, U16 | Roles include the actions |
| Graph `User.ReadBasic.All` and the groups filter permission | Hosting grilling | Sign-in works; the principal picker falls back to object IDs |
| PostgreSQL Entra token lifetime, connections after expiry, Container Apps Job as schema owner | Hosting U4, U5 | Token refresh per new connection; the migrate step uses its own identity |
| Outbound order of admin rules relative to NIC NSGs (the band for AVNM security user rules is Later) | Security layers 5; Policy grilling | Shown as documented, with a note |
| Terraform: destroy order of an ASG, `azapi_update_resource` on a foreign-managed subnet, plan of `securityRules` | Terraform grilling | One pull request per write step; foreign-IaC evidence before adopt |
| Flow-log and Traffic Analytics formats: `AclRule`, truncation, `AclGroup`, subnet IDs, field values, double counting, access modes, token, workspace ID, latency, billing, Resource Graph | Flow logs 1–3; Traffic Analytics 1–13 | Tolerant parser; the Flow view shows "—" where data is missing |
| Lag of an NSG PUT against traffic to a private endpoint (network policies enabled): how long after the response does the data plane follow? | [Design-package review](../review/design-package-review.md) Q8; T8 | An NSG write of a Zone that holds a private endpoint waits 30 s before the write after it (instance setting "Settle time for private endpoint Zones") |
| The lag measurements of T4 (NSG, network interface, subnet and private endpoint writes) in a second region | [Design-package review](../review/design-package-review.md) Q8 | One Settle time for the whole instance, 10 s by default; only one region was measured |
| ASGs on the IPv4 IP configurations only of a dual-stack network interface: does Azure keep accepting the write through ARM (T10 case 1) and through the azurerm association (T10 case 4)? | [Design-package review](../review/design-package-review.md) Q9; T10 | ASG references for the IPv4 addresses, the IP fallback for IPv6. If the test fails, dual-stack members go fully through the IP fallback |
| `ComputeResources`: does one query per Drift poll return every scale-set and AKS node interface of an External ASG object, and how late? | [Design-package review](../review/design-package-review.md) Q13; ARM U11 | Each Drift poll queries `ComputeResources` and diffs the result against the observed Azure inventory; the full reconcile reads everything every 24 hours |
| Does a changed or removed subnet NSG association appear in `resourcechanges`, and on which resource? | [Design-package review](../review/design-package-review.md) Q13; ARM U13 | Each Drift poll reads the NSG reference of every Zone's subnet from `resources` |
| Azure Virtual Network Manager through Resource Graph: which right exposes the rows, and does a missing right return an empty result without an error? | [Design-package review](../review/design-package-review.md) Q12 | Effective security admin rules per VNet through the REST call at the full reconcile and at Submit; Resource Graph only as the fast path of the Drift poll; "cannot read" where a right is missing |
| Step-up: does Entra issue the optional `auth_time` claim in the ID token, and does `prompt=login` renew it? | [Design-package review](../review/design-package-review.md) Q10 | The server checks `auth_time`; without the claim it refuses the step-up and Health flags it. `max_age=900` is only a hint |
| The linked-access test: a subnet PUT with route table, NAT gateway and service endpoints, and a network interface PUT with NSG, public IP and load-balancer pool, without the five join actions. First integration test of the onboarding increment | [Design-package review](../review/design-package-review.md) Q33 | The five join actions stay out of the Writer; the tool maps `LinkedAuthorizationFailed` to the missing action and names it |
| Does an NSG rule with protocol ICMP match ICMPv6? Microsoft's pages disagree | [Design-package review](../review/design-package-review.md) K20 | A warning on an icmp Service object on a dual-stack Zone |
| Container Apps pulls an image reference pinned by digest (Microsoft's pages show tags only) | [Design-package review](../review/design-package-review.md) K22 | Image reference pinned by digest; fallback: a unique release tag |
| Terraform starts the migrate job on an image change and waits for it before the new revision rolls out | [Design-package review](../review/design-package-review.md) K22 | Fallback: the app refuses to start on a schema older than it expects |
| `checkPolicyRestrictions`: how it reports `modify` (`Required` with `defaultValue`?) and `deployIfNotExists`, given that `result: "Required"` also appears with `policyEffect: "Deny"` | Policy 3; [Design-package review](../review/design-package-review.md) K25 | The tool classifies a Policy finding by `policyEffect`, never by `result` |
| Terraform with `create_before_destroy` on the Managed ASG: does one apply update the NSG before it destroys an ASG that the NSG no longer references? | [Design-package review](../review/design-package-review.md) K2 | The default HCL sets `create_before_destroy` on the Managed ASG, as Terraform documents the order; deleting Managed ASGs rides in the last pull request |
| `infra/` and the default HCL on OpenTofu | [Design-package review](../review/design-package-review.md) Q11 | Until it runs, only Terraform 1.7 or later counts as tested |

Dropped without a test: outbound deny NSG rules in an Application Gateway v2 subnet. Microsoft documents that they must not be created, so such a Zone keeps outbound open (review round). IPv4 and IPv6 prefixes in one NSG rule (NSG/ASG U19): Microsoft documents that this is not possible (see T10), so the engine keeps one address family per NSG rule.
