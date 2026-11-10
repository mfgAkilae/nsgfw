#!/usr/bin/env python3
"""T10: does Azure accept ASGs on the IPv6 IP configuration of a dual-stack network interface, and
must it carry the same ASGs as the IPv4 one? Synchronous control-plane writes only, no probes.

  python3 t10.py --secret - --terraform /path/to/terraform --tf-work /path/to/empty-dir
                 [--location northeurope] [--vm-size Standard_B1s] [--keep] [--out results/]

--secret takes the same JSON as run.py (appId, password, tenant, optionally subscriptionId);
"-" reads it from stdin, so the credential never touches the disk. --tf-work receives a copy of
t10-tf/main.tf, the provider and the Terraform state; delete it after the run.

What it does:
  1. creates rg-nsgfw-checks-<timestamp> (tagged with an expiry date) and deploys a dual-stack
     VNet, two ASGs, an NSG whose rules reference them, and one VM whose only network interface
     has an IPv4 and an IPv6 IP configuration and no ASGs (the VM exists only because Azure
     computes effective security rules for running VMs only);
  2. sends one network interface PUT per case and records the response, the GET afterwards and,
     where accepted, the effective security rules;
  3. applies azurerm_network_interface_application_security_group_association to the same
     network interface, records the GET and the effective rules, then destroys it;
  3b. with --lag-reps N (run 2, --lag-only skips steps 2 and 3): joins and leaves asg-a with one
     IP configuration at a time, N times per address family, and polls the effective rules after
     each Succeeded write until they show the new membership or --lag-timeout seconds pass;
  4. saves the results with every subscription, tenant and principal ID replaced, and deletes
     the resource group, also after errors and Ctrl-C (unless --keep).
"""
import argparse
import datetime as dt
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import COMPUTE_API, NET_API, Az, preflight  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
NET = "Microsoft.Network"
V4, V6 = "ipconfig-v4", "ipconfig-v6"
OUR_RULES = ("in-5001-to-asg-a", "out-5002-from-asg-a", "in-5003-to-asg-b")

# (case, ASGs on the IPv4 IP configuration, ASGs on the IPv6 IP configuration)
CASES = [
    ("1 ASG on IPv4 only", ["asg-a"], []),
    ("2 ASG on both", ["asg-a"], ["asg-a"]),
    ("3 ASG on IPv6 only", [], ["asg-a"]),
    ("extra: different ASGs on IPv4 and IPv6", ["asg-a"], ["asg-b"]),
]


