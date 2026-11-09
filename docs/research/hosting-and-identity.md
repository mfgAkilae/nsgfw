# Research: Hosting and identity options

- Ticket: GitHub issue #8, "Research: Hosting and identity options"
- Retrieval date of every source: 2026-11-09
- Scope: facts and options only. This note makes no design decisions for nsgfw.

## Question

Which identity and secret-handling options do Azure Container Apps, Azure Database for PostgreSQL and Entra ID offer for nsgfw, in Azure and on-premises?

Fixed by the brief (`docs/brief.md`) and not re-examined here: one container image for Azure Container Apps and on-premises; Node.js backend, React frontend; PostgreSQL; Entra ID sign-in; managed identity in Azure, service principal with certificate on-premises; no secrets in code or configuration, Key Vault where secrets are unavoidable.

Assumptions made for this note:

- "On-premises" means a container runtime outside Azure: a plain container host (Docker or similar) or a Kubernetes cluster. Where an option needs Azure Arc, the note says so.
- "Standard PostgreSQL on-premises" means community PostgreSQL. The PostgreSQL project's own documentation is used as the primary source for it.

## Summary

- **Container Apps managed identity.** An app has at most one system-assigned identity and any number of user-assigned identities, both at once if needed. Code gets tokens from a local endpoint (`IDENTITY_ENDPOINT` plus `X-IDENTITY-HEADER`). Microsoft calls user-assigned identities the recommended type and notes that role assignments can be created before the app exists. Tokens are cached per resource for about 24 hours and cannot be force-refreshed.
- **Built-in authentication (Easy Auth) in Container Apps** runs as a sidecar and injects identity headers. For the Entra provider, the Container Apps docs document only a client secret (stored as a Container Apps secret). The "managed identity instead of a secret" option is documented for App Service only. Role checks stay in app code. It is a platform feature; nothing documents it outside Container Apps.
- **In-app sign-in with MSAL Node** works the same everywhere. A confidential client can use a secret, a certificate (PEM private key, SHA-256 thumbprint) or a client-assertion callback. MSAL's default token cache is in memory, and Microsoft says it does not scale for production web apps.
- **Azure Database for PostgreSQL flexible server** accepts an Entra access token (scope `https://ossrdbms-aad.database.windows.net/.default`) as the password. Roles for managed identities are created with `pgaadauth_create_principal` or `pgaadauth_create_principal_with_oid`. `node-postgres` accepts `password` as a sync or async function, called when a new physical connection authenticates. The pool option `maxLifetimeSeconds` retires connections. The documented token lifetimes conflict (see Uncertain).
- **On-premises tool identity.** `ClientCertificateCredential` in `@azure/identity` accepts only PEM (path or in-memory string, optional password). It has no Windows certificate store or PFX path. Alternatives without a stored credential exist only with Azure Arc: managed identity on Arc-enabled servers (local endpoint, group membership required) or workload identity federation on Arc-enabled Kubernetes (preview).
- **On-premises PostgreSQL** has no Entra authentication. Its options include `scram-sha-256` passwords, client-certificate authentication (`cert`), GSSAPI and others. `node-postgres` supports client certificates through its `ssl` option.
- **Entra app registration.** Credentials can be secrets, certificates or federated identity credentials (FIC). A user-assigned managed identity can act as a FIC of an app registration in the same tenant (max 20 FICs per app). App roles appear in the `roles` claim. Group claims overflow above 200 groups in a JWT, after which the app must query Microsoft Graph. Microsoft recommends app roles over groups for new apps that do not need nested groups.
- **Key Vault.** Azure RBAC is the default access model for new vaults (API 2026-02-01 and later). Container Apps can reference Key Vault secrets through a managed identity, as environment variables or as files in a volume. Versionless references refresh within 30 minutes. A process outside Azure needs a credential to reach Key Vault, so Key Vault alone does not remove the on-premises bootstrap credential.

## Findings

### 1. Container Apps: managed identity

#### System-assigned vs. user-assigned

