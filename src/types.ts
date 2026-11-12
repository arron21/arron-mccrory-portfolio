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

export interface MmoState {
  players: MmoPlayer[];
  cards: MmoCard[];
  posts: MmoFeedPost[];
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
