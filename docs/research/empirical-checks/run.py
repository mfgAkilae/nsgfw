#!/usr/bin/env python3
"""Run the empirical checks in a dedicated test subscription. Python standard library only.

  python3 run.py --secret sp.json [--location northeurope] [--other-location swedencentral] [--vm-size Standard_B1s]
                 [--tests T1,T2,T3,T5] [--keep] [--out results/]

sp.json is the output of `az ad sp create-for-rbac` (appId, password, tenant), optionally with
subscriptionId. Without it, the service principal must see exactly one subscription.
Instead of --secret, --az takes tokens from a signed-in Azure CLI.

What it does:
  1. creates the resource group rg-nsgfw-checks-<timestamp>, tagged with an expiry date;
  2. deploys three Linux VMs without inbound access, NSGs, ASGs, a storage account and a
     user-assigned identity with Network Contributor on that resource group;
  3. starts checker.py on vm-a through Run Command and waits for results.json in the storage
     account;
  4. downloads the results with every subscription, tenant and principal ID replaced;
  5. deletes the resource group, also after errors and Ctrl-C (unless --keep).
"""
import argparse
import base64
import datetime as dt
import json
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ARM = "https://management.azure.com"
HERE = os.path.dirname(os.path.abspath(__file__))
NET_API, COMPUTE_API = "2024-05-01", "2024-07-01"
NETWORK_CONTRIBUTOR = "4d97b98b-1d4f-4787-a291-c67834d212e7"


class Az:
    def __init__(self, secret=None, use_az=False):
        self.secret, self.use_az, self.tok = secret, use_az, (None, 0)

    def token(self):
        if self.tok[0] and self.tok[1] - 300 > time.time():
            return self.tok[0]
        if self.use_az:
            out = json.loads(subprocess.check_output(
                ["az", "account", "get-access-token", "--resource", ARM + "/", "-o", "json"]))
            self.tok = (out["accessToken"], int(out.get("expires_on") or time.time() + 1800))
            return self.tok[0]
        s = self.secret
        data = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": s["appId"],
                                       "client_secret": s["password"],
                                       "scope": ARM + "/.default"}).encode()
        r = json.load(urllib.request.urlopen(
            f"https://login.microsoftonline.com/{s['tenant']}/oauth2/v2.0/token", data, timeout=30))
        self.tok = (r["access_token"], time.time() + int(r["expires_in"]))
        return self.tok[0]

    def call(self, method, path=None, body=None, api=None, url=None, ok404=False):
        if url is None:
            url = f"{ARM}{path}{'&' if '?' in path else '?'}api-version={api}"
        data = json.dumps(body).encode() if body is not None else None
        for _ in range(6):
            req = urllib.request.Request(url, data=data, method=method, headers={
                "Authorization": "Bearer " + self.token(), "Content-Type": "application/json"})
            try:
                r = urllib.request.urlopen(req, timeout=120)
                txt = r.read().decode()
                return r.status, {k.lower(): v for k, v in r.headers.items()}, (json.loads(txt) if txt else {})
            except urllib.error.HTTPError as e:
                txt = e.read().decode()
                if e.code == 429 or e.code >= 500:
                    time.sleep(10)
                    continue
                if e.code == 404 and ok404:
                    return 404, {}, {}
                raise RuntimeError(f"{method} {url.split('?')[0]} -> {e.code}: {txt[:3000]}")
        raise RuntimeError(f"{method} {url} kept failing")

    def wait(self, hdr, what, timeout=3600, poll=10):
        aso = hdr.get("azure-asyncoperation")
        if not aso:
            return {}
        t0 = time.time()
        while time.time() - t0 < timeout:
            _, _, j = self.call("GET", url=aso)
            if j.get("status") in ("Succeeded", "Failed", "Canceled"):
                if j["status"] != "Succeeded":
                    raise RuntimeError(f"{what}: {j['status']} {json.dumps(j.get('error'))[:3000]}")
                return j
            time.sleep(poll)
        raise RuntimeError(f"{what}: timeout")


def cloud_init():
    listener = """import socket, threading
def serve(p):
    s = socket.socket()
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", p))
    s.listen(4096)
    while True:
        c, _ = s.accept()
        c.close()
for p in range(5001, 5007):
    threading.Thread(target=serve, args=(p,), daemon=True).start()
threading.Event().wait()
"""
    unit = """[Unit]
Description=nsgfw probe listener
After=network-online.target
[Service]
ExecStart=/usr/bin/python3 /opt/listener.py
Restart=always
[Install]
WantedBy=multi-user.target
"""
    ind = lambda t: "\n".join("      " + line for line in t.splitlines())
    return ("#cloud-config\nwrite_files:\n"
            f"  - path: /opt/listener.py\n    permissions: '0755'\n    content: |\n{ind(listener)}\n"
            f"  - path: /etc/systemd/system/nsgfw-listener.service\n    content: |\n{ind(unit)}\n"
            "runcmd:\n  - [systemctl, daemon-reload]\n  - [systemctl, enable, --now, nsgfw-listener.service]\n")


