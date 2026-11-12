export type ElementType =
  | 'Solar'
  | 'Abyssal'
  | 'Crimson'
  | 'Verdant'
  | 'Astral'
  | 'Monochrome';

export type PhotoCategory =
  | 'Portrait'
  | 'Architecture'
  | 'Nature'
  | 'Still Life'
  | 'Street & Action'
  | 'Macro & Wildlife'
  | 'Night & Astro'
  | 'Fine Art & Abstract';

export type VibeType = 'cool' | 'cute' | 'scary' | 'funny' | 'chill' | 'epic';

export type VibeCounts = Record<VibeType, number>;

export interface VibeDefinition {
  id: VibeType;
  label: string;
  emoji: string;
  shortStat: string;
  description: string;
  color: string;
}

export const VIBE_DEFINITIONS: VibeDefinition[] = [
  {
    id: 'cool',
    label: 'Cool',
    emoji: '😎',
    shortStat: '+SPD / +ATK',
    description: '+4 SPD & +10 ATK per click',
    color: '#38bdf8',
  },
  {
    id: 'cute',
    label: 'Cute',
    emoji: '🥺',
    shortStat: '+HP / +DEF',
    description: '+55 HP & +12 DEF per click',
    color: '#f472b6',
  },
  {
    id: 'scary',
    label: 'Scary',
    emoji: '💀',
    shortStat: '+ATK / +HP',
    description: '+22 ATK & +20 HP per click',
    color: '#f87171',
  },
  {
    id: 'funny',
    label: 'Funny',
    emoji: '😂',
    shortStat: '+3% CRIT',
    description: '+3% CRIT Chance & +8 ATK per click',
    color: '#facc15',
  },
  {
    id: 'chill',
    label: 'Chill',
    emoji: '🌊',
    shortStat: '+DEF / +HP',
    description: '+18 DEF & +40 HP per click',
    color: '#4ade80',
  },
  {
    id: 'epic',
    label: 'Epic',
    emoji: '🔥',
    shortStat: '+ALL STATS',
    description: '+12 ATK, +8 DEF, +2 SPD & +1% CRIT per click',
    color: '#c084fc',
  },
];

export type CardRole = 'Vanguard' | 'Bruiser' | 'Striker' | 'Arcanist';

export type RarityTier = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export type FoilTier = 'Standard' | 'Holo' | 'Prismatic' | 'MythicRelic';

export type FactionId = 'Helios' | 'Umbra' | 'Prism';

export interface ExifData {
  camera: string;
  lens: string;
  focalLength: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
  takenAt?: string;
}

export interface CardAbility {
  name: string;
  trigger: 'ON_ATTACK_2' | 'ON_BATTLE_START' | 'ON_CRIT' | 'ON_HURT';
  triggerLabel: string;
  description: string;
  powerScale: number;
  effectType:
    | 'aoe_burn'
    | 'armor_shred_heal'
    | 'lifesteal_exec'
    | 'team_heal_thorns'
    | 'chain_crit'
    | 'true_counter';
}

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
  category?: PhotoCategory;
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
  exif: ExifData;
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

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl?: string;
  provider?: string;
}

export interface MmoUserAccount {
  id: string;
  username: string;
  displayName: string;
  faction: FactionId;
}

export interface MmoState {
  players: MmoPlayer[];
  cards: MmoCard[];
  posts: MmoFeedPost[];
  sessionUser?: SessionUser | null;
  activePlayerId?: string;
  accounts?: MmoUserAccount[];
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : val >= 100 ? 0 : 1)} ${units[idx]}`;
}
