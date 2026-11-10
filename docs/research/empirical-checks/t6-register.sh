#!/usr/bin/env bash
# T6, the human's part: register the test app, trust the managed identity as its only
# credential, and tell the Container App the client ID. Safe to run again.
#
# Usage (Cloud Shell, PowerShell or Bash, signed in as yourself):
#   curl -sSL <raw URL of this file> | bash -s -- <subscription-id> <tenant-id> <managed-identity-object-id> <app-fqdn> <resource-group>
set -euo pipefail
SUB=$1 TENANT=$2 MI=$3 FQDN=$4 RG=$5
NAME=nsgfw-t6-msal-check

az config set extension.use_dynamic_install=yes_without_prompt --only-show-errors
az account set --subscription "$SUB"

APP_ID=$(az ad app list --display-name "$NAME" --query "[0].appId" -o tsv)
if [ -z "$APP_ID" ]; then
  APP_ID=$(az ad app create --display-name "$NAME" --sign-in-audience AzureADMyOrg \
    --web-redirect-uris "https://$FQDN/redirect" --query appId -o tsv)
  echo "Created app registration $NAME"
  sleep 20
else
  echo "App registration $NAME already exists"
fi

if [ -z "$(az ad app federated-credential list --id "$APP_ID" --query "[?name=='t6-managed-identity'].name" -o tsv)" ]; then
  az ad app federated-credential create --id "$APP_ID" -o none --parameters \
    "{\"name\":\"t6-managed-identity\",\"issuer\":\"https://login.microsoftonline.com/$TENANT/v2.0\",\"subject\":\"$MI\",\"audiences\":[\"api://AzureADTokenExchange\"]}"
  echo "Added the managed identity as federated credential"
fi

az ad sp show --id "$APP_ID" -o none 2>/dev/null || az ad sp create --id "$APP_ID" -o none
echo "Updating the Container App (about one minute)"
az containerapp update -g "$RG" -n ca-nsgfw-t6 --set-env-vars "CLIENT_ID=$APP_ID" -o none
echo "Done. Now open https://$FQDN/ and sign in."
