import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOADS_DIR } from './db.ts';
import type {
  ElementType,
  PhotoCategory,
  CardRole,
  RarityTier,
  FoilTier,
  CardAbility,
} from './cardForge.ts';

export type FactionId = 'Helios' | 'Umbra' | 'Prism';

export type VibeType = 'cool' | 'cute' | 'scary' | 'funny' | 'chill' | 'epic';

export type VibeCounts = Record<VibeType, number>;

export interface MmoCard {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerHandle: string;
  ownerFaction: FactionId;
  isWild?: boolean;
  wildEncounters?: number;
  wildWins?: number;
  title: string;
  epithet: string;
  caption: string;
  imageUrl: string;
  avifUrl?: string;
  blurDataUrl?: string;
  dominantColor: string;
  element: ElementType;
  category: PhotoCategory;
  categoryConfidence?: number;
  categoryBonusLabel?: string;
  categoryReason?: string;
  vibeCounts?: VibeCounts;
  dominantVibe?: VibeType;
  role: CardRole;
  rarity: RarityTier;
  foil: FoilTier;
  opticalTrait: string;
  secondaryTrait?: string;
  level: number;
  ascensionTier: number;
  hypeCount: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
  powerRating: number;
  ability: CardAbility;
  exif: {
    camera: string;
    lens: string;
    focalLength: string;
    aperture: string;
    shutterSpeed: string;
    iso: string;
  };
  colorTelemetry: {
    r: number;
    g: number;
    b: number;
    luminance: number;
    contrast: number;
    saturation: number;
  };
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  savingsPercent: number;
  createdAt: string;
}

export interface FeedComment {
  id: string;
  authorName: string;
  authorHandle: string;
  authorFaction: FactionId;
  text: string;
  createdAt: string;
}

export interface MmoFeedPost {
  id: string;
  cardId: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorFaction: FactionId;
  isWildPost?: boolean;
  caption: string;
  hypeCount: number;
  comments: FeedComment[];
  createdAt: string;
}

export interface MmoPlayer {
  id: string;
  username: string;
  displayName: string;
  faction: FactionId;
  title: string;
  level: number;
  xp: number;
  lumenDust: number;
  chromaticShards: number;
  eloRating: number;
  wins: number;
  losses: number;
  squadCardIds: string[];
  isNpc: boolean;
}

export interface MmoUserCredential {
  id: string;
  username: string;
  displayName: string;
  phoneNumber?: string;
  faction: FactionId;
  passwordHash: string;
  salt: string;
}

export interface MmoState {
  players: MmoPlayer[];
  cards: MmoCard[];
  posts: MmoFeedPost[];
  authCredentials?: MmoUserCredential[];
}

const STATE_KEY = 'mmo_state_v3_clean';
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_SECRET =
  process.env.SESSION_SECRET ||
  process.env.TWILIO_AUTH_TOKEN ||
  'chromarift-phone-otp-hmac-key-2026';