def template():
    rid = lambda t, n: f"[resourceId('{t}', '{n}')]"
    loc = "[parameters('location')]"
    asg_ref = lambda n: [{"id": rid(f"{NET}/applicationSecurityGroups", n)}]

    def rule(name, prio, direction, port, src_asg=None, dst_asg=None):
        p = {"priority": prio, "direction": direction, "access": "Allow", "protocol": "Tcp",
             "sourcePortRange": "*", "destinationPortRange": str(port)}
        if src_asg:
            p["sourceApplicationSecurityGroups"] = asg_ref(src_asg)
        else:
            p["sourceAddressPrefix"] = "*"
        if dst_asg:
            p["destinationApplicationSecurityGroups"] = asg_ref(dst_asg)
        else:
            p["destinationAddressPrefix"] = "*"
        return {"name": name, "properties": p}

    asg = lambda n: {"type": f"{NET}/applicationSecurityGroups", "apiVersion": NET_API, "name": n,
                     "location": loc}
    subnet = {"id": f"[resourceId('{NET}/virtualNetworks/subnets', 'vnet-v6', 'dual')]"}
    return {
        "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {"location": {"type": "string"}, "vmSize": {"type": "string"},
                       "adminPassword": {"type": "securestring"}},
        "resources": [
            asg("asg-a"), asg("asg-b"),
            {"type": f"{NET}/networkSecurityGroups", "apiVersion": NET_API, "name": "nsg-v6",
             "location": loc,
             "dependsOn": [rid(f"{NET}/applicationSecurityGroups", n) for n in ("asg-a", "asg-b")],
             "properties": {"securityRules": [
                 rule(OUR_RULES[0], 200, "Inbound", 5001, dst_asg="asg-a"),
                 rule(OUR_RULES[1], 200, "Outbound", 5002, src_asg="asg-a"),
                 rule(OUR_RULES[2], 210, "Inbound", 5003, dst_asg="asg-b")]}},
            {"type": f"{NET}/virtualNetworks", "apiVersion": NET_API, "name": "vnet-v6", "location": loc,
             "dependsOn": [rid(f"{NET}/networkSecurityGroups", "nsg-v6")],
             "properties": {"addressSpace": {"addressPrefixes": ["10.91.0.0/16", "fd00:91::/48"]},
                            "subnets": [{"name": "dual", "properties": {
                                "addressPrefixes": ["10.91.1.0/24", "fd00:91:0:1::/64"],
                                "networkSecurityGroup": {"id": rid(f"{NET}/networkSecurityGroups", "nsg-v6")}}}]}},
            {"type": f"{NET}/networkInterfaces", "apiVersion": NET_API, "name": "nic-v6", "location": loc,
             "dependsOn": [rid(f"{NET}/virtualNetworks", "vnet-v6")],
             "properties": {"ipConfigurations": [
                 {"name": V4, "properties": {"subnet": subnet, "primary": True,
                                             "privateIPAddressVersion": "IPv4",
                                             "privateIPAllocationMethod": "Static",
                                             "privateIPAddress": "10.91.1.10"}},
                 {"name": V6, "properties": {"subnet": subnet, "primary": False,
                                             "privateIPAddressVersion": "IPv6",
                                             "privateIPAllocationMethod": "Dynamic"}}]}},
            {"type": "Microsoft.Compute/virtualMachines", "apiVersion": COMPUTE_API, "name": "vm-v6",
             "location": loc, "dependsOn": [rid(f"{NET}/networkInterfaces", "nic-v6")],
             "properties": {
                 "hardwareProfile": {"vmSize": "[parameters('vmSize')]"},
                 "osProfile": {"computerName": "vm-v6", "adminUsername": "nsgfw",
                               "adminPassword": "[parameters('adminPassword')]",
                               "linuxConfiguration": {"disablePasswordAuthentication": False}},
                 "storageProfile": {
                     "imageReference": {"publisher": "Canonical", "offer": "ubuntu-24_04-lts",
                                        "sku": "server", "version": "latest"},
                     "osDisk": {"createOption": "FromImage", "deleteOption": "Delete",
                                "managedDisk": {"storageAccountType": "StandardSSD_LRS"}}},
                 "networkProfile": {"networkInterfaces": [
                     {"id": rid(f"{NET}/networkInterfaces", "nic-v6"),
                      "properties": {"deleteOption": "Delete"}}]}}},
        ],
    }


def tail(x):
    return x.rsplit("/", 1)[-1] if isinstance(x, str) else x


def http_error(e):
    """Split run.Az's RuntimeError into status code and Azure error object."""
    m = re.search(r"-> (\d{3}): (.*)", str(e), re.S)
    if not m:
        return None, {"message": str(e)[:2000]}
    try:
        err = json.loads(m.group(2)).get("error", {})
    except ValueError:
        err = {"message": m.group(2)[:2000]}
    return int(m.group(1)), {"code": err.get("code"), "message": err.get("message"),
                             "details": err.get("details")}