def template():
    rid = lambda t, n: f"[resourceId('{t}', '{n}')]"
    loc = "[parameters('location')]"
    net = "Microsoft.Network"
    asg = lambda n, l=loc: {"type": f"{net}/applicationSecurityGroups", "apiVersion": NET_API,
                            "name": n, "location": l}
    deny = {"name": "deny-probe-ports", "properties": {
        "priority": 4000, "direction": "Inbound", "access": "Deny", "protocol": "Tcp",
        "sourceAddressPrefix": "*", "sourcePortRange": "*", "destinationAddressPrefix": "*",
        "destinationPortRange": "5001-5006"}}
    open5001 = {"name": "t2-open-5001", "properties": {
        "priority": 200, "direction": "Inbound", "access": "Allow", "protocol": "Tcp",
        "sourceAddressPrefix": "10.90.1.0/24", "sourcePortRange": "*",
        "destinationAddressPrefix": "*", "destinationPortRange": "5001"}}
    nsg = lambda n, rules: {"type": f"{net}/networkSecurityGroups", "apiVersion": NET_API, "name": n,
                            "location": loc, "properties": {"securityRules": rules}}

    def nic(n, subnet, ip, asgs, pip=None):
        ipc = {"subnet": {"id": f"[resourceId('{net}/virtualNetworks/subnets', 'vnet-checks', '{subnet}')]"},
               "privateIPAllocationMethod": "Static", "privateIPAddress": ip,
               "applicationSecurityGroups": [{"id": rid(f"{net}/applicationSecurityGroups", a)} for a in asgs]}
        deps = [rid(f"{net}/virtualNetworks", "vnet-checks")] + [rid(f"{net}/applicationSecurityGroups", a) for a in asgs]
        if pip:
            ipc["publicIPAddress"] = {"id": rid(f"{net}/publicIPAddresses", pip)}
            deps.append(rid(f"{net}/publicIPAddresses", pip))
        return {"type": f"{net}/networkInterfaces", "apiVersion": NET_API, "name": n, "location": loc,
                "dependsOn": deps, "properties": {"ipConfigurations": [{"name": "ipconfig1", "properties": ipc}]}}

    def vm(n, nic_name, custom_data=None, identity=False):
        os_profile = {"computerName": n, "adminUsername": "nsgfw",
                      "adminPassword": "[parameters('adminPassword')]",
                      "linuxConfiguration": {"disablePasswordAuthentication": False}}
        if custom_data:
            os_profile["customData"] = base64.b64encode(custom_data.encode()).decode()
        v = {"type": "Microsoft.Compute/virtualMachines", "apiVersion": COMPUTE_API, "name": n,
             "location": loc, "dependsOn": [rid(f"{net}/networkInterfaces", nic_name)],
             "properties": {
                 "hardwareProfile": {"vmSize": "[parameters('vmSize')]"},
                 "osProfile": os_profile,
                 "storageProfile": {
                     "imageReference": {"publisher": "Canonical", "offer": "ubuntu-24_04-lts",
                                        "sku": "server", "version": "latest"},
                     "osDisk": {"createOption": "FromImage", "deleteOption": "Delete",
                                "managedDisk": {"storageAccountType": "StandardSSD_LRS"}}},
                 "networkProfile": {"networkInterfaces": [
                     {"id": rid(f"{net}/networkInterfaces", nic_name), "properties": {"deleteOption": "Delete"}}]}}}
        if identity:
            v["identity"] = {"type": "UserAssigned", "userAssignedIdentities": {
                rid("Microsoft.ManagedIdentity/userAssignedIdentities", "id-prober"): {}}}
            v["dependsOn"].append(rid("Microsoft.ManagedIdentity/userAssignedIdentities", "id-prober"))
        return v

    mi = rid("Microsoft.ManagedIdentity/userAssignedIdentities", "id-prober")
    st = "[variables('st')]"
    return {
        "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {"location": {"type": "string"}, "otherLocation": {"type": "string"}, "vmSize": {"type": "string"},
                       "adminPassword": {"type": "securestring"}},
        "variables": {"st": "[concat('stnsgfw', uniqueString(resourceGroup().id))]"},
        "resources": [
            {"type": "Microsoft.ManagedIdentity/userAssignedIdentities", "apiVersion": "2023-01-31",
             "name": "id-prober", "location": loc},
            {"type": "Microsoft.Authorization/roleAssignments", "apiVersion": "2022-04-01",
             "name": "[guid(resourceGroup().id, 'id-prober', 'network-contributor')]", "dependsOn": [mi],
             "properties": {
                 "roleDefinitionId": f"[subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '{NETWORK_CONTRIBUTOR}')]",
                 "principalId": f"[reference({mi[1:-1]}, '2023-01-31').principalId]",
                 "principalType": "ServicePrincipal"}},
            {"type": "Microsoft.Storage/storageAccounts", "apiVersion": "2023-05-01", "name": st,
             "location": loc, "kind": "StorageV2", "sku": {"name": "Standard_LRS"},
             "properties": {"minimumTlsVersion": "TLS1_2", "allowBlobPublicAccess": False,
                            "allowSharedKeyAccess": True}},
            {"type": "Microsoft.Storage/storageAccounts/blobServices/containers", "apiVersion": "2023-05-01",
             "name": "[concat(variables('st'), '/default/results')]",
             "dependsOn": ["[resourceId('Microsoft.Storage/storageAccounts', variables('st'))]"]},
            asg("asg-x"), asg("asg-y"), asg("asg-d1"), asg("asg-d2"), asg("asg-other", "[parameters('otherLocation')]"),
            nsg("nsg-src", []), nsg("nsg-dst", [open5001, deny]), nsg("nsg-scratch", []),
            {"type": f"{net}/virtualNetworks", "apiVersion": NET_API, "name": "vnet-checks", "location": loc,
             "dependsOn": [rid(f"{net}/networkSecurityGroups", "nsg-src"), rid(f"{net}/networkSecurityGroups", "nsg-dst")],
             "properties": {"addressSpace": {"addressPrefixes": ["10.90.0.0/16"]}, "subnets": [
                 {"name": "src", "properties": {"addressPrefix": "10.90.1.0/24",
                                                "networkSecurityGroup": {"id": rid(f"{net}/networkSecurityGroups", "nsg-src")}}},
                 {"name": "dst", "properties": {"addressPrefix": "10.90.2.0/24",
                                                "networkSecurityGroup": {"id": rid(f"{net}/networkSecurityGroups", "nsg-dst")}}}]}},
            {"type": f"{net}/publicIPAddresses", "apiVersion": NET_API, "name": "pip-prober", "location": loc,
             "sku": {"name": "Standard"}, "properties": {"publicIPAllocationMethod": "Static"}},
            nic("nic-a", "src", "10.90.1.10", ["asg-x"], pip="pip-prober"),
            nic("nic-b", "dst", "10.90.2.10", ["asg-d1"]),
            nic("nic-c", "dst", "10.90.2.11", []),
            vm("vm-a", "nic-a", identity=True),
            vm("vm-b", "nic-b", custom_data=cloud_init()),
            vm("vm-c", "nic-c", custom_data=cloud_init()),
        ],
        "outputs": {
            "miClientId": {"type": "string", "value": f"[reference({mi[1:-1]}, '2023-01-31').clientId]"},
            "miPrincipalId": {"type": "string", "value": f"[reference({mi[1:-1]}, '2023-01-31').principalId]"},
            "storageAccount": {"type": "string", "value": st},
        },
    }


