import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import { test } from 'node:test';
import {
  createAuth,
  normalizeBasicPat,
  patFingerprint,
  sealPayload,
  unsealPayload,
} from '../src/auth.js';
import { createAzdo } from '../src/azdo.js';
import { createMcpPool } from '../src/mcp.js';
import { loadProcess } from '../src/process.js';
import { createRouter, errorHandler } from '../src/routes.js';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const testJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key-1', alg: 'RS256', use: 'sig' };

function signJwt(payload, header = { alg: 'RS256', kid: 'test-key-1', typ: 'JWT' }) {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url');
  return `${h}.${p}.${sig}`;
}

test('sealPayload / unsealPayload: AES-256-GCM protege contra adulteração, expiração e troca de usuário (AAD)', () => {
  const key = crypto.randomBytes(32);
  const sealed = sealPayload(key, { pat: 'secret-token', exp: Date.now() + 60_000 }, 'alice@corp.test');
  assert.equal(unsealPayload(key, sealed, 'alice@corp.test')?.pat, 'secret-token');
  assert.equal(unsealPayload(key, sealed, 'mallory@corp.test'), null);
  const tampered = `${sealed.slice(0, -2)}AA`;
  assert.equal(unsealPayload(key, tampered, 'alice@corp.test'), null);
  const expired = sealPayload(key, { pat: 'old', exp: Date.now() - 1_000 }, 'alice@corp.test');
  assert.equal(unsealPayload(key, expired, 'alice@corp.test'), null);
});

test('normalizeBasicPat aceita PAT cru do Azure DevOps e base64 user:pat já codificado', () => {
  const rawPat = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH';
  const expectedB64 = Buffer.from(`alice@corp.test:${rawPat}`, 'utf8').toString('base64');

  assert.equal(normalizeBasicPat(rawPat, 'alice@corp.test'), expectedB64);
  assert.equal(normalizeBasicPat(expectedB64, 'other@corp.test'), expectedB64);
  assert.equal(normalizeBasicPat(`Basic ${expectedB64}`, 'alice@corp.test'), expectedB64);
  assert.equal(normalizeBasicPat(`alice@corp.test:${rawPat}`), expectedB64);

  assert.throws(() => normalizeBasicPat('curto', 'alice@corp.test'), (e) => e.code === 'invalidPat');
  assert.throws(() => normalizeBasicPat('bad\r\nheader123456', 'alice@corp.test'), (e) => e.code === 'invalidPat');
});