class Check:
    def __init__(self, az, rgp):
        self.az, self.rgp = az, rgp
        self.nic = f"{rgp}/providers/{NET}/networkInterfaces/nic-v6"

    def asg_id(self, name):
        return f"{self.rgp}/providers/{NET}/applicationSecurityGroups/{name}"

    def nic_view(self):
        body = self.az.call("GET", self.nic, api=NET_API)[2]
        out = {"provisioningState": body["properties"].get("provisioningState"), "ipConfigurations": []}
        for ipc in body["properties"]["ipConfigurations"]:
            p = ipc["properties"]
            out["ipConfigurations"].append({
                "name": ipc["name"], "version": p.get("privateIPAddressVersion"),
                "privateIPAddress": p.get("privateIPAddress"), "primary": p.get("primary"),
                "applicationSecurityGroups": sorted(tail(a["id"]) for a in p.get("applicationSecurityGroups") or [])})
        return out

    def effective_rules(self):
        """POST effectiveNetworkSecurityGroups, follow the Location header, keep the rules under test."""
        t0 = time.time()
        try:
            st, hdr, body = self.az.call("POST", f"{self.nic}/effectiveNetworkSecurityGroups", api=NET_API)
        except RuntimeError as e:
            code, err = http_error(e)
            return {"status": code, "error": err}
        url = hdr.get("location")
        while st == 202 and url and time.time() - t0 < 600:
            time.sleep(3)
            st, hdr, body = self.az.call("GET", url=url)
        groups = []
        for g in body.get("value", []):
            rules = g.get("effectiveSecurityRules") or []
            groups.append({
                "networkSecurityGroup": tail((g.get("networkSecurityGroup") or {}).get("id")),
                # a Virtual Network Manager configuration of the test subscription carries an ID in its name
                "association": {k: "<redacted>" if k == "networkManager" else tail((v or {}).get("id"))
                                for k, v in (g.get("association") or {}).items()},
                "ruleCount": len(rules),
                "rulesUnderTest": [r for r in rules if any(n in (r.get("name") or "") for n in OUR_RULES)],
                "defaultRulesExpanded": [
                    {k: r.get(k) for k in ("name", "expandedSourceAddressPrefix", "expandedDestinationAddressPrefix")}
                    for r in rules if "AllowVnetInBound" in (r.get("name") or "")]})
        return {"status": st, "seconds": round(time.time() - t0, 1), "value": groups}

    def put_asgs(self, v4, v6):
        body = self.az.call("GET", self.nic, api=NET_API)[2]
        for k in ("etag", "id", "name", "type"):
            body.pop(k, None)
        for ipc in body["properties"]["ipConfigurations"]:
            want = v4 if ipc["properties"].get("privateIPAddressVersion") == "IPv4" else v6
            ipc["properties"]["applicationSecurityGroups"] = [{"id": self.asg_id(a)} for a in want]
        t0 = time.time()
        res = {"sent": {V4: v4, V6: v6}}
        try:
            st, hdr, _ = self.az.call("PUT", self.nic, body, api=NET_API)
        except RuntimeError as e:
            res["status"], res["error"] = http_error(e)
            res["accepted"] = False
            return res
        res["status"] = st
        res["responseSeconds"] = round(time.time() - t0, 2)
        try:
            self.az.wait(hdr, "nic put", timeout=600, poll=2)
            res["lro"] = "Succeeded"
            res["accepted"] = True
        except RuntimeError as e:
            res["lro"] = str(e)[:2000]
            res["accepted"] = False
        res["lroSeconds"] = round(time.time() - t0, 2)
        return res

    def case(self, name, v4, v6):
        print(f"case {name}: IPv4 {v4}, IPv6 {v6}", flush=True)
        res = {"case": name, **self.put_asgs(v4, v6)}
        res["after"] = self.nic_view()
        if res["accepted"]:
            res["effective"] = self.effective_rules()
        print(f"  -> {res.get('status')} {res.get('error', {}).get('code') if res.get('error') else res.get('lro')}",
              flush=True)
        return res

    def reset(self):
        r = self.put_asgs([], [])
        if not r["accepted"]:
            raise RuntimeError(f"reset failed: {r}")

    def families(self, rule="in-5001-to-asg-a"):
        """Address families for which the effective view applies the rule to this network interface."""
        e = self.effective_rules()
        for g in e.get("value", []):
            for r in g["rulesUnderTest"]:
                if r.get("name", "").endswith(rule):
                    return sorted(r.get("sourceAddressPrefixes") or [r.get("sourceAddressPrefix")])
        return []

    def converge(self, want, timeout):
        """Poll the effective view after a Succeeded write until it shows `want` or the timeout."""
        t0, polls = time.time(), []
        while True:
            fam = self.families()
            polls.append([round(time.time() - t0, 1), fam])
            if fam == want:
                return {"converged": True, "seconds": polls[-1][0], "polls": polls}
            if time.time() - t0 > timeout:
                return {"converged": False, "seconds": None, "polls": polls}
            time.sleep(2)


