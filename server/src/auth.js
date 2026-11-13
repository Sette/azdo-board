// Autenticação e gestão de credenciais multi-usuário:
// - Por padrão (`GOOGLE_AUTH_ENABLED=false`), o Google OAuth fica desabilitado, mas TODO usuário
//   precisa informar seu próprio Personal Access Token (PAT) do Azure DevOps na plataforma;
//   a identidade do usuário (nome e e-mail) é obtida diretamente do Azure DevOps (`_apis/connectionData`).
// - Com `GOOGLE_AUTH_ENABLED=true`, exige login Google (ID token RS256 validado contra JWKS do Google)
//   ANTES do cadastro do PAT individual.
// - Sessão e PAT trafegam apenas em cookies HttpOnly criptografados com AES-256-GCM (sem banco externo).
import crypto from 'node:crypto';
import { Router } from 'express';
import { McpError } from './mcp.js';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CLOCK_SKEW_SECONDS = 300;
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_MIN_REFRESH_MS = 30 * 1000;

const SESSION_COOKIE = 'azdo_session';
const PAT_COOKIE = 'azdo_pat';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isTruthyEnv(value, defaultValue = false) {
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

function serializeCookie(name, value, { maxAgeSec, secure, path = '/api' }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', 'SameSite=Lax'];
  if (typeof maxAgeSec === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// Empacota um objeto JSON com AES-256-GCM (IV de 12 bytes + tag de 16 bytes + AAD opcional).
export function sealPayload(key, payload, aad = '') {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${ct.toString('base64url')}.${tag.toString('base64url')}`;
}

export function unsealPayload(key, token, aad = '') {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'base64url');
    const ct = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    const data = JSON.parse(pt);
    if (!data || typeof data !== 'object') return null;
    if (typeof data.exp === 'number' && data.exp <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

// Aceita tanto o PAT cru copiado do Azure DevOps quanto base64 "email:pat" já codificado,
// devolvendo sempre o valor base64 esperado por `@azure-devops/mcp -a pat` e `Authorization: Basic`.
export function normalizeBasicPat(input, userEmail = '') {
  const cleaned = String(input || '')
    .trim()
    .replace(/^Basic\s+/i, '')
    .trim();
  if (!cleaned || cleaned.length < 10 || cleaned.length > 512 || /[\r\n\0]/.test(cleaned)) {
    throw new McpError('Invalid PAT format', { status: 400, code: 'invalidPat' });
  }
  if (cleaned.includes(':')) {
    const tokenPart = cleaned.slice(cleaned.indexOf(':') + 1).trim();
    if (tokenPart.length < 10) throw new McpError('Invalid PAT format', { status: 400, code: 'invalidPat' });
    return Buffer.from(cleaned, 'utf8').toString('base64');
  }
  if (cleaned.length % 4 === 0 && /^[A-Za-z0-9+/]+=*$/.test(cleaned)) {
    const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
    if (
      Buffer.from(decoded, 'utf8').toString('base64') === cleaned &&
      /^[\x20-\x7e]+$/.test(decoded) &&
      decoded.includes(':')
    ) {
      const tokenPart = decoded.slice(decoded.indexOf(':') + 1);
      if (tokenPart.length >= 10) return cleaned;
    }
  }
  return Buffer.from(`${userEmail || ''}:${cleaned}`, 'utf8').toString('base64');
}

function extractRawTokenFromB64(b64Pat) {
  const decoded = Buffer.from(String(b64Pat), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  return idx >= 0 ? decoded.slice(idx + 1) : decoded;
}

export function patFingerprint(b64Pat) {
  return crypto.createHash('sha256').update(String(b64Pat)).digest('hex').slice(0, 24);
}

// Rate-limiter simples por IP em memória (janela deslizante) para endpoints sensíveis de login/PAT.
export function createRateLimiter({ windowMs = 5 * 60 * 1000, max = 25 } = {}) {
  const hits = new Map();
  return function rateLimit(req, _res, next) {
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const prev = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (prev.length >= max) {
      return next(new McpError('Too many attempts', { status: 429, code: 'rateLimited' }));
    }
    prev.push(now);
    hits.set(ip, prev);
    if (hits.size > 500) {
      for (const [k, arr] of hits) {
        if (!arr.some((t) => now - t < windowMs)) hits.delete(k);
      }
    }
    return next();
  };
}

function extractAzdoUser(connData) {
  const u = connData?.authenticatedUser;
  if (!u || typeof u !== 'object') return null;
  const accountVal = u.properties?.Account?.$value || u.properties?.Account || '';
  const providerName = typeof u.providerDisplayName === 'string' ? u.providerDisplayName.trim() : '';
  const customName = typeof u.customDisplayName === 'string' ? u.customDisplayName.trim() : '';

  const emailCandidate = [accountVal, providerName].find((v) => typeof v === 'string' && v.includes('@'));
  const email = emailCandidate ? emailCandidate.trim().toLowerCase() : null;
  const name = customName || (providerName && !providerName.includes('@') ? providerName : null) || (email ? email.split('@')[0] : 'Azure DevOps User');
  return { email, name: String(name).slice(0, 120), picture: null };
}

export function createAuth({
  env = process.env,
  fetchImpl = globalThis.fetch,
  onPatClear,
} = {}) {
  const demo = env.AZDO_DEMO === '1';
  const authDisabled = isTruthyEnv(env.AUTH_DISABLED, false);
  const googleAuthEnabled = !demo && !authDisabled && isTruthyEnv(env.GOOGLE_AUTH_ENABLED, false);
  const patAuthRequired = !demo && !authDisabled && isTruthyEnv(env.PAT_AUTH_REQUIRED, true);
  const authRequired = googleAuthEnabled || patAuthRequired;

  const googleClientId = String(env.GOOGLE_CLIENT_ID || '').trim();
  if (googleAuthEnabled && !googleClientId) {
    throw new Error('GOOGLE_CLIENT_ID must be set when GOOGLE_AUTH_ENABLED=true');
  }

  const isProd = env.NODE_ENV === 'production' || Boolean(env.K_SERVICE);

  const allowedDomain = String(env.ALLOWED_EMAIL_DOMAIN || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const allowedEmails = String(env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const sessionTtlMs = Math.max(1, Number(env.SESSION_TTL_HOURS || 168)) * 3600 * 1000;
  const patTtlMs = Math.max(1, Number(env.PAT_TTL_HOURS || 720)) * 3600 * 1000;

  let rawSecret = String(env.SESSION_SECRET || '').trim();
  if (authRequired) {
    if (rawSecret.length < 32) {
      if (isProd) {
        throw new Error('SESSION_SECRET must be at least 32 characters in production');
      }
      rawSecret = crypto.randomBytes(32).toString('hex');
      console.warn('[auth] SESSION_SECRET ausente/curto; usando chave efêmera de desenvolvimento.');
    }
  } else if (!rawSecret) {
    rawSecret = 'local-dev-disabled-auth-placeholder-key';
  }

  const master = Buffer.from(rawSecret, 'utf8');
  const sessionKey = Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), 'azdo-board:session:v1', 32));
  const patKey = Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), 'azdo-board:pat:v1', 32));

  const patOnlyAad = 'pat-only-mode';
  const headerPatCache = new Map(); // fingerprint -> { user, b64Pat, at }
  let jwksCache = { keys: [], at: 0 };

  async function getGoogleJwk(kid) {
    const now = Date.now();
    const findKey = () => jwksCache.keys.find((k) => k.kid === kid);
    let jwk = now - jwksCache.at < JWKS_TTL_MS ? findKey() : null;
    if (!jwk && now - jwksCache.at >= JWKS_MIN_REFRESH_MS) {
      const res = await fetchImpl(GOOGLE_JWKS_URL);
      if (!res.ok) throw new Error(`Failed to load Google JWKS (${res.status})`);
      const data = await res.json();
      jwksCache = { keys: Array.isArray(data?.keys) ? data.keys : [], at: Date.now() };
      jwk = findKey();
    }
    return jwk || null;
  }

  async function verifyGoogleIdToken(idToken) {
    if (typeof idToken !== 'string') {
      throw new McpError('Invalid Google token', { status: 401, code: 'invalidGoogleToken' });
    }
    const parts = idToken.trim().split('.');
    if (parts.length !== 3) {
      throw new McpError('Invalid Google token', { status: 401, code: 'invalidGoogleToken' });
    }
    let header;
    let payload;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      throw new McpError('Invalid Google token', { status: 401, code: 'invalidGoogleToken' });
    }
    if (header?.alg !== 'RS256' || !header?.kid) {
      throw new McpError('Unsupported JWT header', { status: 401, code: 'invalidGoogleToken' });
    }
    let jwk;
    try {
      jwk = await getGoogleJwk(header.kid);
    } catch (err) {
      throw new McpError(err.message, { status: 502 });
    }
    if (!jwk) {
      throw new McpError('Unknown Google signing key', { status: 401, code: 'invalidGoogleToken' });
    }
    const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const validSig = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8'),
      pubKey,
      Buffer.from(parts[2], 'base64url'),
    );
    if (!validSig) {
      throw new McpError('Invalid Google token signature', { status: 401, code: 'invalidGoogleToken' });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (!GOOGLE_ISSUERS.has(payload?.iss)) {
      throw new McpError('Invalid token issuer', { status: 401, code: 'invalidGoogleToken' });
    }
    const audList = Array.isArray(payload?.aud) ? payload.aud : [payload?.aud];
    if (!audList.includes(googleClientId)) {
      throw new McpError('Invalid token audience', { status: 401, code: 'invalidGoogleToken' });
    }
    if (typeof payload?.exp !== 'number' || nowSec - CLOCK_SKEW_SECONDS >= payload.exp) {
      throw new McpError('Expired Google token', { status: 401, code: 'invalidGoogleToken' });
    }
    if (typeof payload?.nbf === 'number' && payload.nbf > nowSec + CLOCK_SKEW_SECONDS) {
      throw new McpError('Google token not yet valid', { status: 401, code: 'invalidGoogleToken' });
    }

    const email = payload?.email ? String(payload.email).trim().toLowerCase() : '';
    if (!email || payload.email_verified === false) {
      throw new McpError('Unverified Google email', { status: 401, code: 'invalidGoogleToken' });
    }
    if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
      throw new McpError(`Forbidden domain for ${email}`, {
        status: 403,
        code: 'forbiddenDomain',
        params: { email, domain: allowedDomain },
      });
    }
    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      throw new McpError(`Forbidden email ${email}`, {
        status: 403,
        code: 'forbiddenEmail',
        params: { email },
      });
    }

    return {
      email,
      name: payload.name ? String(payload.name).slice(0, 120) : email.split('@')[0],
      picture: payload.picture && /^https:\/\//i.test(String(payload.picture)) ? String(payload.picture).slice(0, 500) : null,
    };
  }

  // Confere se o PAT autentica no Azure DevOps, tem escopo de Work Items (Read) no projeto
  // e descobre a identidade do dono do PAT via `_apis/connectionData`.
  async function validateAzdoPat(b64Pat) {
    const org = env.AZDO_ORG;
    const project = env.AZDO_PROJECT;
    if (!org) throw new McpError('AZDO_ORG is not set', { status: 500, code: 'missingEnv', params: { name: 'AZDO_ORG' } });
    if (!project) throw new McpError('AZDO_PROJECT is not set', { status: 500, code: 'missingEnv', params: { name: 'AZDO_PROJECT' } });

    const commonHeaders = {
      Authorization: `Basic ${b64Pat}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const wiqlUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.1&$top=1`;
    const connUrl = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/connectionData`;

    let wiqlRes;
    let connRes;
    try {
      [wiqlRes, connRes] = await Promise.all([
        fetchImpl(wiqlUrl, {
          method: 'POST',
          redirect: 'manual',
          headers: commonHeaders,
          body: JSON.stringify({ query: 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project' }),
        }),
        fetchImpl(connUrl, {
          method: 'GET',
          redirect: 'manual',
          headers: commonHeaders,
        }).catch(() => null),
      ]);
    } catch (err) {
      throw new McpError(`Azure DevOps unreachable: ${err.message}`, { status: 502 });
    }

    const ct = String(wiqlRes.headers?.get?.('content-type') || '').toLowerCase();
    // PAT inválido no Azure DevOps frequentemente devolve 203 Non-Authoritative HTML ou 302 para _signin.
    if (wiqlRes.status !== 200 || ct.includes('text/html')) {
      throw new McpError('Invalid Azure DevOps PAT', { status: 401, code: 'invalidPat' });
    }
    const body = await wiqlRes.json().catch(() => null);
    if (!body || !Array.isArray(body.workItems)) {
      throw new McpError('Invalid Azure DevOps PAT response', { status: 401, code: 'invalidPat' });
    }

    let azdoUser = null;
    if (connRes && connRes.status === 200 && !String(connRes.headers?.get?.('content-type') || '').toLowerCase().includes('text/html')) {
      const connJson = await connRes.json().catch(() => null);
      azdoUser = extractAzdoUser(connJson);
    }
    return azdoUser;
  }

  function isSecureReq(req) {
    return Boolean(req.secure || isProd || req.get('x-forwarded-proto') === 'https');
  }

  function readCookiesState(req) {
    const cookies = parseCookies(req.headers?.cookie);
    if (googleAuthEnabled) {
      const session = unsealPayload(sessionKey, cookies[SESSION_COOKIE]);
      if (!session?.email) return { user: null, pat: null };
      const user = { email: session.email, name: session.name || session.email, picture: session.picture || null };
      const patData = unsealPayload(patKey, cookies[PAT_COOKIE], user.email);
      return { user, pat: patData?.pat || null };
    }
    // Sem Google OAuth: o próprio cookie criptografado do PAT carrega a identidade resolvida no Azure DevOps.
    const patData = unsealPayload(patKey, cookies[PAT_COOKIE], patOnlyAad);
    if (!patData?.pat) return { user: null, pat: null };
    const user = patData.user || { email: null, name: 'Azure DevOps', picture: null };
    return { user, pat: patData.pat };
  }

  async function resolveRequestIdentity(req) {
    const bearer = req.get('authorization');
    const headerPat = req.get('x-azdo-pat');

    if (googleAuthEnabled) {
      if (bearer?.startsWith('Bearer ')) {
        const user = await verifyGoogleIdToken(bearer.slice(7).trim());
        const pat = headerPat ? normalizeBasicPat(headerPat, user.email) : readCookiesState(req).pat;
        return { user, pat };
      }
      return readCookiesState(req);
    }

    if (headerPat) {
      const initial = normalizeBasicPat(headerPat);
      const fp = patFingerprint(initial);
      const cached = headerPatCache.get(fp);
      if (cached && Date.now() - cached.at < 15 * 60 * 1000) {
        return { user: cached.user, pat: cached.b64Pat };
      }
      const azdoUser = (await validateAzdoPat(initial)) || { email: null, name: 'Azure DevOps', picture: null };
      const finalPat = azdoUser.email ? normalizeBasicPat(extractRawTokenFromB64(initial), azdoUser.email) : initial;
      if (headerPatCache.size >= 32) headerPatCache.delete(headerPatCache.keys().next().value);
      headerPatCache.set(fp, { user: azdoUser, b64Pat: finalPat, at: Date.now() });
      return { user: azdoUser, pat: finalPat };
    }

    return readCookiesState(req);
  }

  // Protege mutações contra CSRF: exige header customizado (bloqueia HTML form / simple request) + Origin em prod.
  function csrfGuard(req, _res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    const hasBearer = Boolean(req.get('authorization')?.startsWith('Bearer '));
    const hasCustomHeader = req.get('x-requested-with') === 'azdo-board' || Boolean(req.get('x-azdo-pat'));
    if (!hasBearer && !hasCustomHeader) {
      return next(new McpError('Missing X-Requested-With header', { status: 403, code: 'csrfBlocked' }));
    }
    const origin = req.get('origin');
    if (origin && isProd) {
      try {
        if (new URL(origin).host !== req.get('host')) {
          return next(new McpError('Cross-origin request blocked', { status: 403, code: 'csrfBlocked' }));
        }
      } catch {
        return next(new McpError('Malformed Origin header', { status: 403, code: 'csrfBlocked' }));
      }
    }
    return next();
  }

  function createAuthRouter() {
    const r = Router();
    const limiter = createRateLimiter();
    const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

    r.get(
      '/status',
      wrap(async (req, res) => {
        if (!authRequired) {
          return res.json({
            authRequired: false,
            googleAuthEnabled: false,
            googleClientId: null,
            allowedDomain: null,
            org: env.AZDO_ORG || null,
            project: env.AZDO_PROJECT || null,
            lang: env.APP_LANG || null,
            authenticated: true,
            user: env.AZDO_ME ? { email: env.AZDO_ME, name: env.AZDO_ME.split('@')[0], picture: null } : null,
            hasPat: true,
          });
        }
        const { user, pat } = readCookiesState(req);
        return res.json({
          authRequired: true,
          googleAuthEnabled,
          googleClientId: googleAuthEnabled ? googleClientId : null,
          allowedDomain: googleAuthEnabled ? allowedDomain || null : null,
          org: env.AZDO_ORG || null,
          project: env.AZDO_PROJECT || null,
          lang: env.APP_LANG || null,
          // Quando Google OAuth está desabilitado, não há etapa de login Google antes do PAT.
          authenticated: googleAuthEnabled ? Boolean(user) : true,
          user: user || null,
          hasPat: Boolean(pat),
        });
      }),
    );

    r.post(
      '/google',
      limiter,
      wrap(async (req, res) => {
        if (!googleAuthEnabled) return res.json({ ok: true });
        const user = await verifyGoogleIdToken(req.body?.credential);
        const prev = readCookiesState(req);
        const token = sealPayload(sessionKey, {
          ...user,
          exp: Date.now() + sessionTtlMs,
        });
        const secure = isSecureReq(req);
        const cookies = [serializeCookie(SESSION_COOKIE, token, { maxAgeSec: sessionTtlMs / 1000, secure })];
        let hasPat = false;
        if (prev.user && prev.user.email !== user.email) {
          if (prev.pat) await onPatClear?.(prev.pat);
          cookies.push(serializeCookie(PAT_COOKIE, '', { maxAgeSec: 0, secure }));
        } else {
          const existingPat = unsealPayload(patKey, parseCookies(req.headers?.cookie)[PAT_COOKIE], user.email);
          hasPat = Boolean(existingPat?.pat);
        }
        res.setHeader('Set-Cookie', cookies);
        return res.json({ ok: true, user, hasPat });
      }),
    );

    r.post(
      '/pat',
      limiter,
      wrap(async (req, res) => {
        if (!authRequired) return res.json({ ok: true, hasPat: true });
        const state = googleAuthEnabled
          ? await resolveRequestIdentity(req)
          : readCookiesState(req);

        if (googleAuthEnabled && !state.user) {
          throw new McpError('Sign in required', { status: 401, code: 'unauthenticated' });
        }

        const initialPat = normalizeBasicPat(req.body?.pat, state.user?.email || '');
        const azdoUser = await validateAzdoPat(initialPat);

        const effectiveUser = googleAuthEnabled
          ? state.user
          : azdoUser || { email: null, name: 'Azure DevOps', picture: null };

        // No modo sem Google, se o PAT foi colado cru e descobrimos o e-mail pelo Azure DevOps,
        // grava "email:raw_pat" em base64 para máxima compatibilidade com todas as tools.
        const finalPat =
          !googleAuthEnabled && effectiveUser.email && !String(req.body?.pat || '').includes(':')
            ? normalizeBasicPat(extractRawTokenFromB64(initialPat), effectiveUser.email)
            : initialPat;

        if (state.pat && state.pat !== finalPat) await onPatClear?.(state.pat);

        const aad = googleAuthEnabled ? effectiveUser.email : patOnlyAad;
        const sealed = sealPayload(
          patKey,
          {
            pat: finalPat,
            user: googleAuthEnabled ? undefined : effectiveUser,
            exp: Date.now() + patTtlMs,
          },
          aad,
        );
        res.setHeader('Set-Cookie', serializeCookie(PAT_COOKIE, sealed, { maxAgeSec: patTtlMs / 1000, secure: isSecureReq(req) }));
        return res.json({ ok: true, hasPat: true, user: effectiveUser });
      }),
    );

    r.delete(
      '/pat',
      wrap(async (req, res) => {
        const { pat } = readCookiesState(req);
        if (pat) await onPatClear?.(pat);
        res.setHeader('Set-Cookie', serializeCookie(PAT_COOKIE, '', { maxAgeSec: 0, secure: isSecureReq(req) }));
        return res.json({ ok: true, hasPat: false });
      }),
    );

    r.post(
      '/logout',
      wrap(async (req, res) => {
        const { pat } = readCookiesState(req);
        if (pat) await onPatClear?.(pat);
        const secure = isSecureReq(req);
        res.setHeader('Set-Cookie', [
          serializeCookie(SESSION_COOKIE, '', { maxAgeSec: 0, secure }),
          serializeCookie(PAT_COOKIE, '', { maxAgeSec: 0, secure }),
        ]);
        return res.json({ ok: true });
      }),
    );

    return r;
  }

  function requireAuth(req, _res, next) {
    if (!authRequired) return next();
    resolveRequestIdentity(req)
      .then(({ user, pat }) => {
        if (googleAuthEnabled && !user) {
          return next(new McpError('Sign in required', { status: 401, code: 'unauthenticated' }));
        }
        if (!pat) {
          return next(new McpError('PAT required', { status: 403, code: 'patRequired' }));
        }
        req.user = user || { email: null, name: 'Azure DevOps', picture: null };
        req.userPat = pat;
        return next();
      })
      .catch(next);
  }

  return {
    authRequired,
    googleAuthEnabled,
    patAuthRequired,
    csrfGuard,
    requireAuth,
    createAuthRouter,
    verifyGoogleIdToken,
    validateAzdoPat,
  };
}