db.exec(`
  CREATE TABLE IF NOT EXISTS mmo_kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mmo_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    phone_number TEXT,
    password_hash TEXT NOT NULL DEFAULT '',
    salt TEXT NOT NULL DEFAULT '',
    faction TEXT NOT NULL DEFAULT 'Helios',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS phone_verifications (
    id TEXT PRIMARY KEY,
    phone_number TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Safely migrate older mmo_users table if phone_number column is missing
try {
  const cols = db.prepare(`PRAGMA table_info(mmo_users)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'phone_number')) {
    db.exec(`ALTER TABLE mmo_users ADD COLUMN phone_number TEXT;`);
  }
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mmo_users_phone ON mmo_users(phone_number) WHERE phone_number IS NOT NULL AND phone_number != '';`
  );
} catch {
  // Ignore migration race
}

// Purge legacy pre-wipe state keys if present
try {
  db.prepare(`DELETE FROM mmo_kv WHERE key IN ('mmo_state_v1', 'mmo_state_v2_nodemo')`).run();
} catch {
  // Ignore
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex');
}

function hashOtpCode(phone: string, code: string, salt: string): string {
  return crypto
    .createHmac('sha256', OTP_SECRET)
    .update(`${phone}:${code}:${salt}`)
    .digest('hex');
}

function signOtpToken(payload: {
  id: string;
  phone: string;
  codeHash: string;
  salt: string;
  expiresAt: number;
}): string {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', OTP_SECRET).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyOtpTokenSignature(token: string): {
  id: string;
  phone: string;
  codeHash: string;
  salt: string;
  expiresAt: number;
} | null {
  if (!token || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  if (!b64 || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', OTP_SECRET).update(b64).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function normalizePhoneNumber(
  rawPhone: string,
  defaultCountryCode = '+1'
): { ok: true; phone: string } | { ok: false; error: string } {
  const trimmed = (rawPhone || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Please enter your phone number.' };
  }

  // Strip spaces, dashes, parens, dots
  const compact = trimmed.replace(/[\s\-().]/g, '');
  let normalized = '';

  if (compact.startsWith('+')) {
    const digits = compact.slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      return {
        ok: false,
        error: 'Enter a valid international phone number (8–15 digits after +).',
      };
    }
    normalized = `+${digits}`;
  } else if (compact.startsWith('00')) {
    const digits = compact.slice(2).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, error: 'Enter a valid phone number.' };
    }
    normalized = `+${digits}`;
  } else {
    const digits = compact.replace(/\D/g, '');
    if (digits.length === 10) {
      const cc = defaultCountryCode.startsWith('+')
        ? defaultCountryCode
        : `+${defaultCountryCode.replace(/\D/g, '') || '1'}`;
      normalized = `${cc}${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      normalized = `+${digits}`;
    } else if (digits.length >= 8 && digits.length <= 15) {
      const cc = defaultCountryCode.replace(/\D/g, '');
      normalized = cc && !digits.startsWith(cc) ? `+${cc}${digits}` : `+${digits}`;
    } else {
      return {
        ok: false,
        error: 'Enter a valid phone number (e.g. (555) 234-5678 or +44 7700 900123).',
      };
    }
  }

  return { ok: true, phone: normalized };
}

export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return phone;
  const prefix =
    phone.startsWith('+1') && digits.length === 11
      ? '+1'
      : phone.slice(0, Math.min(3, phone.length));
  return `${prefix} ••• ••• ${digits.slice(-4)}`;
}

export interface MmoUserAccount {
  id: string;
  username: string;
  displayName: string;
  phoneMasked?: string;
  faction: FactionId;
}

export function listRegisteredAccounts(): MmoUserAccount[] {
  try {
    const rows = db
      .prepare(
        'SELECT id, username, display_name, phone_number, faction FROM mmo_users ORDER BY created_at ASC'
      )
      .all() as Array<{
      id: string;
      username: string;
      display_name: string;
      phone_number?: string | null;
      faction: FactionId;
    }>;
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      phoneMasked: r.phone_number ? maskPhoneNumber(r.phone_number) : undefined,
      faction: r.faction || 'Helios',
    }));
  } catch {
    return [];
  }
}

function listAllUserCredentials(): MmoUserCredential[] {
  try {
    const rows = db
      .prepare(
        'SELECT id, username, display_name, phone_number, faction, password_hash, salt FROM mmo_users ORDER BY created_at ASC'
      )
      .all() as Array<{
      id: string;
      username: string;
      display_name: string;
      phone_number?: string | null;
      faction: FactionId;
      password_hash: string;
      salt: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      phoneNumber: r.phone_number || undefined,
      faction: r.faction || 'Helios',
      passwordHash: r.password_hash || '',
      salt: r.salt || '',
    }));
  } catch {
    return [];
  }
}

