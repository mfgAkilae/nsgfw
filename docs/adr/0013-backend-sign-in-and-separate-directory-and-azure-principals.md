# Sign-in through the backend, with directory and Azure access on separate principals

Status: accepted (2026-11-09, [Grilling: Hosting, identity and least-privilege role](https://github.com/mfgAkilae/nsgfw/issues/20))

The brief fixes Entra ID sign-in, a managed identity in Azure, a service principal with a certificate on-premises, one container image for both runtimes, and no secrets in code or configuration. [Research: Hosting and identity options](https://github.com/mfgAkilae/nsgfw/issues/8) showed that Container Apps built-in authentication documents only a client secret and does not exist on-premises, and that only a user-assigned managed identity can be the federated identity credential of an app registration. The tool also calls Microsoft Graph to resolve the group memberships behind Roles ([ADR 0012](0012-access-follows-coverage.md)) and to look up principals.

We decided:

- **Sign-in is a backend-for-frontend.** The server runs the authorization code flow with PKCE through MSAL Node as a confidential client. It keeps a server-side session in PostgreSQL behind an httpOnly cookie, valid for 8 hours and ended after 60 minutes without activity. Tokens never reach the browser. The server keeps no user access tokens: it calls Graph with application permissions and Azure through the Tool identity, so it needs no distributed MSAL token cache. An Approval, an Emergency Commit and a change to Role assignments require a sign-in that is at most 15 minutes old (OIDC `max_age`). RFC 10017 (OAuth 2.0 for Browser-Based Applications) ranks this pattern as the most secure of the three it describes.
- **Two principals with separate jobs.** The tool's app registration holds sign-in, the API audience, the `InstanceAdmin` app role and the Graph application permissions. The API accepts session cookies, client-credential tokens of service principals and managed identities, and delegated tokens through one exposed scope, with the Azure CLI pre-authorized. The Tool identity holds Azure roles only.
- **No stored credential in Azure.** The Tool identity is a user-assigned managed identity, and the same identity is the federated identity credential of the app registration. If MSAL Node cannot redeem an authorization code with that assertion, the fallback is a certificate with a non-exportable key in Key Vault, whose assertion Key Vault signs. A client secret is not the fallback.
- **One certificate on-premises.** The app registration's service principal is the Tool identity. Its certificate is a PEM file, mounted read-only into the container, without a key password. Rotation adds a second certificate to the app registration, swaps the file and removes the old certificate. The Azure SDK reads the file again on every token request, so rotation needs no restart. The tool warns 30 days before the certificate expires. The code keeps two credential slots, so an operator can still configure separate identities.
- **"Assignment required" stays off** on the enterprise application. The tool's own Role assignments decide every request. A principal without a Role gets no access, and the denied action is audited.

## Considered Options

- **Container Apps built-in authentication.** Rejected. It needs a client secret, exists only in Azure, and would give the image two sign-in paths.
- **Single-page app with MSAL Browser and bearer tokens.** Rejected. Access and refresh tokens would live in the browser.
- **Graph permissions on the Tool identity.** Rejected. The two runtimes would differ, and the identity that writes Azure would also read the directory.
- **Separate service principals on-premises by default.** Rejected. It means two certificates to rotate, while both sit in the same container anyway. It stays possible through configuration.
- **"Assignment required" on.** Rejected. Roles would be maintained in two places, and assigning groups needs Entra ID P1 and does not resolve nested groups.

## Consequences

- Granting Graph app roles needs the Entra role Privileged Role Administrator. The `instance` Terraform module grants them, or, when its runner lacks that role, emits a script for a privileged admin.
- Every service principal and managed identity in the tenant can obtain a token for the API. Only the tool's Role check stops it, so every endpoint must apply that check.
- The managed identity as federated credential in the authorization code flow is not documented for Node.js. The empirical checks verify it before the increment plan.
