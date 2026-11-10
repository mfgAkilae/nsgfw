#!/usr/bin/env python3
"""T6: does MSAL Node redeem an authorization code with a user-assigned managed identity token
as client assertion (managed identity as federated identity credential) in Azure Container Apps?

  python3 t6.py deploy --secret sp.json                      # identity, environment, app
  python3 t6.py client --secret sp.json --client-id-file F   # set the app registration's client ID
  python3 t6.py result --secret sp.json                      # client credentials call, then /result
  python3 t6.py delete --secret sp.json

The human creates the app registration (see ../empirical-checks.md, T6) between deploy and client.
State (resource group, FQDN) is kept in --state (default t6-state.json in the current directory).
"""
import argparse
import base64
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import Az  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
GUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
CMD = ("mkdir -p /app && cd /app && npm init -y >/dev/null && "
       "npm i --no-fund --no-audit @azure/msal-node > /tmp/npm.log 2>&1; "
       "echo \"$APP_B64\" | base64 -d > app.mjs && exec node app.mjs")


def template():
    mi = "resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', 'id-nsgfw-t6')"
    env = "resourceId('Microsoft.App/managedEnvironments', 'cae-nsgfw-t6')"
    app = "resourceId('Microsoft.App/containerApps', 'ca-nsgfw-t6')"
    loc = "[parameters('location')]"
    return {
        "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
        "contentVersion": "1.0.0.0",
        "parameters": {"location": {"type": "string"}, "tenantId": {"type": "string"},
                       "clientId": {"type": "string"}, "appB64": {"type": "string"}},
        "resources": [
            {"type": "Microsoft.ManagedIdentity/userAssignedIdentities", "apiVersion": "2023-01-31",
             "name": "id-nsgfw-t6", "location": loc},
            {"type": "Microsoft.App/managedEnvironments", "apiVersion": "2024-03-01",
             "name": "cae-nsgfw-t6", "location": loc, "properties": {}},
            {"type": "Microsoft.App/containerApps", "apiVersion": "2024-03-01", "name": "ca-nsgfw-t6",
             "location": loc, "dependsOn": [f"[{mi}]", f"[{env}]"],
             "identity": {"type": "UserAssigned", "userAssignedIdentities": {f"[{mi}]": {}}},
             "properties": {
                 "managedEnvironmentId": f"[{env}]",
                 "configuration": {"activeRevisionsMode": "Single",
                                   "ingress": {"external": True, "targetPort": 3000, "transport": "auto"}},
                 "template": {
                     "containers": [{
                         "name": "app", "image": "docker.io/library/node:22-alpine",
                         "command": ["/bin/sh", "-c"], "args": [CMD],
                         "env": [{"name": "APP_B64", "value": "[parameters('appB64')]"},
                                 {"name": "TENANT_ID", "value": "[parameters('tenantId')]"},
                                 {"name": "CLIENT_ID", "value": "[parameters('clientId')]"},
                                 {"name": "UAMI_CLIENT_ID", "value": f"[reference({mi}, '2023-01-31').clientId]"}],
                         "resources": {"cpu": 0.25, "memory": "0.5Gi"}}],
                     "scale": {"minReplicas": 1, "maxReplicas": 1}}}},
        ],
        "outputs": {
            "fqdn": {"type": "string", "value": f"[reference({app}, '2024-03-01').configuration.ingress.fqdn]"},
            "miPrincipalId": {"type": "string", "value": f"[reference({mi}, '2023-01-31').principalId]"},
        },
    }


def deploy(az, sub, rg, location, tenant, client_id):
    rgp = f"/subscriptions/{sub}/resourceGroups/{rg}"
    app_b64 = base64.b64encode(open(os.path.join(HERE, "t6-app.mjs"), "rb").read()).decode()
    _, hdr, _ = az.call("PUT", f"{rgp}/providers/Microsoft.Resources/deployments/t6", {"properties": {
        "mode": "Incremental", "template": template(),
        "parameters": {"location": {"value": location}, "tenantId": {"value": tenant},
                       "clientId": {"value": client_id}, "appB64": {"value": app_b64}}}}, api="2024-03-01")
    az.wait(hdr, "deployment", timeout=1800, poll=15)
    out = az.call("GET", f"{rgp}/providers/Microsoft.Resources/deployments/t6", api="2024-03-01")[2]
    return {k: v["value"] for k, v in out["properties"]["outputs"].items()}


def get(url):
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["deploy", "client", "result", "delete"])
    ap.add_argument("--secret", required=True)
    ap.add_argument("--location", default="northeurope")
    ap.add_argument("--client-id-file")
    ap.add_argument("--state", default="t6-state.json")
    a = ap.parse_args()
    secret = json.load(open(a.secret))
    az = Az(secret)
    sub = secret.get("subscriptionId") or az.call("GET", "/subscriptions", api="2022-12-01")[2]["value"][0]["subscriptionId"]
    state = json.load(open(a.state)) if os.path.exists(a.state) else {}

    if a.action == "deploy":
        az.call("POST", f"/subscriptions/{sub}/providers/Microsoft.App/register", api="2021-04-01")
        for _ in range(60):
            if az.call("GET", f"/subscriptions/{sub}/providers/Microsoft.App", api="2021-04-01")[2].get("registrationState") == "Registered":
                break
            time.sleep(10)
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
        rg = f"rg-nsgfw-t6-{stamp}"
        expires = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).strftime("%Y-%m-%dT%H:%MZ")
        az.call("PUT", f"/subscriptions/{sub}/resourceGroups/{rg}", {"location": a.location, "tags": {
            "purpose": "nsgfw-empirical-checks", "expiresOn": expires}}, api="2021-04-01")
        state = {"rg": rg}
        json.dump(state, open(a.state, "w"))
        out = deploy(az, sub, rg, a.location, secret["tenant"], "unset")
        state.update(fqdn=out["fqdn"])
        json.dump(state, open(a.state, "w"))
        # printed for the human's app registration; never written to the repo
        print(json.dumps({"resourceGroup": rg, "redirectUri": f"https://{out['fqdn']}/redirect",
                          "managedIdentityObjectId": out["miPrincipalId"], "tenantId": secret["tenant"]}, indent=1))
    elif a.action == "client":
        client_id = open(a.client_id_file).read().strip()
        deploy(az, sub, state["rg"], a.location, secret["tenant"], client_id)
        for _ in range(40):
            st, body = get(f"https://{state['fqdn']}/result")
            if st == 200 and json.loads(body).get("configured"):
                print(f"configured; sign in at https://{state['fqdn']}/")
                break
            time.sleep(15)
        else:
            print("the new revision did not report configured within 10 minutes")
    elif a.action == "result":
        print("client credentials:", GUID.sub("<guid>", get(f"https://{state['fqdn']}/cc")[1]))
        st, body = get(f"https://{state['fqdn']}/result")
        print(GUID.sub("<guid>", body))
    elif a.action == "delete":
        rgp = f"/subscriptions/{sub}/resourceGroups/{state['rg']}"
        az.call("DELETE", rgp, api="2021-04-01")
        for _ in range(90):
            if az.call("GET", rgp, api="2021-04-01", ok404=True)[0] == 404:
                print(f"{state['rg']} deleted")
                break
            time.sleep(20)


if __name__ == "__main__":
    main()