async function sendTwilioSms(phone: string, code: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const msgServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();

  if (!sid || !token || (!from && !msgServiceSid)) {
    return false;
  }

  try {
    const body = new URLSearchParams();
    body.set('To', phone);
    if (msgServiceSid) {
      body.set('MessagingServiceSid', msgServiceSid);
    } else if (from) {
      body.set('From', from);
    }
    body.set(
      'Body',
      `Your CHROMARIFT verification code is ${code}. It expires in 10 minutes.`
    );

    const authHeader = Buffer.from(`${sid}:${token}`).toString('base64');
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

export async function requestPhoneVerificationCode(
  phoneRaw: string,
  countryCode = '+1'
): Promise<
  | {
      ok: true;
      phone: string;
      maskedPhone: string;
      otpToken: string;
      expiresAt: number;
      isExistingUser: boolean;
      existingUsername?: string;
      existingDisplayName?: string;
      deliveryMode: 'sms' | 'dev-preview';
      devCode?: string;
    }
  | { ok: false; error: string }
> {
  const parsed = normalizePhoneNumber(phoneRaw, countryCode);
  if (!parsed.ok) return parsed;

  const phone = parsed.phone;
  const code = String(crypto.randomInt(100000, 999999));
  const salt = crypto.randomBytes(12).toString('hex');
  const codeHash = hashOtpCode(phone, code, salt);
  const expiresAt = Date.now() + OTP_TTL_MS;
  const id = `otp-${crypto.randomUUID()}`;

  try {
    db.prepare('DELETE FROM phone_verifications WHERE expires_at < ? OR phone_number = ?').run(
      Date.now(),
      phone
    );
    db.prepare(
      `INSERT INTO phone_verifications (id, phone_number, code_hash, salt, expires_at, attempts, verified)
       VALUES (?, ?, ?, ?, ?, 0, 0)`
    ).run(id, phone, codeHash, salt, expiresAt);
  } catch {
    // Stateless otpToken handles cold-start edge cases even if SQLite write skips
  }

  const existingUser = db
    .prepare('SELECT id, username, display_name FROM mmo_users WHERE phone_number = ?')
    .get(phone) as { id: string; username: string; display_name: string } | undefined;

  const sentViaTwilio = await sendTwilioSms(phone, code);
  const otpToken = signOtpToken({ id, phone, codeHash, salt, expiresAt });

  return {
    ok: true,
    phone,
    maskedPhone: maskPhoneNumber(phone),
    otpToken,
    expiresAt,
    isExistingUser: Boolean(existingUser),
    existingUsername: existingUser?.username,
    existingDisplayName: existingUser?.display_name,
    deliveryMode: sentViaTwilio ? 'sms' : 'dev-preview',
    devCode: sentViaTwilio ? undefined : code,
  };
}

export function verifyPhoneCodeAndAuthenticate(params: {
  phoneRaw: string;
  countryCode?: string;
  codeRaw: string;
  otpToken?: string;
  displayNameRaw?: string;
  usernameRaw?: string;
  factionRaw?: FactionId;
}):
  | {
      ok: true;
      isNewUser: boolean;
      phone: string;
      account: MmoUserAccount;
      player: MmoPlayer;
    }
  | { ok: false; error: string } {
  const parsed = normalizePhoneNumber(params.phoneRaw, params.countryCode || '+1');
  if (!parsed.ok) return parsed;
  const phone = parsed.phone;

  const cleanCode = (params.codeRaw || '').replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    return { ok: false, error: 'Please enter the 6-digit verification code.' };
  }

  // Verify against SQLite row first, then fall back to signed stateless otpToken
  const otpRow = db
    .prepare(
      `SELECT id, code_hash, salt, expires_at, attempts, verified
       FROM phone_verifications
       WHERE phone_number = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(phone) as
    | {
        id: string;
        code_hash: string;
        salt: string;
        expires_at: number;
        attempts: number;
        verified: number;
      }
    | undefined;

  let codeVerified = false;

  if (otpRow && otpRow.verified === 0) {
    if (otpRow.expires_at < Date.now()) {
      return { ok: false, error: 'Verification code expired. Request a new code.' };
    }
    if (otpRow.attempts >= 5) {
      return { ok: false, error: 'Too many invalid attempts. Request a new verification code.' };
    }
    const expected = hashOtpCode(phone, cleanCode, otpRow.salt);
    if (expected === otpRow.code_hash) {
      db.prepare('UPDATE phone_verifications SET verified = 1 WHERE id = ?').run(otpRow.id);
      codeVerified = true;
    } else {
      db.prepare('UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = ?').run(
        otpRow.id
      );
      return { ok: false, error: 'Invalid verification code. Please double-check and try again.' };
    }
  } else if (params.otpToken) {
    const tokenData = verifyOtpTokenSignature(params.otpToken);
    if (!tokenData || tokenData.phone !== phone) {
      return { ok: false, error: 'Invalid verification session. Request a new code.' };
    }
    if (tokenData.expiresAt < Date.now()) {
      return { ok: false, error: 'Verification code expired. Request a new code.' };
    }
    const expected = hashOtpCode(phone, cleanCode, tokenData.salt);
    if (expected === tokenData.codeHash) {
      codeVerified = true;
    } else {
      return { ok: false, error: 'Invalid verification code. Please double-check and try again.' };
    }
  }

  if (!codeVerified) {
    return { ok: false, error: 'No active verification code found. Tap "Send Code" first.' };
  }

  const state = getMmoState();

  // Check if user already exists with this phone number -> log straight in!
  const existingRow = db
    .prepare(
      'SELECT id, username, display_name, phone_number, faction FROM mmo_users WHERE phone_number = ?'
    )
    .get(phone) as
    | {
        id: string;
        username: string;
        display_name: string;
        phone_number: string;
        faction: FactionId;
      }
    | undefined;

  if (existingRow) {
    const account: MmoUserAccount = {
      id: existingRow.id,
      username: existingRow.username,
      displayName: existingRow.display_name,
      phoneMasked: maskPhoneNumber(existingRow.phone_number),
      faction: existingRow.faction || 'Helios',
    };
    const player = ensurePlayerInState(state, account);
    saveMmoState(state);
    return {
      ok: true,
      isNewUser: false,
      phone,
      account,
      player,
    };
  }

  // New user signup -> zero friction! Auto-generate handle if blank.
  const digits = phone.replace(/\D/g, '');
  const last4 = digits.slice(-4) || '0000';
  const requestedRaw = (params.usernameRaw || params.displayNameRaw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');

  let baseUsername = requestedRaw.length >= 2 ? requestedRaw.slice(0, 20) : `player_${last4}`;
  let candidateUsername = baseUsername;
  let suffix = 1;
  while (
    db.prepare('SELECT id FROM mmo_users WHERE username = ?').get(candidateUsername)
  ) {
    candidateUsername = `${baseUsername}${suffix}`;
    suffix++;
  }

  const displayName =
    (params.displayNameRaw || '').trim() ||
    (params.usernameRaw || '').trim() ||
    `Player ${last4}`;

  const faction: FactionId =
    params.factionRaw && ['Helios', 'Umbra', 'Prism'].includes(params.factionRaw)
      ? params.factionRaw
      : 'Helios';

  const id = `player-${crypto.randomUUID().slice(0, 10)}`;

  db.prepare(
    `INSERT INTO mmo_users (id, username, display_name, phone_number, password_hash, salt, faction)
     VALUES (?, ?, ?, ?, '', '', ?)`
  ).run(id, candidateUsername, displayName, phone, faction);

  const account: MmoUserAccount = {
    id,
    username: candidateUsername,
    displayName,
    phoneMasked: maskPhoneNumber(phone),
    faction,
  };
  const player = ensurePlayerInState(state, account);
  saveMmoState(state);

  return {
    ok: true,
    isNewUser: true,
    phone,
    account,
    player,
  };
}

export function registerMmoAccount(
  usernameRaw: string,
  displayNameRaw: string,
  passwordRaw: string,
  factionRaw?: FactionId
): { ok: true; account: MmoUserAccount; player: MmoPlayer } | { ok: false; error: string } {
  const username = usernameRaw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!username || username.length < 2) {
    return {
      ok: false,
      error: 'Username must be at least 2 characters (letters, numbers, _ or -).',
    };
  }
  if (!passwordRaw || passwordRaw.length < 3) {
    return { ok: false, error: 'Password must be at least 3 characters.' };
  }

  const existing = db
    .prepare('SELECT id FROM mmo_users WHERE username = ?')
    .get(username) as { id: string } | undefined;
  if (existing) {
    return {
      ok: false,
      error: `Username @${username} is already taken. Please sign in with your phone or password.`,
    };
  }

  const displayName = (displayNameRaw || username).trim();
  const faction: FactionId =
    factionRaw && ['Helios', 'Umbra', 'Prism'].includes(factionRaw)
      ? factionRaw
      : 'Helios';
  const id = `player-${username}`;
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(passwordRaw, salt);

  db.prepare(
    `INSERT INTO mmo_users (id, username, display_name, password_hash, salt, faction)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, username, displayName, passwordHash, salt, faction);

  const state = getMmoState();
  const player = ensurePlayerInState(state, { id, username, displayName, faction });
  saveMmoState(state);

  return {
    ok: true,
    account: { id, username, displayName, faction },
    player,
  };
}

export function loginMmoAccount(
  usernameRaw: string,
  passwordRaw?: string
): { ok: true; account: MmoUserAccount; player: MmoPlayer } | { ok: false; error: string } {
  const username = usernameRaw
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (!username) {
    return { ok: false, error: 'Please enter your username.' };
  }
  if (!passwordRaw) {
    return { ok: false, error: 'Please enter your password to log in.' };
  }

  const row = db
    .prepare(
      'SELECT id, username, display_name, phone_number, password_hash, salt, faction FROM mmo_users WHERE username = ?'
    )
    .get(username) as
    | {
        id: string;
        username: string;
        display_name: string;
        phone_number?: string | null;
        password_hash: string;
        salt: string;
        faction: FactionId;
      }
    | undefined;

  const state = getMmoState();

  if (!row) {
    return {
      ok: false,
      error: `Account @${username} not found. Sign up easily using your phone number!`,
    };
  }

  if (!row.password_hash || !row.salt) {
    return {
      ok: false,
      error: `Account @${username} uses Phone Number Verification. Enter your phone number to sign in!`,
    };
  }

  const candidateHash = hashPassword(passwordRaw, row.salt);
  if (candidateHash !== row.password_hash) {
    return { ok: false, error: 'Incorrect password for @' + username + '.' };
  }

  const account: MmoUserAccount = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    phoneMasked: row.phone_number ? maskPhoneNumber(row.phone_number) : undefined,
    faction: row.faction || 'Helios',
  };
  const player = ensurePlayerInState(state, account);
  saveMmoState(state);

  return { ok: true, account, player };
}