def lag_series(chk, reps, timeout):
    """Join and leave asg-a with one IP configuration at a time; time until the effective view follows."""
    fam_of = {"IPv4": "0.0.0.0/0", "IPv6": "::/0"}
    out = []
    for rep in range(reps):
        for family in (("IPv4", "IPv6") if rep % 2 == 0 else ("IPv6", "IPv4")):
            for step in ("join", "leave"):
                asgs = ["asg-a"] if step == "join" else []
                w = chk.put_asgs(asgs if family == "IPv4" else [], asgs if family == "IPv6" else [])
                want = [fam_of[family]] if step == "join" else []
                c = chk.converge(want, timeout) if w["accepted"] else {"converged": None}
                out.append({"rep": rep + 1, "family": family, "step": step, "lroSeconds": w.get("lroSeconds"),
                            "accepted": w["accepted"], **c})
                print(f"lag rep {rep + 1} {family} {step}: converged {c.get('converged')} after {c.get('seconds')} s"
                      f" ({len(c.get('polls', []))} polls)", flush=True)
    return out


def terraform_case(chk, a, secret, sub):
    work = a.tf_work
    os.makedirs(work, exist_ok=True)
    shutil.copy(os.path.join(HERE, "t10-tf", "main.tf"), os.path.join(work, "main.tf"))
    env = dict(os.environ, ARM_CLIENT_ID=secret["appId"], ARM_CLIENT_SECRET=secret["password"],
               ARM_TENANT_ID=secret["tenant"], ARM_SUBSCRIPTION_ID=sub, TF_IN_AUTOMATION="1", TF_INPUT="0",
               TF_PLUGIN_CACHE_DIR=os.path.join(work, ".plugin-cache"),
               TF_VAR_network_interface_id=chk.nic, TF_VAR_application_security_group_id=chk.asg_id("asg-a"))
    os.makedirs(env["TF_PLUGIN_CACHE_DIR"], exist_ok=True)

    def tf(*args):
        p = subprocess.run([a.terraform, f"-chdir={work}", *args, "-no-color"], env=env,
                           capture_output=True, text=True, timeout=900)
        return {"cmd": " ".join(args), "exit": p.returncode, "output": (p.stdout + p.stderr)[-6000:]}

    res = {"case": "4 azurerm association", "steps": []}
    res["steps"].append(tf("init", "-input=false"))
    res["versions"] = tf("version", "-json")["output"]
    print("case 4: terraform apply", flush=True)
    t0 = time.time()
    res["steps"].append(tf("apply", "-auto-approve", "-input=false"))
    res["applySeconds"] = round(time.time() - t0, 1)
    res["accepted"] = res["steps"][-1]["exit"] == 0
    res["after"] = chk.nic_view()
    if res["accepted"]:
        res["effective"] = chk.effective_rules()
    print(f"  -> exit {res['steps'][-1]['exit']}", flush=True)
    print("case 4: terraform destroy", flush=True)
    res["steps"].append(tf("destroy", "-auto-approve", "-input=false"))
    res["afterDestroy"] = chk.nic_view()
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--secret", required=True, help="sp.json, or - to read the same JSON from stdin")
    ap.add_argument("--terraform", required=True)
    ap.add_argument("--tf-work", required=True)
    ap.add_argument("--location", default="northeurope")
    ap.add_argument("--vm-size", default="Standard_B1s")
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--out", default=os.path.join(HERE, "results"))
    ap.add_argument("--lag-reps", type=int, default=0, help="join/leave series per address family (run 2)")
    ap.add_argument("--lag-timeout", type=int, default=150)
    ap.add_argument("--lag-only", action="store_true", help="skip cases 1 to 4")
    a = ap.parse_args()
    secret = json.load(sys.stdin) if a.secret == "-" else json.load(open(a.secret))
    az = Az(secret)

    sub = secret.get("subscriptionId")
    if not sub:
        for _ in range(15):  # a new principal sees its subscription once the role assignment propagated
            subs = az.call("GET", "/subscriptions", api="2022-12-01")[2]["value"]
            if subs:
                break
            print("no subscription visible yet, waiting for the role assignment", flush=True)
            time.sleep(20)
        if len(subs) != 1:
            sys.exit(f"the principal sees {len(subs)} subscriptions; add subscriptionId to the secret")
        sub = subs[0]["subscriptionId"]
    scrub_ids = [x for x in [sub, secret.get("tenant"), secret.get("appId")] if x]

    for ns in ("Microsoft.Network", "Microsoft.Compute"):
        az.call("POST", f"/subscriptions/{sub}/providers/{ns}/register", api="2021-04-01")
    preflight(az, sub, a.location, cores=1)

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
    rg = f"rg-nsgfw-checks-{stamp}"
    rgp = f"/subscriptions/{sub}/resourceGroups/{rg}"
    expires = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).strftime("%Y-%m-%dT%H:%MZ")
    os.makedirs(a.out, exist_ok=True)
    t_start = time.time()
    results = {"check": "T10", "location": a.location, "vmSize": a.vm_size, "netApi": NET_API,
               "started": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "cases": []}
    print(f"resource group {rg} in {a.location}, expires {expires}", flush=True)
    az.call("PUT", rgp, {"location": a.location, "tags": {"purpose": "nsgfw-empirical-checks",
                                                          "expiresOn": expires}}, api="2021-04-01")
    try:
        print("deploying (about 3 minutes)", flush=True)
        _, hdr, _ = az.call("PUT", f"{rgp}/providers/Microsoft.Resources/deployments/t10", {"properties": {
            "mode": "Incremental", "template": template(),
            "parameters": {"location": {"value": a.location}, "vmSize": {"value": a.vm_size},
                           "adminPassword": {"value": secrets.token_urlsafe(24) + "aA1!"}}}}, api="2024-03-01")
        az.wait(hdr, "deployment", timeout=1800, poll=15)
        chk = Check(az, rgp)
        results["baseline"] = {"after": chk.nic_view(), "effective": chk.effective_rules()}
        if not a.lag_only:
            for name, v4, v6 in CASES:
                r = chk.case(name, v4, v6)
                results["cases"].append(r)
                if r["accepted"]:
                    chk.reset()
            try:
                results["cases"].append(terraform_case(chk, a, secret, sub))
            except Exception as e:  # keep cases 1 to 3 if Terraform breaks
                results["cases"].append({"case": "4 azurerm association", "harnessError": str(e)[:2000]})
        if a.lag_reps:
            results["lag"] = {"timeoutSeconds": a.lag_timeout, "series": lag_series(chk, a.lag_reps, a.lag_timeout)}
    finally:
        text = json.dumps(results, indent=1)
        for x in scrub_ids:
            text = text.replace(x, "<redacted>").replace(x.lower(), "<redacted>")
        text = re.sub(re.escape(rg), "<rg>", text, flags=re.I)
        text = GUID.sub("<redacted>", text)
        path = os.path.join(a.out, f"{stamp}-t10-results.json")
        open(path, "w").write(text)
        print(f"saved {path}", flush=True)
        if a.keep:
            print(f"--keep: resource group {rg} left in place, delete it yourself", flush=True)
        else:
            print(f"deleting {rg}", flush=True)
            az.call("DELETE", rgp, api="2021-04-01")
            for _ in range(180):
                if az.call("GET", rgp, api="2021-04-01", ok404=True)[0] == 404:
                    print(f"{rg} deleted", flush=True)
                    break
                time.sleep(20)
            else:
                print(f"{rg} still deleting; check it in the portal", flush=True)
            groups = az.call("GET", f"/subscriptions/{sub}/resourcegroups", api="2021-04-01")[2].get("value", [])
            left = [g["name"] for g in groups if (g.get("tags") or {}).get("purpose") == "nsgfw-empirical-checks"]
            print(f"test resource groups left in the subscription: {left or 'none'}", flush=True)
            print(f"total {round((time.time() - t_start) / 60, 1)} minutes", flush=True)


if __name__ == "__main__":
    main()