| Property | System-assigned | User-assigned | Source |
|---|---|---|---|
| Lifecycle | "tied to your container app and is deleted when your container app is deleted" | "exist until you delete them" | [ACA managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity#why-use-a-managed-identity) |
| Count per app | "An app can only have one system-assigned identity." | "A container app can have multiple user-assigned identities." | same |
| Combination | "An application can have both system-assigned and user-assigned identities at the same time." | | [ACA managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity#add-a-user-assigned-identity) |
| Sharing | "Can't be shared." | "Can be shared." | [MI overview](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview#differences-between-system-assigned-and-user-assigned-managed-identities) |
| Role assignments before the app exists | "role assignments can't be created in advance" | "can be configured in advance of the resources that require them" | [MI best practices](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/managed-identity-best-practice-recommendations#choosing-system-or-user-assigned-managed-identities) |

Further statements:

- Microsoft recommendation: "User-assigned managed identities ... are the recommended managed identity type for Microsoft services." ([MI overview](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview#managed-identity-types)). The best-practice page names two cases for system-assigned: logging which specific resource acted, and removing permissions together with the resource ([MI best practices](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/managed-identity-best-practice-recommendations#choosing-system-or-user-assigned-managed-identities)).
- Container Apps use cases: system-assigned is "best for workloads that are contained within a single resource"; user-assigned is "ideal for workloads that run on multiple resources ... need pre-authorization to a secure resource" ([ACA managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity#common-use-cases)).
- Adding or removing an identity on a running app: "the app doesn't automatically restart and a new revision isn't created" ([ACA managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity#configure-managed-identities)).
- "Role assignments aren't automatically deleted when either system-assigned or user-assigned managed identities are deleted." ([MI best practices](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/managed-identity-best-practice-recommendations#maintenance))
- A system-assigned identity cannot be used in `az containerapp create` for Key Vault references, "because it's not available until after the container app is created" ([ACA secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets#reference-secret-from-key-vault)).

#### Getting tokens in code

- Environment variables: `IDENTITY_ENDPOINT` ("Local URL from which your container app can request tokens") and `IDENTITY_HEADER` ("A header used to help mitigate server-side request forgery (SSRF) attacks. The value is rotated by the platform.") ([ACA managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity#rest-endpoint-reference)).
- Request: `GET ${IDENTITY_ENDPOINT}?resource=<resource>&api-version=2019-08-01` with header `X-IDENTITY-HEADER`. api-version "2019-08-01" or later. A user-assigned identity is selected with exactly one of `client_id`, `principal_id`/`object_id` or `mi_res_id`. "If all ID parameters ... are omitted, the system-assigned identity is used." (same source)
- "When using Azure Identity client library, you need to explicitly specify the user-assigned managed identity client ID." ([ACA managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity#connect-to-azure-services-in-app-code))
- The `@azure/identity` guidance for deployed apps: "replace `DefaultAzureCredential` with a specific `TokenCredential` implementation, such as `ManagedIdentityCredential`" ([JS credential chains](https://learn.microsoft.com/en-us/azure/developer/javascript/sdk/authentication/credential-chains#usage-guidance-for-defaultazurecredential)). `AZURE_TOKEN_CREDENTIALS` can restrict `DefaultAzureCredential` to `prod`/`dev` categories or, from `@azure/identity` 4.11.0, to one named credential (same page).
- `@azure/identity` delegates managed identity source detection to `@azure/msal-node` (`ManagedIdentityApplication`) ([source: managedIdentityCredential/index.ts](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/src/credentials/managedIdentityCredential/index.ts)). The MSAL Node managed identity doc lists App Service, Azure VMs, Azure Arc, Cloud Shell, Service Fabric and Azure Machine Learning as sources; Container Apps is not named in that list ([msal-node managed-identity.md](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/managed-identity.md)). The Container Apps endpoint uses the same `IDENTITY_ENDPOINT`/`IDENTITY_HEADER`/`2019-08-01` contract that MSAL lists for App Service; the mapping is not stated explicitly.

#### Limitations

- Token cache and refresh: "The back-end services for managed identities maintain a cache per resource URI for around 24 hours." "Forcing a token refresh isn't supported." ([ACA managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity#configure-a-target-resource)). "it can take several hours for changes to a managed identity's group or role membership to take effect" ([MI best practices](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/managed-identity-best-practice-recommendations#limitation-of-using-managed-identities-for-authorization)).
- Init containers: "Init containers can't access managed identities in consumption-only environments and dedicated workload profile environments." ([ACA managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity#limitations)). Per-phase availability (`identitySettings` with `Init`, `Main`, `All`, `None`) needs API version `2024-02-02-preview` or later ([ACA managed identity](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity#control-managed-identity-availability)).
- Image pull from Azure Container Registry: user-assigned or system-assigned identity; "When possible, you should use a user-assigned managed identity to pull images." An identity used only for pulls can be hidden from container code (`lifecycle: None`) ([ACA image pull](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull)).
- Rapid creation of system-assigned identities can hit the Entra object-creation rate limit (HTTP 429); a deleted system-assigned identity counts towards the limit until purged after 30 days ([MI best practices](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/managed-identity-best-practice-recommendations#choosing-system-or-user-assigned-managed-identities)).

### 2. Container Apps: built-in authentication vs. in-app MSAL

#### Built-in authentication (Easy Auth)

- Architecture: "runs as a sidecar container on each replica in your application", "isolated from your application code"; it "Injects identity information into HTTP request headers" ([ACA authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication#feature-architecture)). "Azure Container Apps uses the same authentication and authorization system as Azure App Service", with "some differences" that the page does not list as a set (same page).
- Headers: "External requests aren't allowed to set these headers, so they're present only if set by Container Apps." Named examples: `X-MS-CLIENT-PRINCIPAL-NAME`, `X-MS-CLIENT-PRINCIPAL-ID`. Access tokens such as `X-MS-TOKEN-AAD-ACCESS-TOKEN` require the token store ([ACA authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication#access-user-claims-in-application-code)). The Container Apps pages do not name `X-MS-CLIENT-PRINCIPAL` (the Base64 JSON of claims); that header is documented for App Service ([App Service user identities](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities)).
- HTTPS only: "Ensure allowInsecure is disabled on your container app's ingress configuration." ([ACA authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication#considerations-for-using-built-in-authentication))
- Unauthenticated requests: "Allow unauthenticated access" defers to app code; "Require authentication" rejects unauthenticated traffic (browser redirect to `/.auth/login/<provider>`, or 401/403) and "applies to all requests to your app". No excluded-path setting is described ([ACA authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication#authorization-behavior)).
- Tenant: "By default, any user in your Microsoft Entra tenant can request a token for your application" ([ACA authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication)).
- Entra provider credential: "A client secret is created and stored as a secret in the container app." "When the client secret isn't set, implicit flow is used and only an ID token is returned." No certificate, managed identity or FIC option is described ([ACA Entra provider](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra#option-1-create-a-new-app-registration-automatically)).
- For App Service only, Microsoft documents "Use a managed identity instead of a secret": the app registration trusts a managed identity through a federated identity credential used "as a client assertion"; "available only for workforce configurations" ([App Service Entra provider](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-provider-aad#use-a-managed-identity-instead-of-a-secret)). App Service also documents `allowedApplications`, a tenant allow-list and a built-in authorization policy. The Container Apps pages mention none of these.
- Bearer tokens for APIs: daemon clients present tokens in the `Authorization` header and "Container Apps authentication/authorization validates and uses the token as usual"; app roles in the `roles` claim must be checked in app code: "The Container Apps authentication layer doesn't perform the validation steps." ([ACA Entra provider](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra#configure-client-apps-to-access-your-container-app))
- Token store: needs "an Azure Storage account with a private blob container" and a SAS URL with read, write and delete permissions, stored as a Container Apps secret. Managed identity access to the blob is not mentioned. It "caches ID tokens, access tokens, and refresh tokens" ([ACA token store](https://learn.microsoft.com/en-us/azure/container-apps/token-store)).
- Availability outside Container Apps: the pages make no statement. The module is part of the Container Apps platform (sidecar), so the on-premises deployment of the same image would not have it. This is an inference, not a documented statement.

#### In-app sign-in with MSAL Node

- Confidential client credentials: `clientSecret`; `clientCertificate` with `thumbprintSha256` ("a X.509 SHA-256 thumbprint"), `privateKey` ("the PEM encoded private key") and optional `x5c`; or `clientAssertion` as a string or callback ([msal-node initialize-confidential-client-application.md](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/initialize-confidential-client-application.md)).
- The client-assertion callback "is invoked every time MSAL needs to acquire a token from the token issuer"; "App developers are responsible for the assertion lifetime" (same source). This is the hook through which a federated credential (for example a managed identity token, see section 4) can be supplied. No MSAL Node doc or sample for the managed-identity-as-FIC case was found.
- PFX: MSAL Node docs only describe converting PFX to PEM (`openssl pkcs12 ...` or `node-forge`, since "Node.js offers no native method for this"). Encrypted keys must be decrypted before use. Certificates "should never be stored in the project's directory"; production should use Key Vault ([msal-node certificate-credentials.md](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/certificate-credentials.md)). SHA-1 thumbprints are deprecated since msal-node 2.11.0 ([msal-node CHANGELOG](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/CHANGELOG.md)).
- Web app flow (Microsoft Learn tutorial): `getAuthCodeUrl`, then `acquireTokenByCode`, with PKCE (`S256`) and `responseMode: 'form_post'`; the tutorial keeps account and serialized token cache in the Express session. The tutorial uses `clientSecret` ([Learn: Node.js web app sign-in](https://learn.microsoft.com/en-us/entra/identity-platform/tutorial-web-app-node-sign-in-sign-out)).
- Token cache: "MSAL's in-memory token cache does not scale for production"; for web apps Microsoft recommends "the distributed token caching pattern" (for example Redis or SQL) through `ICachePlugin`, partitioned per user (`<userObjectId>.<tenantId>`), encrypted when persisted ([msal-node caching.md](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/caching.md)).
- Version at retrieval: msal-node 7.2.0 (2026-11-05) ([msal-node CHANGELOG](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/CHANGELOG.md)).

### 3. Azure Database for PostgreSQL flexible server: Entra authentication

Note: the `flexible-server/...` URLs below now carry canonical URLs under `/azure/postgresql/security/...`.

#### Server and roles

- Modes: "PostgreSQL authentication only, Microsoft Entra authentication only, and both" ([PG Entra concepts](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-azure-ad-authentication)).
- Entra administrators: "can be a Microsoft Entra user, Microsoft Entra group, service principal, or managed identity"; one during provisioning, many afterwards. Enabling Entra authentication enables the `PGAadAuth` extension and restarts the server (same source). Microsoft advises not to use the Entra administrator for regular operations ([PG configure Entra](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-configure-sign-in-azure-ad-authentication)).
- Roles: `pgaadauth_create_principal(roleName, isAdmin, isMfa)` where the name "must match the name of the Microsoft Entra principal" (display name for groups and service principals); or `pgaadauth_create_principal_with_oid(roleName, objectId, objectType, isAdmin, isMfa)` with `objectType` `user`, `group` or `service` ([PG manage Entra users](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-manage-azure-ad-users)). The Container Apps tutorial uses the `_with_oid` variant with the system-assigned identity's principal ID ([ACA + PostgreSQL tutorial](https://learn.microsoft.com/en-us/azure/container-apps/tutorial-java-quarkus-connect-managed-identity-postgresql-database)).
- Matching: "Azure Database for PostgreSQL matches access tokens to the database role by using the user's unique Microsoft Entra user ID, as opposed to using the username." ([PG Entra concepts](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-azure-ad-authentication))
- Groups: with `pgaadauth.enable_group_sync = ON`, "Groups autosync every 30 minutes"; "Managed identities and service principals are supported as group members" ([PG configure Entra](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-configure-sign-in-azure-ad-authentication)).
- Networking with private access: "Add an outbound NSG rule that allows traffic to the `AzureActiveDirectory` service tag"; with custom DNS, `login.microsoftonline.com` and `graph.microsoft.com` must resolve publicly (same source).

#### Token as password

- Scope: `https://ossrdbms-aad.database.windows.net/.default` (resource `https://ossrdbms-aad.database.windows.net`) ([PG connect with MI](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-connect-with-managed-identity)). The token is used as the password and the role name as the user name (same source). Examples use `sslmode=require`; no page states in plain words that TLS is mandatory.
- Lifetime, as documented (conflicting): "User tokens are valid for up to 1 hour. Tokens for system-assigned managed identities are valid for up to 24 hours." ([PG Entra concepts](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-azure-ad-authentication)) versus "The access token is valid for 5 to 60 minutes." ([PG configure Entra](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-configure-sign-in-azure-ad-authentication)). The general Entra default for access tokens is "a random value ranging between 60-90 minutes", and "Configuring token lifetimes for managed identity service principals isn't supported." ([Entra configurable token lifetimes](https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes#access-tokens)).
- Open connections after token expiry: not stated. The only related statement: "The deleted Microsoft Entra user can still sign in until the token expires" ([PG Entra concepts](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-azure-ad-authentication)).
- Microsoft's only Node.js sample (Service Connector) fetches one token with `@azure/identity` and passes it as a string `password` to a single `pg` `Client`; it shows no refresh and no pool ([Service Connector: PostgreSQL](https://learn.microsoft.com/en-us/azure/service-connector/how-to-integrate-postgres)). The Flexible Server Node.js quickstart URL `.../flexible-server/connect-nodejs` returned 404.

#### Token refresh with `node-postgres` (`pg`)

- `password` may be a function: "node-postgres supports dynamic passwords via a callback function, either synchronous or asynchronous. The callback function must resolve to a string." The documented example passes it to a `Pool` ([node-postgres: connecting](https://node-postgres.com/features/connecting)). Added in pg 7.12.0; since pg 8.19.0 the callback receives the connection parameters ([pg CHANGELOG](https://github.com/brianc/node-postgres/blob/master/CHANGELOG.md)).
- Call site: `Client._getPassword` checks `typeof this.password === 'function'` and is reached only from the server's authentication requests (cleartext, MD5, SASL) ([pg client.js](https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js)). Reading of the code: the function runs once per new physical connection, not per query.
- Pool: "The config passed to the pool is also passed to every client instance within the pool" ([node-postgres: pool](https://node-postgres.com/apis/pool)). `maxLifetimeSeconds` "Sets a max overall life for the connection", default disabled (0), added in pg-pool 3.5.0 / pg 8.8.0. `idleTimeoutMillis` defaults to 10000. A client cannot reconnect ("You cannot reuse a client"), so rotation means new clients (same sources and [pg-pool index.js](https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/index.js)).
- `pgpass` file support "is deprecated and will be removed in pg@9.0" in favour of an async password function ([pg client.js](https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js)).
- Latest minor in the CHANGELOG at retrieval: pg 8.23.0.

### 4. On-premises

#### Service principal with certificate (`ClientCertificateCredential`)

- Format: "Enables authentication to Microsoft Entra ID using a PEM-encoded certificate"; the file must contain "both the public and private keys" ([ClientCertificateCredential](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatecredential)). The source reads the file as UTF-8 and parses PEM; there is no PFX path ([source: clientCertificateCredential.ts](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/src/credentials/clientCertificateCredential.ts)).
- Input: a file path (`certificatePath`) or an in-memory PEM string (`certificate`), not both; `certificatePassword` decrypts an encrypted key (object-configuration overloads only) ([ClientCertificatePEMCertificate](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatepemcertificate), [ClientCertificatePEMCertificatePath](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatepemcertificatepath)).
- `sendCertificateChain` adds the `x5c` header for subject name/issuer authentication ([ClientCertificateCredentialOptions](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatecredentialoptions)).
- `getToken` re-reads the certificate file on every call before delegating to MSAL ([source](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/src/credentials/clientCertificateCredential.ts)). Reading of the code: a rotated file on disk is picked up without restart.
- Environment variables via `EnvironmentCredential`: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_CERTIFICATE_PATH`, optional `AZURE_CLIENT_CERTIFICATE_PASSWORD`, optional `AZURE_CLIENT_SEND_CERTIFICATE_CHAIN` ([EnvironmentCredential](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/environmentcredential)).
- Entra side: the client assertion header uses `x5t#S256` and should be signed with PS256 ([Entra certificate credentials](https://learn.microsoft.com/en-us/entra/identity-platform/certificate-credentials#assertion-format)).
- Microsoft's on-premises guidance for JavaScript uses `ClientSecretCredential` and says "A different app registration should be created for each environment"; it does not describe certificate storage ([JS on-premises apps](https://learn.microsoft.com/en-us/azure/developer/javascript/sdk/authentication/on-premises-apps)).
- Versions at retrieval: `@azure/identity` 4.14.1 stable (2026-10-29), 4.15.0-beta.2 (2026-11-03) ([CHANGELOG](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/CHANGELOG.md)).

#### Where the certificate can live without a secret in configuration

| Location | What the sources say | Bootstrap credential needed | Sources |
|---|---|---|---|
| File mounted into the container | Supported directly (`certificatePath`, `AZURE_CLIENT_CERTIFICATE_PATH`). The file itself is the credential; an encrypted key needs `certificatePassword`, which is again a secret. | The file | [ClientCertificateCredential](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatecredential) |
| OS certificate store (for example Windows store) | No support in `@azure/identity` JS or MSAL Node: PEM only. Using it would need an export to PEM, outside these libraries. | The store's protection (not covered by the sources) | [source](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/src/credentials/clientCertificateCredential.ts), [msal-node certificate-credentials.md](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/certificate-credentials.md) |
| Key Vault | A certificate's private key is retrievable through the secret endpoint "in either PFX or PEM format" if the policy marks the key exportable; non-exportable keys are not part of the secret value but can be used through key operations (sign) ([KV certificates](https://learn.microsoft.com/en-us/azure/key-vault/certificates/about-certificates#exportable-or-non-exportable-key)). MSAL Node mentions `clientAssertion` "for using KeyVault for signing". | Yes: reaching Key Vault from outside Azure needs a security principal; "If you cannot use managed identity, you instead register the application" ([KV authentication](https://learn.microsoft.com/en-us/azure/key-vault/general/authentication)). No source names a way around this bootstrap credential except Arc (next rows). | |
| Azure Arc-enabled server: managed identity | "Applications or processes running directly on an Azure Arc-enabled server can use managed identities." Endpoint `http://localhost:40342/metadata/identity/oauth2/token`; a challenge-response returns a path to a secret file; callers must be in the local `Administrators` or `Hybrid Agent Extension Applications` group (Windows) or `himds` group (Linux). Containers are not addressed. | No stored credential; local group membership instead | [Arc servers MI](https://learn.microsoft.com/en-us/azure/azure-arc/servers/managed-identity-authentication) |
| Azure Arc-enabled Kubernetes: workload identity | "(preview)". Uses service account token volume projection; the cluster is the token issuer; the workload exchanges the token for an Entra token via Azure Identity or MSAL. Agent 1.21 or later. Max 20 FICs per managed identity. | No stored credential | [Arc K8s workload identity](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/conceptual-workload-identity) |
| Arc-enabled Kubernetes: Key Vault Secrets Provider extension | Authenticates to Key Vault "through a service principal" whose client ID and client secret go into a Kubernetes secret. Retires on 2027-10-09; Microsoft points to the Secret Store extension (not researched here). | Yes (client secret) | [Arc AKV secrets provider](https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-akv-secrets-provider) |
| Other OIDC issuer (generic workload identity federation) | Supported scenarios include Kubernetes, GitHub Actions, Google Cloud, AWS, SPIFFE and "Other workloads running in compute platforms outside of Azure". Issuer must comply with OIDC Discovery; RS256 only. `ClientAssertionCredential(tenantId, clientId, getAssertion)` takes the external token. | Depends on the issuer | [WIF overview](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation#supported-scenarios), [WIF create trust](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust), [WIF considerations](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-considerations), [ClientAssertionCredential](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientassertioncredential) |

Arc support in the JavaScript libraries: MSAL Node lists Azure Arc as a managed identity source; user-assigned identities on Arc arrived in msal-node 5.6.0, and older Arc agents "silently return the machine's system-assigned identity" ([msal-node managed-identity.md](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/managed-identity.md)). `@azure/identity` 4.13.3 (2026-09-10) raised its minimum msal-node to `^6.0.0` "to provide Azure Arc user-assigned managed identity support" ([CHANGELOG](https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/CHANGELOG.md)).

#### PostgreSQL credentials on-premises

Entra authentication as described in section 3 is a feature of Azure Database for PostgreSQL. Community PostgreSQL offers ([PG auth methods](https://www.postgresql.org/docs/current/auth-methods.html)): trust, password, GSSAPI, SSPI, ident, peer, LDAP, RADIUS, certificate, PAM, BSD, OAuth.

- Password: `scram-sha-256` "is the most secure of the currently provided methods"; MD5 "is deprecated and will be removed in a future release" ([PG password auth](https://www.postgresql.org/docs/current/auth-password.html)). The password is a secret that must be stored somewhere (file, Key Vault, or an async `password` function in `pg` that reads it).
- Certificate: "only available for SSL connections"; the certificate `cn` is compared with the database user name, or mapped with `map`; `cert` is "effectively `trust` authentication with `clientcert=verify-full`" ([PG cert auth](https://www.postgresql.org/docs/current/auth-cert.html)). `pg` supports client certificates with `ssl: { ca, key, cert }`; `sslcert`, `sslkey`, `sslrootcert` and `sslmode` must not also be in the connection string, or the `ssl` object is replaced ([node-postgres SSL](https://node-postgres.com/features/ssl)). The client key is then the credential, like the Entra certificate.
- GSSAPI and the PostgreSQL OAuth method: listed by PostgreSQL; support in `pg` was not researched.

### 5. Entra app registration for sign-in

#### Certificate vs. federated credentials

- A certificate "allows an application to use its own credentials for authentication anywhere a client secret could be used". The assertion is a JWT (`client_assertion_type` `urn:ietf:params:oauth:client-assertion-type:jwt-bearer`), header `x5t#S256`, algorithm "Should be PS256", `exp` "5-10 minutes after `nbf` at most" ([Entra certificate credentials](https://learn.microsoft.com/en-us/entra/identity-platform/certificate-credentials)). The page gives no ranking between secret, certificate and FIC, and no key size.
- Federated identity credential (FIC): an app registration trusts tokens of an external issuer; issuer, subject and audience "must case-sensitively match"; "The federated identity credentials flow does not support tokens issued by Microsoft Entra ID" ([WIF overview](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation)). Max 20 FICs per app or user-assigned managed identity; no wildcards; changes can take minutes to propagate (AADSTS70021) ([WIF considerations](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-considerations)).
- Managed identity as FIC: "You can only use User-Assigned Managed Identities as a credential." The app registration "must belong to the same tenant as the managed identity"; accessing resources in another tenant is supported, another cloud is not. Audience `api://AzureADTokenExchange` (global cloud); subject is the managed identity's object (principal) ID ([MI as FIC](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity)). The page does not state GA or preview.
- Consequence for the two runtimes (facts combined): in Azure, an app registration can be credentialed by a user-assigned managed identity (no stored credential); on-premises, the same app registration needs a certificate, a secret, or a FIC from an issuer available there (section 4).

#### App roles vs. group claims

- App roles are defined on the app registration, assigned to users or groups, and emitted in the `roles` claim; values cannot contain spaces ([Entra app roles](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps)). Default limit of 700 permission definitions per application (same source). "Microsoft Entra groups and application roles aren't mutually exclusive." (same source, `#app-roles-vs-groups`)
- Group assignment to an application "requires at least a P1 level license. A free tenant can't assign groups to an application." Assigned-group membership applies to direct members only ([Zero Trust: group claims and app roles](https://learn.microsoft.com/en-us/security/zero-trust/develop/configure-tokens-group-claims-app-roles#group-overages)).
- Group claim options (`groupMembershipClaims`): `All`, `SecurityGroup`, `DirectoryRole`, `ApplicationGroup`, `None`. Group claims include nested groups except with "Groups assigned to the application". Cloud-only groups are emitted as object IDs; display names only for assigned groups ([Entra group claims](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims)).
- Overage: above 200 groups (JWT) "the groups claim isn't included in the token"; instead `_claim_names`/`_claim_sources` (and `hasgroups` in ID tokens) signal the overage ([ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference#groups-overage-claim), [access token claims](https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference#groups-overage-claim)). The returned endpoint is an Azure AD Graph URL; Microsoft advises Microsoft Graph instead. "your app must use Microsoft Graph to determine the group membership"; "Applications should not rely on the value of the overage claim, only its presence" ([Zero Trust: group claims](https://learn.microsoft.com/en-us/security/zero-trust/develop/configure-tokens-group-claims-app-roles#group-overages)).
- Group filtering works only for users in 1,000 or fewer groups ([Entra group claims](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims#group-filtering)).
- Recommendation: "We recommend basing in-app authorization on application roles rather than groups when: You're developing a new application ... Support for nested groups isn't required." ([Entra group claims](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims#important-caveats-for-this-functionality)). "Another way to avoid the group overage problem is for the app to define app roles." ([Zero Trust](https://learn.microsoft.com/en-us/security/zero-trust/develop/configure-tokens-group-claims-app-roles#groups-and-app-roles))
- Note for nsgfw's scoped Roles (viewer, editor, approver, admin per Scope): app roles and group claims carry names or IDs only. A per-Scope assignment is not expressible in the token itself. This is an observation on the sources, not a documented statement.

### 6. Key Vault access patterns and Key Vault references in Container Apps

#### Access model

- "Starting with API version 2026-02-01, Azure RBAC is the default access control model for newly created key vaults." Access policies are called legacy; switching to RBAC "invalidates all access policies permissions" ([KV RBAC guide](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)).
- Risk of access policies: a control-plane Contributor "can grant themselves access to the data plane by setting a Key Vault access policy" (same source).
- Data-plane roles: Key Vault Secrets User ("Read secret contents including secret portion of a certificate with private key"), Key Vault Certificate User ("Read entire certificate contents including secret and key portion"), Key Vault Crypto User ("Perform cryptographic operations using keys"), Key Vault Reader (metadata only) (same source).
- "Our recommendation is to use a vault per application per environment ... with roles assigned at the key vault scope." "Assigning roles on individual keys, secrets and certificates is not recommended." (same source)
- Authentication: "Recommended: enable a system-assigned managed identity for the application"; otherwise register an application, whose "client secret acts like its password" ([KV authentication](https://learn.microsoft.com/en-us/azure/key-vault/general/authentication)).
- Network: firewall disabled by default; options are allowed VNets/IP ranges (max 200 VNet rules, 1000 IPv4 rules) or private endpoints only ([KV network security](https://learn.microsoft.com/en-us/azure/key-vault/general/network-security)).
- Throttling and caching: on 429, exponential backoff; "Cache the secrets you retrieve from Azure Key Vault in memory, and reuse from memory whenever possible" ([KV throttling](https://learn.microsoft.com/en-us/azure/key-vault/general/overview-throttling)). Limit: 4,000 "other" transactions per vault per region per 10 seconds ([KV service limits](https://learn.microsoft.com/en-us/azure/key-vault/general/service-limits)).
- Rotation guidance: "Shorter rotation intervals (for example, 60-90 days)"; "Use dual credentials" for zero-downtime rotation; "Don't store configuration data in Key Vault." ([KV secure secrets](https://learn.microsoft.com/en-us/azure/key-vault/secrets/secure-secrets))

#### Key Vault references in Container Apps

- Requirement: managed identity on the app with Key Vault Secrets User. ARM: `"keyVaultUrl": "<KEY_VAULT_SECRET_URI>", "identity": "system"` or the user-assigned identity's resource ID ([ACA secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets#reference-secret-from-key-vault)).
- Versions: without a version, "the app uses the latest version"; "When newer versions become available, the app automatically retrieves the latest version within 30 minutes." "Any active revisions that reference the secret in an environment variable is automatically restarted." ([ACA secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets#key-vault-secret-uri-and-secret-rotation)). Behaviour of volume-mounted secrets on rotation is not stated.
- Consumption: environment variables (`secretRef`) or a secret volume where "each secret is mounted as a file", named after the secret ([ACA secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets#mounting-secrets-in-a-volume)).
- Networking: only stated for UDR with Azure Firewall: allow the `AzureKeyVault` service tag and `login.microsoft.com` (same source). Key Vault firewall or private endpoint interplay is not stated.
- "Avoid specifying the value of a secret directly in a production environment." ([ACA secrets](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets#defining-secrets))
- Key Vault certificates in Container Apps serve TLS for custom domains, through an environment-level managed identity; rotation takes "up to 12 hours" ([ACA Key Vault certificates](https://learn.microsoft.com/en-us/azure/container-apps/key-vault-certificates-manage)). The page describes no use as a client credential.

## Comparison: Azure vs. on-premises

| Concern | Azure Container Apps: options | On-premises: options | Trade-offs stated or derived from the sources |
|---|---|---|---|
| User sign-in (Entra) | (a) Built-in authentication: Entra client secret stored as a Container Apps secret; role checks in app code; headers injected by sidecar. (b) In-app MSAL Node confidential client with certificate (Key Vault) or with `clientAssertion` fed by a user-assigned managed identity (MI as FIC). | In-app MSAL Node only (built-in authentication is a Container Apps platform feature). Credential: certificate (PEM file), secret, or FIC from a local OIDC issuer (for example Arc-enabled Kubernetes, preview). | (a) exists only in Azure, so the image would carry two sign-in paths; its MI/FIC option is documented for App Service only. (b) is one code path in both runtimes. MSAL in-memory cache "does not scale for production"; multi-replica needs a distributed cache. |
| Tool identity to ARM | System- or user-assigned managed identity (`ManagedIdentityCredential`). | `ClientCertificateCredential` (PEM path or string, optional password); or Arc-enabled server managed identity; or Arc-enabled Kubernetes workload identity (preview); or `ClientAssertionCredential` with another OIDC issuer. | User-assigned: pre-created role assignments, shared, survives app deletion. MI tokens cached about 24 h, no forced refresh, role changes can take hours. Certificate: a stored credential that needs rotation; PEM only. Arc options remove the stored credential but add an Arc dependency and group-membership or preview constraints. |
| Database authentication | Azure Database for PostgreSQL: Entra token as password via `pg` async `password` function plus pool `maxLifetimeSeconds`; or PostgreSQL password from Key Vault. | Community PostgreSQL: `scram-sha-256` password (stored secret), client-certificate auth (`cert`, key file), GSSAPI or OAuth (not researched for `pg`). | Entra: no stored DB secret; documented token lifetimes conflict; behaviour of open connections at token expiry undocumented. On-premises: no Entra path; either a password or a client key must be stored. |
| Secret storage | Key Vault (RBAC) with Container Apps Key Vault references (env vars restart revision on change; volume files) or direct SDK access with managed identity. | Mounted files; Key Vault via a bootstrap credential (certificate or secret of a service principal, or Arc identity); Arc Key Vault Secrets Provider (service principal secret in a Kubernetes secret; retiring 2027-10-09). | In Azure, a managed identity removes the bootstrap credential. On-premises without Arc, at least one credential (certificate or key file) must exist on the host; Key Vault then moves, but does not remove, that credential. |

## Uncertain — candidates for an empirical check

1. **Managed identity instead of client secret for Container Apps built-in authentication.** Documented only for App Service (`OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID`). The Container Apps pages show only a client secret. Check whether the Container Apps auth config accepts it.
2. **Headers and claims from Container Apps built-in authentication.** Container Apps pages name only `X-MS-CLIENT-PRINCIPAL-NAME`/`-ID` and token headers. Whether `X-MS-CLIENT-PRINCIPAL` is set and whether it carries `roles` and `groups`, and whether `/.auth/me` works, is not documented for Container Apps.
3. **Token store with managed identity.** The Container Apps token store page requires a SAS URL secret; managed identity access is not mentioned.
4. **PostgreSQL token lifetime.** "up to 24 hours" for system-assigned managed identities vs. "5 to 60 minutes" vs. the Entra default of 60-90 minutes. Lifetime for user-assigned identities is not stated. Measure `expires_on` from the Container Apps endpoint for `https://ossrdbms-aad.database.windows.net`.
5. **Open PostgreSQL connections after token expiry.** Not documented. Evidence suggests validation at sign-in only. Check whether a connection survives past the token's `exp`.
6. **`pg` password function through `Pool`.** Documented with an example, and the code path exists, but `connection-parameters.js` also stringifies `password` in `getLibpqConnectionString` (used for the native binding). Verify with the pure-JS driver and the current pg 8.x that each new pooled connection calls the function.
7. **Managed identity role names in PostgreSQL.** `pgaadauth_create_principal` needs the principal's name; the managed identity page uses the resource name; the `_with_oid` section of the manage-users page contains a contradictory sentence. Check which name a user-assigned identity needs.
8. **Arc-enabled server managed identity from inside a container.** The Arc page covers processes "running directly" on the server. Reaching `localhost:40342` and reading the challenge file from a container, and the required group membership there, are undocumented.
9. **`@azure/identity` with Arc user-assigned identities.** Depends on msal-node ≥ 5.6.0 and a recent Connected Machine agent; older agents silently return the system-assigned identity. Verify the agent version requirement.
10. **General availability of managed identity as FIC.** Not stated on the Learn page.
11. **Key Vault references with Key Vault firewall or private endpoint.** Container Apps docs state only the UDR/Azure Firewall note; behaviour with a locked-down vault is not stated. Also check whether volume-mounted secrets refresh on rotation without restart.
12. **Init containers and managed identity.** Not available in consumption-only and dedicated workload profile environments. Relevant if database migrations run in an init container.
13. **MSAL Node doc conflict.** `certificate-credentials.md` says MSAL "does not yet implement" managed identity; `managed-identity.md` and the CHANGELOG say it does (since 2.7.0). The latter is newer and consistent with `@azure/identity`'s source.
14. **`pg` with GSSAPI/Kerberos or PostgreSQL's OAuth method.** Not researched; needed only if on-premises PostgreSQL should avoid a stored password or client key.
15. **Service Connector page.** Only the first ~40,000 of ~88,000 characters were read verbatim; statements beyond that were not used.
16. **Implicit-flow group limit.** Five ([Entra group claims](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims)) vs. six ([Zero Trust](https://learn.microsoft.com/en-us/security/zero-trust/develop/configure-tokens-group-claims-app-roles#group-overages)). Irrelevant unless implicit flow is used (for example built-in authentication without a client secret).

## Facts that open design tickets depend on

- A container app has at most one system-assigned and any number of user-assigned managed identities; user-assigned identities and their role assignments can exist before the app.
- Managed identity tokens are cached for about 24 hours per resource and cannot be force-refreshed; role and group changes can take several hours to apply.
- Container Apps built-in authentication runs as a platform sidecar; the Container Apps docs document only a client-secret credential for its Entra provider and leave role checks to app code.
- MSAL Node confidential clients accept a secret, a PEM certificate with SHA-256 thumbprint, or a client-assertion callback; the default in-memory token cache is not recommended for production web apps.
- `ClientCertificateCredential` in `@azure/identity` accepts only PEM, from a file path or a string, with an optional key password; it re-reads the file on each `getToken`.
- Only user-assigned managed identities can be federated credentials of an app registration, in the same tenant, max 20 FICs per app.
- Azure Database for PostgreSQL accepts an Entra access token as the password; scope `https://ossrdbms-aad.database.windows.net/.default`; roles via `pgaadauth_create_principal[_with_oid]`; documented token lifetimes conflict.
- `node-postgres` accepts `password` as a sync or async function, called per new connection; `pg-pool` has `maxLifetimeSeconds` (default off) and `idleTimeoutMillis` (default 10 s); `pgpass` support is deprecated.
- Community PostgreSQL has no Entra authentication; `scram-sha-256` passwords and client-certificate authentication (`cn` = user name, SSL only) are the relevant options, and `pg` supports client certificates through `ssl`.
- Reaching Key Vault from outside Azure needs a security principal; only Azure Arc (server managed identity, or Kubernetes workload identity in preview) removes the stored bootstrap credential.
- Azure RBAC is the default Key Vault access model from API 2026-02-01; Microsoft recommends one vault per application per environment with roles at vault scope.
- Container Apps Key Vault references need a managed identity with Key Vault Secrets User; versionless references refresh within 30 minutes and restart revisions that use them as environment variables.
- App roles arrive in the `roles` claim; group claims overflow above 200 groups in a JWT and then require a Microsoft Graph call; assigning groups to an application needs Entra ID P1; Microsoft recommends app roles for new apps without nested-group needs.
- Entra outbound access: PostgreSQL with private access needs an outbound rule to the `AzureActiveDirectory` service tag; Container Apps with UDR and Azure Firewall needs `AzureKeyVault` and `login.microsoft.com` allowed for Key Vault references.

## Sources

All retrieved 2026-11-09. Dates in brackets are the page's `ms.date` / last update where shown.

Microsoft Learn — Container Apps
- https://learn.microsoft.com/en-us/azure/container-apps/managed-identity [2025-06-03 / 2026-02-13]
- https://learn.microsoft.com/en-us/azure/container-apps/managed-identity-image-pull [2025-02-03 / 2025-10-08]
- https://learn.microsoft.com/en-us/azure/container-apps/authentication [2025-12-04 / 2026-07-08]
- https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra [2026-01-30 / 2026-02-20]
- https://learn.microsoft.com/en-us/azure/container-apps/token-store [2025-06-25 / 2026-04-07]
- https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets [2026-09-04 / 2026-09-11]
- https://learn.microsoft.com/en-us/azure/container-apps/key-vault-certificates-manage [2025-11-14 / 2025-11-21]
- https://learn.microsoft.com/en-us/azure/container-apps/tutorial-java-quarkus-connect-managed-identity-postgresql-database [2026-03-26 / 2026-07-31]
- https://learn.microsoft.com/en-us/azure/container-apps/networking [2025-06-25 / 2026-08-31]

Microsoft Learn — App Service (referenced by Container Apps)
- https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization [2025-03-28 / 2026-03-11]
- https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-user-identities [2025-07-02 / 2025-08-12]
- https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-provider-aad [2026-04-27 / 2026-05-20]
- https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-oauth-tokens [2025-11-28]

Microsoft Learn — Azure Database for PostgreSQL and Service Connector
- https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-azure-ad-authentication [2026-07-14 / 2026-09-06]
- https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-configure-sign-in-azure-ad-authentication [2026-07-14 / 2026-09-06]
- https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-connect-with-managed-identity [2026-07-14 / 2026-07-16]
- https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/how-to-manage-azure-ad-users [2026-07-14 / 2026-09-06]
- https://learn.microsoft.com/en-us/azure/service-connector/how-to-integrate-postgres [2025-11-21 / 2026-06-12] (partially read, see Uncertain 15)
- https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/connect-nodejs — 404

Microsoft Learn — Microsoft identity platform and managed identities
- https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview [2025-08-19 / 2026-06-15]
- https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/managed-identity-best-practice-recommendations [2025-03-14 / 2026-02-19]
- https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/how-to-use-vm-token [2025-11-11 / 2026-06-15]
- https://learn.microsoft.com/en-us/entra/identity-platform/certificate-credentials [2025-01-04 / 2026-06-15]
- https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes [2026-04-08 / 2026-06-15]
- https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps [2026-09-25]
- https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference [2023-05-30 / 2026-06-15]
- https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference [2023-05-26 / 2026-07-24]
- https://learn.microsoft.com/en-us/entra/identity-platform/tutorial-web-app-node-sign-in-sign-out [2025-01-03 / 2026-06-26]
- https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims [2025-04-09 / 2026-02-26]
- https://learn.microsoft.com/en-us/security/zero-trust/develop/configure-tokens-group-claims-app-roles [2025-04-18 / 2026-02-19]
- https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation [2025-04-09 / 2026-08-13]
- https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-config-app-trust-managed-identity [2025-06-06 / 2026-09-29]
- https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-considerations [2024-02-28 / 2026-06-15]
- https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust [2024-12-13 / 2026-02-26]

Microsoft Learn — Key Vault
- https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide [2026-06-16 / 2026-08-21]
- https://learn.microsoft.com/en-us/azure/key-vault/general/authentication [2026-01-30 / 2026-06-12]
- https://learn.microsoft.com/en-us/azure/key-vault/certificates/about-certificates [2026-07-10]
- https://learn.microsoft.com/en-us/azure/key-vault/general/network-security [2026-06-16 / 2026-10-06]
- https://learn.microsoft.com/en-us/azure/key-vault/general/overview-throttling [2026-07-15 / 2026-07-17]
- https://learn.microsoft.com/en-us/azure/key-vault/general/service-limits [2025-07-20 / 2026-06-12]
- https://learn.microsoft.com/en-us/azure/key-vault/secrets/secure-secrets (requested as `secrets-best-practices`) [2026-07-10 / 2026-10-06]

Microsoft Learn — Azure Arc
- https://learn.microsoft.com/en-us/azure/azure-arc/servers/managed-identity-authentication [2026-02-05]
- https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/conceptual-workload-identity [2024-11-11 / 2025-11-18]
- https://learn.microsoft.com/en-us/azure/azure-arc/kubernetes/tutorial-akv-secrets-provider [2026-10-14]

Azure SDK for JavaScript (`@azure/identity`)
- https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatecredential [updated 2026-04-20]
- https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatecredentialpemconfiguration
- https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatepemcertificate
- https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatepemcertificatepath
- https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientcertificatecredentialoptions
- https://learn.microsoft.com/en-us/javascript/api/@azure/identity/environmentcredential [updated 2026-04-20]
- https://learn.microsoft.com/en-us/javascript/api/@azure/identity/clientassertioncredential
- https://learn.microsoft.com/en-us/javascript/api/@azure/identity/workloadidentitycredential
- https://learn.microsoft.com/en-us/azure/developer/javascript/sdk/authentication/on-premises-apps [2026-06-01 / 2026-06-11]
- https://learn.microsoft.com/en-us/azure/developer/javascript/sdk/authentication/credential-chains [2026-06-01 / 2026-06-11]
- https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/src/credentials/clientCertificateCredential.ts
- https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/src/credentials/managedIdentityCredential/index.ts
- https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/CHANGELOG.md

MSAL Node (`@azure/msal-node`)
- https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/certificate-credentials.md
- https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/initialize-confidential-client-application.md
- https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/managed-identity.md
- https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/caching.md
- https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/README.md
- https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/CHANGELOG.md

node-postgres (`pg`)
- https://node-postgres.com/apis/client
- https://node-postgres.com/apis/pool
- https://node-postgres.com/features/connecting
- https://node-postgres.com/features/ssl
- https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/client.js
- https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/connection-parameters.js
- https://github.com/brianc/node-postgres/blob/master/packages/pg-pool/index.js
- https://github.com/brianc/node-postgres/blob/master/CHANGELOG.md

PostgreSQL (project documentation, version "current")
- https://www.postgresql.org/docs/current/auth-methods.html
- https://www.postgresql.org/docs/current/auth-password.html
- https://www.postgresql.org/docs/current/auth-cert.html