export function ensurePlayerInState(
  state: MmoState,
  account: { id: string; username: string; displayName: string; faction?: FactionId }
): MmoPlayer {
  let player = state.players.find(
    (p) =>
      p.id === account.id ||
      p.username.toLowerCase() === account.username.toLowerCase()
  );
  if (!player) {
    player = {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      faction: account.faction || 'Helios',
      title: 'Lumenmancer Initiate',
      level: 1,
      xp: 0,
      lumenDust: 250,
      chromaticShards: 8,
      eloRating: 1000,
      wins: 0,
      losses: 0,
      squadCardIds: [],
      isNpc: false,
    };
    state.players.push(player);
  }
  return player;
}

function buildInitialMmoState(): MmoState {
  return {
    players: [],
    cards: [],
    posts: [],
    authCredentials: listAllUserCredentials(),
  };
}

export function getMmoState(): MmoState {
  const row = db
    .prepare('SELECT value FROM mmo_kv WHERE key = ?')
    .get(STATE_KEY) as { value: string } | undefined;
  if (!row) {
    const initial = buildInitialMmoState();
    saveMmoState(initial);
    return initial;
  }
  try {
    const parsed = JSON.parse(row.value) as MmoState;
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
      cards: parsed.cards || [],
      posts: parsed.posts || [],
      authCredentials: listAllUserCredentials(),
    };
  } catch {
    const initial = buildInitialMmoState();
    saveMmoState(initial);
    return initial;
  }
}

