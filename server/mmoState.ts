import crypto from 'node:crypto';
import { db } from './db.ts';
import type {
  ElementType,
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
  title: string;
  epithet: string;
  caption: string;
  imageUrl: string;
  avifUrl?: string;
  blurDataUrl?: string;
  dominantColor: string;
  element: ElementType;
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

export interface MmoWorldZone {
  id: string;
  name: string;
  subtitle: string;
  element: ElementType;
  description: string;
  bannerUrl: string;
  heliosControl: number;
  umbraControl: number;
  prismControl: number;
  guardianPlayerId: string;
  raidBoss: {
    id: string;
    name: string;
    epithet: string;
    element: ElementType;
    imageUrl: string;
    maxHp: number;
    currentHp: number;
    atk: number;
    def: number;
    spd: number;
    crit: number;
    abilityName: string;
    abilityDesc: string;
    rewardLumen: number;
    rewardShards: number;
  };
}

db.exec(`
  CREATE TABLE IF NOT EXISTS mmo_kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const ABILITIES: Record<ElementType, CardAbility> = {
  Solar: {
    name: 'Helios Corona Nova',
    trigger: 'ON_ATTACK_2',
    triggerLabel: 'Every 2nd Action',
    description:
      'Unleashes a solar flare dealing 135% ATK to the target + 55% splash to adjacent enemies, and grants all allies a 15% Max HP Radiant Shield.',
    powerScale: 1.35,
    effectType: 'aoe_burn',
  },
  Abyssal: {
    name: 'Trench Undertow',
    trigger: 'ON_ATTACK_2',
    triggerLabel: 'Every 2nd Action',
    description:
      'Crushes the target with deep-sea pressure for 145% ATK, permanently shredding 25% of their DEF and restoring 20% Max HP to self.',
    powerScale: 1.45,
    effectType: 'armor_shred_heal',
  },
  Crimson: {
    name: 'Blood-Shutter Cleave',
    trigger: 'ON_CRIT',
    triggerLabel: 'On Critical Hit (or Every 2nd Action)',
    description:
      'Rend the enemy for 160% ATK (+30% bonus against targets below 50% HP) and drain 45% of damage dealt as Crimson Life.',
    powerScale: 1.6,
    effectType: 'lifesteal_exec',
  },
  Verdant: {
    name: 'Bioluminescent Spore-Ward',
    trigger: 'ON_BATTLE_START',
    triggerLabel: 'Battle Start & Every 2nd Action',
    description:
      'Strikes for 125% ATK while healing the most injured ally for 28% Max HP and coating the frontline in Reflective Briars.',
    powerScale: 1.25,
    effectType: 'team_heal_thorns',
  },
  Astral: {
    name: 'Celestial Parallax Beam',
    trigger: 'ON_ATTACK_2',
    triggerLabel: 'Every 2nd Action',
    description:
      'Fires a refracted starlight beam at the enemy backline for 150% ATK and boosts the entire squad’s Crit Chance by +12%.',
    powerScale: 1.5,
    effectType: 'chain_crit',
  },
  Monochrome: {
    name: 'Silver-Halide Phantom Strike',
    trigger: 'ON_HURT',
    triggerLabel: 'On Taking Damage & Every 2nd Action',
    description:
      'Phases through shadows to deal 140% True Damage (ignoring DEF) and permanently steals 8 SPD from the target.',
    powerScale: 1.4,
    effectType: 'true_counter',
  },
};

export interface MmoState {
  players: MmoPlayer[];
  cards: MmoCard[];
  posts: MmoFeedPost[];
  zones: MmoWorldZone[];
}

function buildInitialMmoState(): MmoState {
  const starterCards: MmoCard[] = [
    {
      id: 'card-starter-solar',
      ownerId: 'player-arron21',
      ownerName: 'Arron McCrory',
      ownerHandle: 'arron21',
      ownerFaction: 'Helios',
      title: 'Eclipse Obelisk of Vik',
      epithet: 'Corona Sovereign',
      caption: 'Captured at totality over black volcanic basalt; the corona ring bound a Solar Vanguard into the plate.',
      imageUrl: '/cards/solar.webp',
      dominantColor: '#c9973e',
      element: 'Solar',
      role: 'Vanguard',
      rarity: 'Legendary',
      foil: 'Holo',
      opticalTrait: 'Deep-Field Bulwark',
      level: 3,
      ascensionTier: 1,
      hypeCount: 14,
      hp: 1180,
      atk: 162,
      def: 92,
      spd: 112,
      crit: 22,
      powerRating: 945,
      ability: ABILITIES.Solar,
      exif: {
        camera: 'Fujifilm GFX 100 II',
        lens: 'GF 23mm f/4 R LM WR',
        focalLength: '23mm',
        aperture: 'f/8.0',
        shutterSpeed: '1/250s',
        iso: 'ISO 160',
      },
      colorTelemetry: { r: 164, g: 128, b: 68, luminance: 132, contrast: 64, saturation: 96 },
      originalSizeBytes: 24800000,
      optimizedSizeBytes: 56800,
      savingsPercent: 99.8,
      createdAt: '2h ago',
    },
    {
      id: 'card-starter-crimson',
      ownerId: 'player-arron21',
      ownerName: 'Arron McCrory',
      ownerHandle: 'arron21',
      ownerFaction: 'Helios',
      title: 'Sanguine Spire of Nocturne',
      epithet: 'Blood-Moon Valkyrie',
      caption: 'Shot wide open at f/1.4 during a blood-moon ember storm. Lethal critical strike velocity.',
      imageUrl: '/cards/crimson.webp',
      dominantColor: '#8f2929',
      element: 'Crimson',
      role: 'Striker',
      rarity: 'Epic',
      foil: 'Holo',
      opticalTrait: 'Bokeh Assassin',
      level: 2,
      ascensionTier: 1,
      hypeCount: 9,
      hp: 920,
      atk: 204,
      def: 64,
      spd: 134,
      crit: 36,
      powerRating: 968,
      ability: ABILITIES.Crimson,
      exif: {
        camera: 'Leica Q3',
        lens: 'Summilux 28mm f/1.7 ASPH',
        focalLength: '56mm',
        aperture: 'f/1.4',
        shutterSpeed: '1/1000s',
        iso: 'ISO 800',
      },
      colorTelemetry: { r: 158, g: 54, b: 52, luminance: 85, contrast: 71, saturation: 106 },
      originalSizeBytes: 19400000,
      optimizedSizeBytes: 49200,
      savingsPercent: 99.7,
      createdAt: '5h ago',
    },
    {
      id: 'card-starter-verdant',
      ownerId: 'player-arron21',
      ownerName: 'Arron McCrory',
      ownerHandle: 'arron21',
      ownerFaction: 'Helios',
      title: 'Reliquary of Emerald Spores',
      epithet: 'Spore-Glass Warden',
      caption: 'Deep inside the sunken Victorian glasshouse where bioluminescent moss mends any fractured armor.',
      imageUrl: '/cards/verdant.webp',
      dominantColor: '#2d6e40',
      element: 'Verdant',
      role: 'Bruiser',
      rarity: 'Epic',
      foil: 'Standard',
      opticalTrait: 'Prime-Lens Precision',
      level: 2,
      ascensionTier: 0,
      hypeCount: 7,
      hp: 1090,
      atk: 158,
      def: 84,
      spd: 108,
      crit: 20,
      powerRating: 882,
      ability: ABILITIES.Verdant,
      exif: {
        camera: 'Fujifilm X-T5',
        lens: 'XF 35mm f/1.4 R',
        focalLength: '35mm',
        aperture: 'f/2.8',
        shutterSpeed: '1/160s',
        iso: 'ISO 320',
      },
      colorTelemetry: { r: 62, g: 148, b: 74, luminance: 114, contrast: 58, saturation: 86 },
      originalSizeBytes: 16200000,
      optimizedSizeBytes: 149000,
      savingsPercent: 99.1,
      createdAt: '1d ago',
    },
    {
      id: 'card-starter-astral',
      ownerId: 'player-arron21',
      ownerName: 'Arron McCrory',
      ownerHandle: 'arron21',
      ownerFaction: 'Helios',
      title: 'Zenith Armillary of Aether',
      epithet: 'Zenith Chronomancer',
      caption: 'High-altitude astrophotography plate combiningaurora turquoise with galactic core starlight.',
      imageUrl: '/cards/astral.webp',
      dominantColor: '#3b82a6',
      element: 'Astral',
      role: 'Arcanist',
      rarity: 'Legendary',
      foil: 'Prismatic',
      opticalTrait: 'High-ISO Overclock',
      level: 3,
      ascensionTier: 2,
      hypeCount: 19,
      hp: 890,
      atk: 212,
      def: 68,
      spd: 142,
      crit: 32,
      powerRating: 995,
      ability: ABILITIES.Astral,
      exif: {
        camera: 'Sony A7R V',
        lens: 'FE 135mm f/1.8 GM',
        focalLength: '135mm',
        aperture: 'f/1.8',
        shutterSpeed: '1/500s',
        iso: 'ISO 3200',
      },
      colorTelemetry: { r: 112, g: 142, b: 178, luminance: 138, contrast: 74, saturation: 66 },
      originalSizeBytes: 31500000,
      optimizedSizeBytes: 120000,
      savingsPercent: 99.6,
      createdAt: '1d ago',
    },
    // Rival MMO Cards
    {
      id: 'card-rival-abyssal',
      ownerId: 'npc-lyra',
      ownerName: 'Lyra Vance',
      ownerHandle: 'lyra_umbra',
      ownerFaction: 'Umbra',
      title: 'Arch of the Pelagic Abyss',
      epithet: 'Trench Leviathan',
      caption: '30-second coastal exposure under bioluminescent tide. None can breach this tidal bastion.',
      imageUrl: '/cards/abyssal.webp',
      dominantColor: '#1e3a6e',
      element: 'Abyssal',
      role: 'Vanguard',
      rarity: 'Mythic',
      foil: 'Prismatic',
      opticalTrait: 'Long-Exposure Bastion',
      level: 4,
      ascensionTier: 2,
      hypeCount: 27,
      hp: 1260,
      atk: 176,
      def: 98,
      spd: 118,
      crit: 24,
      powerRating: 1020,
      ability: ABILITIES.Abyssal,
      exif: {
        camera: 'Hasselblad X2D 100C',
        lens: 'XCD 21mm f/4',
        focalLength: '21mm',
        aperture: 'f/11',
        shutterSpeed: '15s',
        iso: 'ISO 64',
      },
      colorTelemetry: { r: 38, g: 72, b: 148, luminance: 74, contrast: 68, saturation: 110 },
      originalSizeBytes: 42000000,
      optimizedSizeBytes: 52000,
      savingsPercent: 99.9,
      createdAt: '35m ago',
    },
    {
      id: 'card-rival-monochrome',
      ownerId: 'npc-lyra',
      ownerName: 'Lyra Vance',
      ownerHandle: 'lyra_umbra',
      ownerFaction: 'Umbra',
      title: 'Brutalist Watchtower IX',
      epithet: 'Null-Light Stalker',
      caption: 'Silver-gelatin monochrome study. Strips enemy armor entirely with pure chiaroscuro contrast.',
      imageUrl: '/cards/monochrome.webp',
      dominantColor: '#52525b',
      element: 'Monochrome',
      role: 'Striker',
      rarity: 'Legendary',
      foil: 'Holo',
      opticalTrait: 'Fast-Shutter Blitz',
      level: 3,
      ascensionTier: 1,
      hypeCount: 21,
      hp: 960,
      atk: 218,
      def: 72,
      spd: 148,
      crit: 34,
      powerRating: 988,
      ability: ABILITIES.Monochrome,
      exif: {
        camera: 'Leica M11 Monochrom',
        lens: 'Noctilux-M 50mm f/1.2',
        focalLength: '50mm',
        aperture: 'f/1.2',
        shutterSpeed: '1/4000s',
        iso: 'ISO 125',
      },
      colorTelemetry: { r: 118, g: 118, b: 118, luminance: 118, contrast: 82, saturation: 0 },
      originalSizeBytes: 28400000,
      optimizedSizeBytes: 73000,
      savingsPercent: 99.7,
      createdAt: '1h ago',
    },
  ];

  const players: MmoPlayer[] = [
    {
      id: 'player-arron21',
      username: 'arron21',
      displayName: 'Arron McCrory',
      faction: 'Helios',
      title: 'Grand Lumenmancer',
      level: 5,
      xp: 450,
      lumenDust: 750,
      chromaticShards: 24,
      eloRating: 1320,
      wins: 6,
      losses: 1,
      squadCardIds: [
        'card-starter-solar',
        'card-starter-verdant',
        'card-starter-crimson',
        'card-starter-astral',
      ],
      isNpc: false,
    },
    {
      id: 'npc-lyra',
      username: 'lyra_umbra',
      displayName: 'Lyra Vance',
      faction: 'Umbra',
      title: 'Arch-Stalker of Nocturne',
      level: 7,
      xp: 920,
      lumenDust: 1400,
      chromaticShards: 40,
      eloRating: 1410,
      wins: 19,
      losses: 4,
      squadCardIds: [
        'card-rival-abyssal',
        'card-rival-monochrome',
        'card-starter-crimson',
        'card-starter-astral',
      ],
      isNpc: true,
    },
    {
      id: 'npc-kaelen',
      username: 'sol_archon',
      displayName: 'Kaelen Thorne',
      faction: 'Helios',
      title: 'Solaris Vanguard',
      level: 6,
      xp: 710,
      lumenDust: 980,
      chromaticShards: 28,
      eloRating: 1365,
      wins: 14,
      losses: 5,
      squadCardIds: [
        'card-starter-solar',
        'card-starter-crimson',
        'card-starter-verdant',
        'card-starter-astral',
      ],
      isNpc: true,
    },
    {
      id: 'npc-sora',
      username: 'prism_sora',
      displayName: 'Sora Takahashi',
      faction: 'Prism',
      title: 'Chromatic Alchemist',
      level: 6,
      xp: 640,
      lumenDust: 890,
      chromaticShards: 31,
      eloRating: 1295,
      wins: 11,
      losses: 6,
      squadCardIds: [
        'card-starter-verdant',
        'card-rival-abyssal',
        'card-starter-astral',
        'card-rival-monochrome',
      ],
      isNpc: true,
    },
  ];

  const posts: MmoFeedPost[] = [
    {
      id: 'post-1',
      cardId: 'card-rival-abyssal',
      authorId: 'npc-lyra',
      authorName: 'Lyra Vance',
      authorHandle: 'lyra_umbra',
      authorFaction: 'Umbra',
      caption:
        '15-second long exposure at midnight low tide forged a Mythic Abyssal Vanguard! Who dares challenge my Umbra Tide-Wall in the Auto-Arena?',
      hypeCount: 27,
      comments: [
        {
          id: 'c-1',
          authorName: 'Sora Takahashi',
          authorHandle: 'prism_sora',
          authorFaction: 'Prism',
          text: 'That f/11 DEF stat is absurd. Bringing my Astral Chronomancer to snipe your backline!',
          createdAt: '24m ago',
        },
      ],
      createdAt: '35m ago',
    },
    {
      id: 'post-2',
      cardId: 'card-rival-monochrome',
      authorId: 'npc-lyra',
      authorName: 'Lyra Vance',
      ownerFaction: 'Umbra',
      authorHandle: 'lyra_umbra',
      authorFaction: 'Umbra',
      caption:
        'Zero color saturation = pure Monochrome True Damage. Shot at 1/4000s on the M11 Monochrom for 148 Speed initiative.',
      hypeCount: 21,
      comments: [],
      createdAt: '1h ago',
    } as MmoFeedPost,
    {
      id: 'post-3',
      cardId: 'card-starter-solar',
      authorId: 'player-arron21',
      authorName: 'Arron McCrory',
      authorHandle: 'arron21',
      authorFaction: 'Helios',
      caption:
        'Totality over volcanic black sand. Forged my frontline Solar Obelisk with 1,180 HP and team-wide Radiant Shields.',
      hypeCount: 14,
      comments: [
        {
          id: 'c-2',
          authorName: 'Kaelen Thorne',
          authorHandle: 'sol_archon',
          authorFaction: 'Helios',
          text: 'Glory to the Order of Helios! Dropped a Hype boost to buff your frontline.',
          createdAt: '1h ago',
        },
      ],
      createdAt: '2h ago',
    },
    {
      id: 'post-4',
      cardId: 'card-starter-astral',
      authorId: 'player-arron21',
      authorName: 'Arron McCrory',
      authorHandle: 'arron21',
      authorFaction: 'Helios',
      caption:
        'ISO 3200 alpine astrophotography unlocked High-ISO Overclock and a Prismatic Foil border.',
      hypeCount: 19,
      comments: [],
      createdAt: '1d ago',
    },
  ];

  const zones: MmoWorldZone[] = [
    {
      id: 'zone-helios-citadel',
      name: 'Helios Sun-Citadel',
      subtitle: 'Sector I · Volcanic Eclipse Coast',
      element: 'Solar',
      description:
        'Basalt obelisks that focus golden twilight into impenetrable frontline shields. Solar cards gain +10% ATK here.',
      bannerUrl: '/cards/solar.webp',
      heliosControl: 54,
      umbraControl: 24,
      prismControl: 22,
      guardianPlayerId: 'npc-kaelen',
      raidBoss: {
        id: 'boss-solaris',
        name: 'SOLARIS-PRIME, The Eclipse Titan',
        epithet: 'World Raid Boss · Tier V',
        element: 'Solar',
        imageUrl: '/cards/solar.webp',
        maxHp: 25000,
        currentHp: 17450,
        atk: 265,
        def: 95,
        spd: 115,
        crit: 25,
        abilityName: 'Cataclysmic Totality',
        abilityDesc: 'Scorches all enemy slots for 140% Solar damage every 2nd turn.',
        rewardLumen: 240,
        rewardShards: 6,
      },
    },
    {
      id: 'zone-abyssal-trench',
      name: 'Pelagic Basalt Trench',
      subtitle: 'Sector II · Bioluminescent Midnight Sea',
      element: 'Abyssal',
      description:
        'Submerged stone arches echoing with tidal resonance. Long-exposure plates thrive in its crushing pressure.',
      bannerUrl: '/cards/abyssal.webp',
      heliosControl: 22,
      umbraControl: 56,
      prismControl: 22,
      guardianPlayerId: 'npc-lyra',
      raidBoss: {
        id: 'boss-leviathan',
        name: 'CHARYBDIS-IX, Abyssal Sovereign',
        epithet: 'World Raid Boss · Tier V',
        element: 'Abyssal',
        imageUrl: '/cards/abyssal.webp',
        maxHp: 28000,
        currentHp: 21200,
        atk: 245,
        def: 115,
        spd: 108,
        crit: 22,
        abilityName: 'Crushing Maelstrom',
        abilityDesc: 'Shreds 30% DEF across the challenger squad and heals from deep currents.',
        rewardLumen: 260,
        rewardShards: 7,
      },
    },
    {
      id: 'zone-verdant-conservatory',
      name: 'Sunken Spore Conservatory',
      subtitle: 'Sector III · Overgrown Glass Sanctuary',
      element: 'Verdant',
      description:
        'An ancient iron-and-glass cathedral reclaimed by glowing emerald flora and regenerative spores.',
      bannerUrl: '/cards/verdant.webp',
      heliosControl: 26,
      umbraControl: 24,
      prismControl: 50,
      guardianPlayerId: 'npc-sora',
      raidBoss: {
        id: 'boss-mycelid',
        name: 'VERIDIAN-ZERO, The Glass Colossus',
        epithet: 'World Raid Boss · Tier V',
        element: 'Verdant',
        imageUrl: '/cards/verdant.webp',
        maxHp: 24000,
        currentHp: 14900,
        atk: 235,
        def: 105,
        spd: 112,
        crit: 20,
        abilityName: 'Overgrowth Tempest',
        abilityDesc: 'Envelops the arena in reflective briars and regenerates vitality.',
        rewardLumen: 230,
        rewardShards: 6,
      },
    },
    {
      id: 'zone-crimson-caldera',
      name: 'Nocturne Blood-Spire',
      subtitle: 'Sector IV · Ash & Crimson Stormfront',
      element: 'Crimson',
      description:
        'Gothic spires bathed in blood-moon lightning where high-crit Bokeh Assassins duel for supremacy.',
      bannerUrl: '/cards/crimson.webp',
      heliosControl: 41,
      umbraControl: 39,
      prismControl: 20,
      guardianPlayerId: 'npc-lyra',
      raidBoss: {
        id: 'boss-valkyrie',
        name: 'IGNIS-VALKYRIA, Blood-Moon Archon',
        epithet: 'World Raid Boss · Tier V',
        element: 'Crimson',
        imageUrl: '/cards/crimson.webp',
        maxHp: 26000,
        currentHp: 19800,
        atk: 290,
        def: 85,
        spd: 138,
        crit: 38,
        abilityName: 'Scarlet Guillotine',
        abilityDesc: 'Executes weakened frontliners and siphons life on every critical hit.',
        rewardLumen: 250,
        rewardShards: 7,
      },
    },
  ];

  return { players, cards: starterCards, posts, zones };
}

export function getMmoState(): MmoState {
  const row = db.prepare('SELECT value FROM mmo_kv WHERE key = ?').get('mmo_state_v1') as
    | { value: string }
    | undefined;
  if (!row) {
    const initial = buildInitialMmoState();
    saveMmoState(initial);
    return initial;
  }
  try {
    return JSON.parse(row.value) as MmoState;
  } catch {
    const initial = buildInitialMmoState();
    saveMmoState(initial);
    return initial;
  }
}

export function saveMmoState(state: MmoState): void {
  db.prepare(
    `INSERT INTO mmo_kv (key, value, updated_at)
     VALUES ('mmo_state_v1', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(JSON.stringify(state));
}

export function createNewMmoCardId(): string {
  return `card-${crypto.randomUUID().slice(0, 8)}`;
}