test('padrão (GOOGLE_AUTH_ENABLED desabilitado): não pede login Google, mas exige PAT por usuário e resolve identidade via connectionData', async () => {
  const env = {
    NODE_ENV: 'production',
    // Mesmo com GOOGLE_CLIENT_ID definido no .env, sem GOOGLE_AUTH_ENABLED=true o Google OAuth fica desligado.
    GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef',
    AZDO_ORG: 'org',
    AZDO_PROJECT: 'Proj',
    AZDO_TEAM: 'Team',
    AZDO_ME: 'nao-vazar@corp.test',
  };
  const rawAlicePat = 'raw-pat-alice-1234567890';
  const emptyUserB64 = normalizeBasicPat(rawAlicePat, '');
  const fullUserB64 = normalizeBasicPat(rawAlicePat, 'alice@corp.test');
  const evicted = [];

  const fetchImpl = async (url, init) => {
    const authHeader = init?.headers?.Authorization || '';
    const isAlice = authHeader === `Basic ${emptyUserB64}` || authHeader === `Basic ${fullUserB64}`;
    if (!isAlice) {
      return {
        ok: true,
        status: 203,
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        json: async () => ({}),
      };
    }
    if (String(url).includes('/_apis/connectionData')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          authenticatedUser: {
            customDisplayName: 'Alice Silva',
            providerDisplayName: 'alice@corp.test',
            properties: { Account: { $value: 'alice@corp.test' } },
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ workItems: [] }),
    };
  };

  const auth = createAuth({ env, fetchImpl, onPatClear: (p) => evicted.push(p) });
  assert.equal(auth.googleAuthEnabled, false);
  assert.equal(auth.patAuthRequired, true);
  assert.equal(auth.authRequired, true);

  const proc = loadProcess(JSON.parse(fs.readFileSync(new URL('./fixtures/process.json', import.meta.url))));
  const app = express();
  app.use(express.json());
  app.use('/api', auth.csrfGuard);
  app.use('/api/auth', auth.createAuthRouter());
  app.use(
    '/api',
    auth.requireAuth,
    createRouter((req) =>
      createAzdo({
        env: { ...env, PERSONAL_ACCESS_TOKEN: req.userPat, AZDO_ME: req.user.email || '' },
        proc,
        taskboard: null,
        userEmail: req.user.email,
        callTool: async (name, args) => {
          if (name === 'work' && args.action === 'list_team_iterations') return [];
          if (name === 'work' && args.action === 'get_team_settings') return { defaultAreaPath: 'Proj' };
          return null;
        },
      }),
    ),
  );
  app.use('/api', errorHandler);

  const srv = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const extractCookies = (res) =>
    (res.headers.getSetCookie?.() || [])
      .map((c) => c.split(';')[0])
      .filter((c) => !c.endsWith('='))
      .join('; ');

  try {
    // 1. /api/auth/status: Google OAuth desligado, autenticado=true (pula tela Google), mas hasPat=false
    const st0 = await (await fetch(`${base}/api/auth/status`)).json();
    assert.equal(st0.googleAuthEnabled, false);
    assert.equal(st0.authenticated, true);
    assert.equal(st0.hasPat, false);

    // 2. Sem PAT: /api/meta -> 403 patRequired (não vaza AZDO_ME nem PAT do servidor!)
    const rNoPat = await fetch(`${base}/api/meta`);
    assert.equal(rNoPat.status, 403);
    assert.equal((await rNoPat.json()).code, 'patRequired');

    // 3. Cadastra PAT cru -> resolve nome e e-mail direto do Azure DevOps connectionData
    const rPat = await fetch(`${base}/api/auth/pat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'azdo-board' },
      body: JSON.stringify({ pat: rawAlicePat }),
    });
    assert.equal(rPat.status, 200);
    const patJson = await rPat.json();
    assert.deepEqual(patJson.user, { email: 'alice@corp.test', name: 'Alice Silva', picture: null });
    const cookie = extractCookies(rPat);

    // 4. /api/auth/status reflete o usuário do PAT
    const st1 = await (await fetch(`${base}/api/auth/status`, { headers: { cookie } })).json();
    assert.equal(st1.hasPat, true);
    assert.equal(st1.user.email, 'alice@corp.test');
    assert.equal(st1.user.name, 'Alice Silva');

    // 5. /api/meta usa o e-mail do dono do PAT (alice@corp.test), nunca o AZDO_ME do servidor
    const meta = await (await fetch(`${base}/api/meta`, { headers: { cookie } })).json();
    assert.equal(meta.me, 'alice@corp.test');

    // 6. Logout limpa o PAT e despeja o cliente MCP correspondente
    const rOut = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { 'x-requested-with': 'azdo-board', cookie },
    });
    assert.equal(rOut.status, 200);
    assert.equal(patFingerprint(evicted[0]), patFingerprint(fullUserB64));
  } finally {
    srv.close();
  }
});

test('verifyGoogleIdToken valida assinatura RS256, audiência, expiração, domínio e lista de e-mails quando GOOGLE_AUTH_ENABLED=true', async () => {
  const baseEnv = {
    GOOGLE_AUTH_ENABLED: 'true',
    GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
    ALLOWED_EMAIL_DOMAIN: 'corp.test',
    ALLOWED_EMAILS: 'alice@corp.test,bob@corp.test',
    SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef',
    AZDO_ORG: 'org',
    AZDO_PROJECT: 'Proj',
  };
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ keys: [testJwk] }),
  });
  const auth = createAuth({ env: baseEnv, fetchImpl });
  const now = Math.floor(Date.now() / 1000);

  const okToken = signJwt({
    iss: 'https://accounts.google.com',
    aud: baseEnv.GOOGLE_CLIENT_ID,
    exp: now + 3600,
    email: 'Alice@corp.test',
    email_verified: true,
    name: 'Alice Silva',
  });
  const user = await auth.verifyGoogleIdToken(okToken);
  assert.deepEqual(user, { email: 'alice@corp.test', name: 'Alice Silva', picture: null });

  const wrongDomain = signJwt({
    iss: 'https://accounts.google.com',
    aud: baseEnv.GOOGLE_CLIENT_ID,
    exp: now + 3600,
    email: 'alice@gmail.com',
    email_verified: true,
  });
  await assert.rejects(() => auth.verifyGoogleIdToken(wrongDomain), (e) => e.status === 403 && e.code === 'forbiddenDomain');

  const notInAllowlist = signJwt({
    iss: 'https://accounts.google.com',
    aud: baseEnv.GOOGLE_CLIENT_ID,
    exp: now + 3600,
    email: 'charlie@corp.test',
    email_verified: true,
  });
  await assert.rejects(() => auth.verifyGoogleIdToken(notInAllowlist), (e) => e.status === 403 && e.code === 'forbiddenEmail');

  const wrongAud = signJwt({
    iss: 'https://accounts.google.com',
    aud: 'other-client',
    exp: now + 3600,
    email: 'alice@corp.test',
    email_verified: true,
  });
  await assert.rejects(() => auth.verifyGoogleIdToken(wrongAud), (e) => e.status === 401 && e.code === 'invalidGoogleToken');
});

test('GOOGLE_AUTH_ENABLED=true: exige login Google antes do PAT e isola me por usuário', async () => {
  const env = {
    NODE_ENV: 'production',
    GOOGLE_AUTH_ENABLED: 'true',
    GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
    ALLOWED_EMAIL_DOMAIN: 'corp.test',
    SESSION_SECRET: 'fedcba9876543210fedcba9876543210fedcba9876543210',
    AZDO_ORG: 'org',
    AZDO_PROJECT: 'Proj',
    AZDO_TEAM: 'Team',
  };
  const validB64Alice = normalizeBasicPat('raw-pat-alice-1234567890', 'alice@corp.test');
  const validB64Bob = normalizeBasicPat('raw-pat-bob-1234567890', 'bob@corp.test');
  const evicted = [];

  const fetchImpl = async (url, init) => {
    if (String(url).includes('googleapis.com')) {
      return { ok: true, status: 200, json: async () => ({ keys: [testJwk] }) };
    }
    const authHeader = init?.headers?.Authorization || '';
    if (authHeader === `Basic ${validB64Alice}` || authHeader === `Basic ${validB64Bob}`) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ workItems: [] }),
      };
    }
    return {
      ok: true,
      status: 203,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      json: async () => ({}),
    };
  };

  const auth = createAuth({ env, fetchImpl, onPatClear: (p) => evicted.push(p) });
  const proc = loadProcess(JSON.parse(fs.readFileSync(new URL('./fixtures/process.json', import.meta.url))));
  const sharedMetaCache = { current: null };
  let metaCalls = 0;

  const app = express();
  app.use(express.json());
  app.use('/api', auth.csrfGuard);
  app.use('/api/auth', auth.createAuthRouter());
  app.use(
    '/api',
    auth.requireAuth,
    createRouter((req) =>
      createAzdo({
        env: { ...env, PERSONAL_ACCESS_TOKEN: req.userPat, AZDO_ME: req.user.email },
        proc,
        taskboard: null,
        userEmail: req.user.email,
        sharedMetaCache,
        callTool: async (name, args) => {
          if (name === 'work' && args.action === 'list_team_iterations') {
            metaCalls += 1;
            return [];
          }
          if (name === 'work' && args.action === 'get_team_settings') return { defaultAreaPath: 'Proj' };
          return null;
        },
      }),
    ),
  );
  app.use('/api', errorHandler);

  const srv = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const extractCookies = (res) =>
    (res.headers.getSetCookie?.() || [])
      .map((c) => c.split(';')[0])
      .filter((c) => !c.endsWith('='))
      .join('; ');

  try {
    const r1 = await fetch(`${base}/api/meta`);
    assert.equal(r1.status, 401);

    const rCsrf = await fetch(`${base}/api/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: 'x' }),
    });
    assert.equal(rCsrf.status, 403);

    const now = Math.floor(Date.now() / 1000);
    const aliceJwt = signJwt({
      iss: 'https://accounts.google.com',
      aud: env.GOOGLE_CLIENT_ID,
      exp: now + 3600,
      email: 'alice@corp.test',
      email_verified: true,
      name: 'Alice',
    });
    const rLogin = await fetch(`${base}/api/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'azdo-board' },
      body: JSON.stringify({ credential: aliceJwt }),
    });
    assert.equal(rLogin.status, 200);
    let aliceCookie = extractCookies(rLogin);

    const rNoPat = await fetch(`${base}/api/meta`, { headers: { cookie: aliceCookie } });
    assert.equal(rNoPat.status, 403);
    assert.equal((await rNoPat.json()).code, 'patRequired');

    const rGoodPat = await fetch(`${base}/api/auth/pat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'azdo-board', cookie: aliceCookie },
      body: JSON.stringify({ pat: 'raw-pat-alice-1234567890' }),
    });
    assert.equal(rGoodPat.status, 200);
    aliceCookie = `${aliceCookie}; ${extractCookies(rGoodPat)}`;

    const rMetaAlice = await fetch(`${base}/api/meta`, { headers: { cookie: aliceCookie } });
    assert.equal(rMetaAlice.status, 200);
    assert.equal((await rMetaAlice.json()).me, 'alice@corp.test');
    assert.equal(metaCalls, 1);

    const bobJwt = signJwt({
      iss: 'https://accounts.google.com',
      aud: env.GOOGLE_CLIENT_ID,
      exp: now + 3600,
      email: 'bob@corp.test',
      email_verified: true,
      name: 'Bob',
    });
    const rMetaBob = await fetch(`${base}/api/meta`, {
      headers: {
        authorization: `Bearer ${bobJwt}`,
        'x-azdo-pat': 'raw-pat-bob-1234567890',
      },
    });
    assert.equal(rMetaBob.status, 200);
    assert.equal((await rMetaBob.json()).me, 'bob@corp.test');
    assert.equal(metaCalls, 1);

    const rLogout = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { 'x-requested-with': 'azdo-board', cookie: aliceCookie },
    });
    assert.equal(rLogout.status, 200);
    assert.equal(patFingerprint(evicted[0]), patFingerprint(validB64Alice));
  } finally {
    srv.close();
  }
});

test('createMcpPool respeita limite máximo (LRU) e fecha clientes ociosos no sweepIdle', async () => {
  const closed = [];
  const pool = createMcpPool({
    env: { AZDO_ORG: 'org' },
    maxClients: 2,
    idleTtlMs: 100,
    connectImpl: async ({ pat }) => ({
      pat,
      close: async () => {
        closed.push(pat);
      },
    }),
  });

  try {
    await pool.getClientForPat('pat-1');
    await pool.getClientForPat('pat-2');
    assert.equal(pool.size(), 2);

    await pool.getClientForPat('pat-1');
    await pool.getClientForPat('pat-3');
    assert.equal(pool.size(), 2);
    assert.deepEqual(closed, ['pat-2']);

    await pool.sweepIdle(Date.now() + 500);
    assert.equal(pool.size(), 0);
    assert.ok(closed.includes('pat-1') && closed.includes('pat-3'));
  } finally {
    await pool.closeAll();
  }
});