export function saveMmoState(state: MmoState): void {
  state.authCredentials = listAllUserCredentials();
  db.prepare(
    `INSERT INTO mmo_kv (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(STATE_KEY, JSON.stringify(state));
}

export function mergeClientStateIntoServer(clientState: Partial<MmoState>): MmoState {
  const state = getMmoState();
  let changed = false;

  // 0. Restore accounts from client state if serverless DB cold-started
  if (Array.isArray(clientState.authCredentials)) {
    for (const cred of clientState.authCredentials) {
      if (!cred || !cred.id || !cred.username) continue;
      if (!cred.phoneNumber && (!cred.passwordHash || !cred.salt)) continue;
      try {
        const cleanUser = cred.username.trim().toLowerCase();
        db.prepare(
          `INSERT OR IGNORE INTO mmo_users (id, username, display_name, phone_number, password_hash, salt, faction)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          cred.id,
          cleanUser,
          cred.displayName || cred.username,
          cred.phoneNumber || null,
          cred.passwordHash || '',
          cred.salt || '',
          cred.faction || 'Helios'
        );
      } catch {
        // Ignore duplicate account
      }
    }
  }

  // 1. Merge players
  if (Array.isArray(clientState.players)) {
    for (const cp of clientState.players) {
      if (!cp || !cp.id || !cp.username) continue;

      const existing = state.players.find(
        (sp) => sp.id === cp.id || sp.username.toLowerCase() === cp.username.toLowerCase()
      );
      if (!existing) {
        state.players.push(cp);
        changed = true;
      } else {
        // Restore squadCardIds or higher progression if server cold-started
        if (
          existing.squadCardIds.length === 0 &&
          Array.isArray(cp.squadCardIds) &&
          cp.squadCardIds.length > 0
        ) {
          existing.squadCardIds = cp.squadCardIds;
          changed = true;
        }
        if ((cp.xp || 0) > (existing.xp || 0) || (cp.level || 1) > (existing.level || 1)) {
          existing.level = Math.max(existing.level, cp.level || 1);
          existing.xp = Math.max(existing.xp, cp.xp || 0);
          existing.lumenDust = Math.max(existing.lumenDust, cp.lumenDust || 0);
          existing.chromaticShards = Math.max(
            existing.chromaticShards,
            cp.chromaticShards || 0
          );
          existing.wins = Math.max(existing.wins, cp.wins || 0);
          existing.losses = Math.max(existing.losses, cp.losses || 0);
          changed = true;
        }
      }
    }
  }

  // 2. Merge uploaded cards
  if (Array.isArray(clientState.cards)) {
    const serverCardMap = new Map(state.cards.map((c) => [c.id, c]));
    for (const cc of clientState.cards) {
      if (!cc || !cc.id || !cc.imageUrl) continue;
      const existingCard = serverCardMap.get(cc.id);
      if (!existingCard) {
        state.cards.push(cc);
        serverCardMap.set(cc.id, cc);
        changed = true;
      } else if ((cc.powerRating || 0) > (existingCard.powerRating || 0)) {
        Object.assign(existingCard, cc);
        changed = true;
      }
    }
  }

  // 3. Merge social feed posts
  if (Array.isArray(clientState.posts)) {
    const serverPostMap = new Map(state.posts.map((p) => [p.id, p]));
    for (const cp of clientState.posts) {
      if (!cp || !cp.id || !cp.cardId) continue;
      const existingPost = serverPostMap.get(cp.id);
      if (!existingPost) {
        state.posts.push(cp);
        serverPostMap.set(cp.id, cp);
        changed = true;
      } else if (
        (cp.hypeCount || 0) > (existingPost.hypeCount || 0) ||
        (cp.comments?.length || 0) > (existingPost.comments?.length || 0)
      ) {
        existingPost.hypeCount = Math.max(existingPost.hypeCount, cp.hypeCount || 0);
        if ((cp.comments?.length || 0) > (existingPost.comments?.length || 0)) {
          existingPost.comments = cp.comments;
        }
        changed = true;
      }
    }
  }

  if (changed) {
    saveMmoState(state);
  }
  return state;
}

export function resetMmoState(): MmoState {
  try {
    db.exec(`
      DELETE FROM mmo_kv;
      DELETE FROM mmo_users;
      DELETE FROM phone_verifications;
      DELETE FROM sessions;
      DELETE FROM photos;
      DELETE FROM inquiries;
    `);
  } catch {
    // Ignore missing tables
  }

  for (const sub of ['thumb', 'gallery', 'lightbox', 'originals']) {
    const dir = path.join(UPLOADS_DIR, sub);
    try {
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          fs.rmSync(path.join(dir, f), { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  const fresh = buildInitialMmoState();
  saveMmoState(fresh);
  return fresh;
}

export function createNewMmoCardId(): string {
  return `card-${crypto.randomUUID().slice(0, 8)}`;
}
