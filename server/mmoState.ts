import crypto from 'node:crypto';
import { db } from './db.ts';
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

const STATE_KEY = 'mmo_state_v2_nodemo';

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
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    faction TEXT NOT NULL DEFAULT 'Helios',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Purge legacy demo state key if present
try {
  db.prepare(`DELETE FROM mmo_kv WHERE key = 'mmo_state_v1'`).run();
} catch {
  // Ignore if table just initialized
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex');
}

// Ensure default owner account exists in mmo_users
try {
  const existingOwner = db
    .prepare('SELECT id FROM mmo_users WHERE username = ?')
    .get('arron21') as { id: string } | undefined;
  if (!existingOwner) {
    const salt = crypto.randomBytes(16).toString('hex');
    const defaultPass = process.env.ADMIN_PASSCODE || 'chromarift';
    const hash = hashPassword(defaultPass, salt);
    db.prepare(
      `INSERT INTO mmo_users (id, username, display_name, password_hash, salt, faction)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('player-arron21', 'arron21', 'Arron McCrory', hash, salt, 'Helios');
  }
} catch {
  // Ignore seed race
}

export interface MmoUserAccount {
  id: string;
  username: string;
  displayName: string;
  faction: FactionId;
}

export function listRegisteredAccounts(): MmoUserAccount[] {
  try {
    const rows = db
      .prepare(
        'SELECT id, username, display_name, faction FROM mmo_users ORDER BY created_at ASC'
      )
      .all() as Array<{
      id: string;
      username: string;
      display_name: string;
      faction: FactionId;
    }>;
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
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
        'SELECT id, username, display_name, faction, password_hash, salt FROM mmo_users ORDER BY created_at ASC'
      )
      .all() as Array<{
      id: string;
      username: string;
      display_name: string;
      faction: FactionId;
      password_hash: string;
      salt: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      faction: r.faction || 'Helios',
      passwordHash: r.password_hash,
      salt: r.salt,
    }));
  } catch {
    return [];
  }
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
    return { ok: false, error: `Username @${username} is already taken. Please log in with your password!` };
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
      'SELECT id, username, display_name, password_hash, salt, faction FROM mmo_users WHERE username = ?'
    )
    .get(username) as
    | {
        id: string;
        username: string;
        display_name: string;
        password_hash: string;
        salt: string;
        faction: FactionId;
      }
    | undefined;

  const state = getMmoState();

  if (!row) {
    return {
      ok: false,
      error: `Account @${username} not found. Switch to "Create New User" to register your own account!`,
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
  const players: MmoPlayer[] = [
    {
      id: 'player-arron21',
      username: 'arron21',
      displayName: 'Arron McCrory',
      faction: 'Helios',
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
    },
  ];

  return {
    players,
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
      players:
        parsed.players && parsed.players.length > 0
          ? parsed.players
          : buildInitialMmoState().players,
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

  // 0. Restore salted password hashes from client state if serverless DB cold-started
  if (Array.isArray(clientState.authCredentials)) {
    for (const cred of clientState.authCredentials) {
      if (!cred || !cred.id || !cred.username || !cred.passwordHash || !cred.salt) continue;
      try {
        const cleanUser = cred.username.trim().toLowerCase();
        db.prepare(
          `INSERT OR IGNORE INTO mmo_users (id, username, display_name, password_hash, salt, faction)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          cred.id,
          cleanUser,
          cred.displayName || cred.username,
          cred.passwordHash,
          cred.salt,
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
  const fresh = buildInitialMmoState();
  saveMmoState(fresh);
  return fresh;
}

export function createNewMmoCardId(): string {
  return `card-${crypto.randomUUID().slice(0, 8)}`;
}
