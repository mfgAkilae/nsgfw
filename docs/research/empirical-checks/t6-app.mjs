// T6 test app: MSAL Node redeems an authorization code with a user-assigned managed identity
// token as client assertion (managed identity as federated identity credential).
// Runs in Azure Container Apps. /result reports outcomes only: no tokens, no IDs.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';

const { TENANT_ID, CLIENT_ID, UAMI_CLIENT_ID, IDENTITY_ENDPOINT, IDENTITY_HEADER } = process.env;
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const scrub = (s) => String(s ?? '').replace(GUID, '<guid>').slice(0, 600);
const results = {
  msalNodeVersion: JSON.parse(readFileSync('/app/node_modules/@azure/msal-node/package.json')).version,
  node: process.version,
  started: new Date().toISOString(),
  configured: Boolean(CLIENT_ID && CLIENT_ID !== 'unset'),
  assertion: null,
  authCode: null,
  clientCredential: null,
};

async function managedIdentityAssertion() {
  const url = `${IDENTITY_ENDPOINT}?api-version=2019-08-01&client_id=${UAMI_CLIENT_ID}` +
    `&resource=${encodeURIComponent('api://AzureADTokenExchange')}`;
  const r = await fetch(url, { headers: { 'X-IDENTITY-HEADER': IDENTITY_HEADER } });
  const body = await r.json();
  if (!r.ok) {
    results.assertion = { ok: false, status: r.status, body: scrub(JSON.stringify(body)) };
    throw new Error(`managed identity token: ${r.status}`);
  }
  const claims = JSON.parse(Buffer.from(body.access_token.split('.')[1], 'base64url'));
  results.assertion = {
    ok: true,
    aud: claims.aud,
    issuerForm: scrub(claims.iss),
    lifetimeSeconds: claims.exp - claims.iat,
    calls: (results.assertion?.calls ?? 0) + 1,
  };
  return body.access_token;
}

const cca = results.configured ? new ConfidentialClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientAssertion: async () => managedIdentityAssertion(),
  },
}) : null;
const crypto = new CryptoProvider();
const pending = new Map();
const scopes = ['User.Read'];
const fail = (e) => ({ ok: false, at: new Date().toISOString(), errorCode: e.errorCode,
  subError: e.subError, message: scrub(e.message) });

const server = http.createServer(async (req, res) => {
  const base = `https://${req.headers['x-forwarded-host'] ?? req.headers.host}`;
  const url = new URL(req.url, base);
  const send = (status, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  try {
    if (url.pathname === '/result') return send(200, JSON.stringify(results, null, 1), 'application/json');
    if (!cca) return send(503, 'Not configured yet: the app registration client ID is missing.');
    if (url.pathname === '/') {
      const { verifier, challenge } = await crypto.generatePkceCodes();
      const state = crypto.createNewGuid();
      pending.set(state, verifier);
      const location = await cca.getAuthCodeUrl({ scopes, redirectUri: `${base}/redirect`,
        codeChallenge: challenge, codeChallengeMethod: 'S256', state, prompt: 'select_account' });
      res.writeHead(302, { Location: location });
      return res.end();
    }
    if (url.pathname === '/redirect') {
      const state = url.searchParams.get('state');
      if (url.searchParams.get('error')) {
        results.authCode = { ok: false, at: new Date().toISOString(), errorCode: url.searchParams.get('error'),
          message: scrub(url.searchParams.get('error_description')) };
        return send(400, `Sign-in returned an error: ${results.authCode.message}`);
      }
      const verifier = pending.get(state);
      pending.delete(state);
      try {
        const r = await cca.acquireTokenByCode({ code: url.searchParams.get('code'), scopes,
          redirectUri: `${base}/redirect`, codeVerifier: verifier, state });
        results.authCode = { ok: true, at: new Date().toISOString(), tokenType: r.tokenType,
          scopes: r.scopes, hasAccessToken: Boolean(r.accessToken), hasIdToken: Boolean(r.idToken) };
        return send(200, 'OK: the authorization code was redeemed with the managed identity assertion. You can close this tab.');
      } catch (e) {
        results.authCode = fail(e);
        return send(500, `Redeeming the code failed: ${results.authCode.errorCode} ${results.authCode.message}`);
      }
    }
    if (url.pathname === '/cc') {
      try {
        const r = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
        results.clientCredential = { ok: true, at: new Date().toISOString(), hasAccessToken: Boolean(r.accessToken) };
      } catch (e) {
        results.clientCredential = fail(e);
      }
      return send(200, JSON.stringify(results.clientCredential), 'application/json');
    }
    return send(404, 'not found');
  } catch (e) {
    return send(500, scrub(e.stack));
  }
});
server.listen(3000, () => console.log('t6 app listening on 3000', JSON.stringify(results)));
