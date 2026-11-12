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

export interface MmoState {
  players: MmoPlayer[];
  cards: MmoCard[];
  posts: MmoFeedPost[];
}

const STATE_KEY = 'mmo_state_v2_nodemo';

db.exec(`
  CREATE TABLE IF NOT EXISTS mmo_kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Purge legacy demo state key if present
try {
  db.prepare(`DELETE FROM mmo_kv WHERE key = 'mmo_state_v1'`).run();
} catch {
  // Ignore if table just initialized
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
      lumenDust: 200,
      chromaticShards: 5,
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
      players: parsed.players || buildInitialMmoState().players,
      cards: parsed.cards || [],
      posts: parsed.posts || [],
    };
  } catch {
    const initial = buildInitialMmoState();
    saveMmoState(initial);
    return initial;
  }
}

export function saveMmoState(state: MmoState): void {
  db.prepare(
    `INSERT INTO mmo_kv (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(STATE_KEY, JSON.stringify(state));
}

export function resetMmoState(): MmoState {
  const fresh = buildInitialMmoState();
  saveMmoState(fresh);
  return fresh;
}

export function createNewMmoCardId(): string {
  return `card-${crypto.randomUUID().slice(0, 8)}`;
}
