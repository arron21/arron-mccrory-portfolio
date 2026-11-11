import type { Request, Response, NextFunction, Router } from 'express';
import crypto from 'node:crypto';
import { db, getSettings } from './db.ts';

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl?: string;
  provider: 'github' | 'google' | 'local-owner';
}

const COOKIE_NAME = 'arron_portfolio_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.GITHUB_CLIENT_SECRET ||
  process.env.ADMIN_PASSCODE ||
  'arron-mccrory-portfolio-studio-hmac-key-2026';

function signPayload(payloadB64: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
}

export function createSession(res: Response, user: SessionUser): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payloadB64 = Buffer.from(JSON.stringify({ user, expiresAt }), 'utf8').toString(
    'base64url'
  );
  const sig = signPayload(payloadB64);
  const token = `${payloadB64}.${sig}`;

  try {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    db.prepare(
      'INSERT OR REPLACE INTO sessions (token, user_json, expires_at) VALUES (?, ?, ?)'
    ).run(token, JSON.stringify(user), expiresAt);
  } catch {
    // Ignore SQLite write issue if stateless token is used
  }

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });

  return token;
}

export function getSessionUser(req: Request): SessionUser | null {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || typeof token !== 'string') return null;

  // 1. Verify stateless HMAC token (works across all Vercel serverless instances)
  if (token.includes('.')) {
    const [payloadB64, sig] = token.split('.');
    if (payloadB64 && sig && signPayload(payloadB64) === sig) {
      try {
        const decoded = JSON.parse(
          Buffer.from(payloadB64, 'base64url').toString('utf8')
        ) as { user: SessionUser; expiresAt: number };
        if (decoded.expiresAt > Date.now() && decoded.user) {
          return decoded.user;
        }
      } catch {
        // Fall through to SQLite check
      }
    }
  }

  // 2. Fallback to SQLite session lookup
  const row = db
    .prepare('SELECT user_json, expires_at FROM sessions WHERE token = ?')
    .get(token) as { user_json: string; expires_at: number } | undefined;

  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  try {
    return JSON.parse(row.user_json) as SessionUser;
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in to Studio.' });
    return;
  }
  (req as Request & { user?: SessionUser }).user = user;
  next();
}

export function registerAuthRoutes(router: Router) {
  router.get('/auth/status', (req: Request, res: Response) => {
    const user = getSessionUser(req);
    const settings = getSettings();

    const githubConfigured = Boolean(
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    );
    const googleConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    );
    const passcodeRequired = Boolean(settings.fallbackPasscode?.trim());

    res.json({
      authenticated: Boolean(user),
      user,
      providers: {
        github: {
          configured: githubConfigured,
          allowedUser: settings.allowedGithubUser || 'arron21',
        },
        google: {
          configured: googleConfigured,
          allowedEmail: settings.allowedGoogleEmail,
        },
        devFallback: {
          enabled: true,
          passcodeRequired,
        },
      },
    });
  });

  // Local Owner / Dev Fallback Sign-In (when OAuth keys aren't set yet or using fallback passcode)
  router.post('/auth/dev-login', (req: Request, res: Response) => {
    const settings = getSettings();
    const { passcode } = (req.body || {}) as { passcode?: string };

    if (settings.fallbackPasscode && settings.fallbackPasscode.trim() !== '') {
      if (!passcode || passcode !== settings.fallbackPasscode) {
        res.status(403).json({
          error: 'Invalid studio passcode. Please enter your configured owner passcode.',
        });
        return;
      }
    }

    const user: SessionUser = {
      id: 'owner-arron21',
      name: settings.photographerName || 'Arron McCrory',
      username: settings.allowedGithubUser || 'arron21',
      email: settings.allowedGoogleEmail || '2738674+arron21@users.noreply.github.com',
      provider: 'local-owner',
    };

    createSession(res, user);
    res.json({ ok: true, user });
  });

  // GitHub OAuth 2.0 Redirect
  router.get('/auth/github', (req: Request, res: Response) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      res.redirect('/?auth_error=github_not_configured');
      return;
    }
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/auth/github/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  // GitHub OAuth 2.0 Callback
  router.get('/auth/github/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!code || !clientId || !clientSecret) {
      res.redirect('/?auth_error=github_missing_code');
      return;
    }

    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        res.redirect('/?auth_error=github_token_failed');
        return;
      }

      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ArronMcCrory-Portfolio',
        },
      });
      const ghUser = (await userRes.json()) as {
        id: number;
        login: string;
        name?: string;
        email?: string;
        avatar_url?: string;
      };

      const settings = getSettings();
      const allowedUser = (settings.allowedGithubUser || 'arron21').trim().toLowerCase();
      if (!ghUser.login || ghUser.login.toLowerCase() !== allowedUser) {
        res.redirect('/?auth_error=unauthorized_github_user');
        return;
      }

      createSession(res, {
        id: `github-${ghUser.id}`,
        name: ghUser.name || ghUser.login,
        username: ghUser.login,
        email: ghUser.email || settings.allowedGoogleEmail,
        avatarUrl: ghUser.avatar_url,
        provider: 'github',
      });

      res.redirect('/?studio=1');
    } catch {
      res.redirect('/?auth_error=github_callback_failed');
    }
  });

  // Google OAuth 2.0 Redirect
  router.get('/auth/google', (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.redirect('/?auth_error=google_not_configured');
      return;
    }
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // Google OAuth 2.0 Callback
  router.get('/auth/google/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!code || !clientId || !clientSecret) {
      res.redirect('/?auth_error=google_missing_code');
      return;
    }

    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        res.redirect('/?auth_error=google_token_failed');
        return;
      }

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const gUser = (await profileRes.json()) as {
        id: string;
        email: string;
        name?: string;
        picture?: string;
      };

      const settings = getSettings();
      const allowedEmail = (settings.allowedGoogleEmail || '').trim().toLowerCase();
      if (!gUser.email || (allowedEmail && gUser.email.toLowerCase() !== allowedEmail)) {
        res.redirect('/?auth_error=unauthorized_google_user');
        return;
      }

      createSession(res, {
        id: `google-${gUser.id}`,
        name: gUser.name || settings.photographerName,
        username: gUser.email.split('@')[0],
        email: gUser.email,
        avatarUrl: gUser.picture,
        provider: 'google',
      });

      res.redirect('/?studio=1');
    } catch {
      res.redirect('/?auth_error=google_callback_failed');
    }
  });

  router.post('/auth/logout', (req: Request, res: Response) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });
}