def run_command(az, vm_path, script):
    st, hdr, _ = az.call("POST", f"{vm_path}/runCommand", {"commandId": "RunShellScript", "script": script},
                         api=COMPUTE_API)
    j = az.wait(hdr, "run command", timeout=1800)
    out = (j.get("properties") or {}).get("output") or {}
    return "\n".join(v.get("message", "") for v in out.get("value", []))


def blob(sas_base, sas, name):
    try:
        return urllib.request.urlopen(f"{sas_base}/{name}?{sas}", timeout=60).read().decode()
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--secret")
    ap.add_argument("--az", action="store_true")
    ap.add_argument("--location", default="northeurope")
    ap.add_argument("--other-location", default="swedencentral")
    ap.add_argument("--vm-size", default="Standard_B1s")
    ap.add_argument("--tests", default="T1,T2,T3,T5")
    ap.add_argument("--flips", type=int, default=20)
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--out", default=os.path.join(HERE, "results"))
    ap.add_argument("--max-minutes", type=int, default=120)
    a = ap.parse_args()
    secret = json.load(open(a.secret)) if a.secret else None
    az = Az(secret, a.az)

    sub = (secret or {}).get("subscriptionId")
    if not sub:
        subs = az.call("GET", "/subscriptions", api="2022-12-01")[2]["value"]
        if len(subs) != 1:
            sys.exit(f"the principal sees {len(subs)} subscriptions; add subscriptionId to the secret file")
        sub = subs[0]["subscriptionId"]
    scrub_ids = [x for x in [sub, (secret or {}).get("tenant"), (secret or {}).get("appId")] if x]

    for ns in ("Microsoft.Network", "Microsoft.Compute", "Microsoft.Storage", "Microsoft.ManagedIdentity"):
        az.call("POST", f"/subscriptions/{sub}/providers/{ns}/register", api="2021-04-01")
    for ns in ("Microsoft.Network", "Microsoft.Compute", "Microsoft.Storage", "Microsoft.ManagedIdentity"):
        for _ in range(60):
            if az.call("GET", f"/subscriptions/{sub}/providers/{ns}", api="2021-04-01")[2].get("registrationState") == "Registered":
                break
            time.sleep(10)

    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
    rg = f"rg-nsgfw-checks-{stamp}"
    rgp = f"/subscriptions/{sub}/resourceGroups/{rg}"
    expires = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).strftime("%Y-%m-%dT%H:%MZ")
    os.makedirs(a.out, exist_ok=True)
    t_start = time.time()
    print(f"resource group {rg} in {a.location}, expires {expires}", flush=True)
    az.call("PUT", rgp, {"location": a.location, "tags": {"purpose": "nsgfw-empirical-checks",
                                                          "expiresOn": expires}}, api="2021-04-01")
    try:
        password = secrets.token_urlsafe(24) + "aA1!"
        print("deploying (about 5 minutes)", flush=True)
        _, hdr, _ = az.call("PUT", f"{rgp}/providers/Microsoft.Resources/deployments/checks", {"properties": {
            "mode": "Incremental", "template": template(),
            "parameters": {"location": {"value": a.location}, "otherLocation": {"value": a.other_location}, "vmSize": {"value": a.vm_size},
                           "adminPassword": {"value": password}}}}, api="2024-03-01")
        az.wait(hdr, "deployment", timeout=3600, poll=15)
        outs = az.call("GET", f"{rgp}/providers/Microsoft.Resources/deployments/checks", api="2024-03-01")[2]["properties"]["outputs"]
        mi_client, mi_principal, sa = (outs[k]["value"] for k in ("miClientId", "miPrincipalId", "storageAccount"))
        scrub_ids += [mi_client, mi_principal]
        expiry = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ")
        sas = az.call("POST", f"{rgp}/providers/Microsoft.Storage/storageAccounts/{sa}/ListServiceSas", {
            "canonicalizedResource": f"/blob/{sa}/results", "signedResource": "c", "signedPermission": "rcwl",
            "signedProtocol": "https", "signedExpiry": expiry}, api="2023-05-01")[2]["serviceSasToken"]
        sas_base = f"https://{sa}.blob.core.windows.net/results"
        cfg = {"subscriptionId": sub, "resourceGroup": rg, "miClientId": mi_client, "srcPrefix": "10.90.1.0/24",
               "targets": {"b": "10.90.2.10", "c": "10.90.2.11"}, "sasUrl": f"{sas_base}?{sas}",
               "tests": a.tests.split(","), "flips": a.flips, "flips_large": max(a.flips // 2, 4),
               "flips_nic": max(a.flips // 2, 4), "vmSize": a.vm_size, "location": a.location}
        code = base64.b64encode(open(os.path.join(HERE, "checker.py"), "rb").read()).decode()
        cfgb = base64.b64encode(json.dumps(cfg).encode()).decode()
        print("starting checker on vm-a", flush=True)
        print(run_command(az, f"{rgp}/providers/Microsoft.Compute/virtualMachines/vm-a", [
            f"echo {code} | base64 -d > /opt/checker.py",
            f"echo {cfgb} | base64 -d > /opt/checker.json",
            "nohup python3 /opt/checker.py /opt/checker.json > /var/log/nsgfw-checker.log 2>&1 &",
            "sleep 2; echo started; tail -n 5 /var/log/nsgfw-checker.log"]), flush=True)
        seen = None
        while time.time() - t_start < a.max_minutes * 60:
            time.sleep(30)
            status = blob(sas_base, sas, "status.json")
            if status and status != seen:
                print(f"{time.strftime('%H:%M:%S')} status {status}", flush=True)
                seen = status
            if status and "finished" in json.loads(status):
                break
        for name in ("results.json", "checker.log"):
            text = blob(sas_base, sas, name) or ""
            for x in scrub_ids:
                text = text.replace(x, "<redacted>").replace(x.lower(), "<redacted>")
            text = re.sub(re.escape(rg), "<rg>", text, flags=re.I)
            text = re.sub(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
                          "<redacted>", text)
            path = os.path.join(a.out, f"{stamp}-{name}")
            open(path, "w").write(text)
            print(f"saved {path}", flush=True)
    finally:
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
            print(f"total {round((time.time() - t_start) / 60, 1)} minutes", flush=True)


if __name__ == "__main__":
    main()
