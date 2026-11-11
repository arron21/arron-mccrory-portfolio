import sharp from 'sharp';
import type { ExtractedExif } from './optimizer.ts';

export type ElementType =
  | 'Solar'
  | 'Abyssal'
  | 'Crimson'
  | 'Verdant'
  | 'Astral'
  | 'Monochrome';

export type CardRole = 'Vanguard' | 'Bruiser' | 'Striker' | 'Arcanist';

export type RarityTier = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export type FoilTier = 'Standard' | 'Holo' | 'Prismatic' | 'MythicRelic';

export interface CardAbility {
  name: string;
  trigger: 'ON_ATTACK_2' | 'ON_BATTLE_START' | 'ON_CRIT' | 'ON_HURT';
  triggerLabel: string;
  description: string;
  powerScale: number;
  effectType: 'aoe_burn' | 'armor_shred_heal' | 'lifesteal_exec' | 'team_heal_thorns' | 'chain_crit' | 'true_counter';
}

export interface ForgedCardStats {
  element: ElementType;
  role: CardRole;
  rarity: RarityTier;
  foil: FoilTier;
  opticalTrait: string;
  epithet: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  crit: number;
  powerRating: number;
  ability: CardAbility;
  colorTelemetry: {
    r: number;
    g: number;
    b: number;
    luminance: number;
    contrast: number;
    saturation: number;
  };
}

const ELEMENT_ABILITIES: Record<ElementType, CardAbility> = {
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

const ELEMENT_EPITHETS: Record<ElementType, string[]> = {
  Solar: ['Obelisk of Dawn', 'Helios Sentinel', 'Corona Sovereign', 'Aureate Templar'],
  Abyssal: ['Trench Leviathan', 'Pelagic Oracle', 'Sapphire Kraken', 'Tidebinder Wraith'],
  Crimson: ['Blood-Moon Valkyrie', 'Cinder Archon', 'Scarlet Reaver', 'Ember Executioner'],
  Verdant: ['Overgrown Colossus', 'Spore-Glass Warden', 'Emerald Mycelid', 'Sylvan Reliquary'],
  Astral: ['Zenith Chronomancer', 'Nebula Astrolabe', 'Starforged Seraph', 'Parallax Seer'],
  Monochrome: ['Brutalist Specter', 'Noir Arbitrator', 'Chiaroscuro Phantom', 'Null-Light Stalker'],
};

function parseShutterSpeedSeconds(shutter: string): number {
  if (!shutter) return 0.008; // default ~1/125s
  const clean = shutter.replace(/s$/i, '').trim();
  if (clean.includes('/')) {
    const [num, den] = clean.split('/').map(Number);
    if (num > 0 && den > 0) return num / den;
  }
  const val = Number(clean);
  return !isNaN(val) && val > 0 ? val : 0.008;
}

function parseApertureNumber(aperture: string): number {
  if (!aperture) return 2.8;
  const clean = aperture.replace(/^f\//i, '').trim();
  const val = Number(clean);
  return !isNaN(val) && val > 0 ? val : 2.8;
}

function parseFocalLengthMm(focal: string): number {
  if (!focal) return 35;
  const clean = focal.replace(/mm$/i, '').trim();
  const val = Number(clean);
  return !isNaN(val) && val > 0 ? val : 35;
}

function parseIsoNumber(iso: string): number {
  if (!iso) return 400;
  const clean = iso.replace(/^iso\s*/i, '').trim();
  const val = Number(clean);
  return !isNaN(val) && val > 0 ? val : 400;
}

export async function analyzeAndForgeCard(
  buffer: Buffer,
  exif: ExtractedExif,
  width: number,
  height: number
): Promise<ForgedCardStats> {
  const stats = await sharp(buffer, { failOn: 'none' }).stats();
  const r = Math.round(stats.channels[0]?.mean ?? 110);
  const g = Math.round(stats.channels[1]?.mean ?? 110);
  const b = Math.round(stats.channels[2]?.mean ?? 110);

  const rStd = stats.channels[0]?.stdev ?? 45;
  const gStd = stats.channels[1]?.stdev ?? 45;
  const bStd = stats.channels[2]?.stdev ?? 45;

  const contrast = Math.round((rStd + gStd + bStd) / 3);
  const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const saturation = maxC - minC;

  // 1. Determine Elemental Affinity from real RGB spectrum
  let element: ElementType = 'Astral';
  if (saturation < 22) {
    element = 'Monochrome';
  } else if (r >= g && g >= b && r > b + 28 && g > 85) {
    element = 'Solar';
  } else if (r > g + 22 && r > b + 18) {
    element = 'Crimson';
  } else if (g >= r && g >= b + 10) {
    element = 'Verdant';
  } else if (b >= r + 12 && luminance < 135) {
    element = 'Abyssal';
  } else {
    element = 'Astral';
  }

  // 2. Parse Optical EXIF telemetry
  const shutterSec = parseShutterSpeedSeconds(exif.shutterSpeed);
  const fNum = parseApertureNumber(exif.aperture);
  const focalMm = parseFocalLengthMm(exif.focalLength);
  const isoVal = parseIsoNumber(exif.iso);

  // 3. Determine Combat Role & Optical Trait from Focal Length, Shutter, and Aperture
  let role: CardRole = 'Bruiser';
  if (focalMm <= 26) {
    role = 'Vanguard';
  } else if (focalMm <= 52) {
    role = 'Bruiser';
  } else if (focalMm <= 88) {
    role = 'Striker';
  } else {
    role = 'Arcanist';
  }

  let opticalTrait = 'Prime-Lens Precision';
  if (shutterSec <= 0.0025) {
    opticalTrait = 'Fast-Shutter Blitz';
  } else if (shutterSec >= 0.06) {
    opticalTrait = 'Long-Exposure Bastion';
  } else if (fNum <= 1.8) {
    opticalTrait = 'Bokeh Assassin';
  } else if (fNum >= 5.6) {
    opticalTrait = 'Deep-Field Bulwark';
  } else if (isoVal >= 1600) {
    opticalTrait = 'High-ISO Overclock';
  }

  // 4. Calculate Base Combat Stats
  const megapixels = Math.min(24, Math.max(2, (width * height) / 1_000_000));
  const roleHpMod =
    role === 'Vanguard' ? 1.26 : role === 'Bruiser' ? 1.1 : role === 'Striker' ? 0.94 : 0.9;
  const roleAtkMod =
    role === 'Striker' ? 1.24 : role === 'Arcanist' ? 1.2 : role === 'Bruiser' ? 1.08 : 0.92;

  const baseHp = Math.round((780 + megapixels * 22 + contrast * 3.2) * roleHpMod);
  const baseAtk = Math.round(
    (118 + saturation * 0.65 + contrast * 0.85 + Math.log10(Math.max(100, isoVal)) * 18) *
      roleAtkMod
  );
  const baseDef = Math.round(
    45 + Math.min(45, fNum * 4.5) + (role === 'Vanguard' ? 28 : role === 'Bruiser' ? 14 : 5)
  );
  const baseSpd = Math.round(
    Math.max(
      65,
      Math.min(
        165,
        102 + Math.round(-Math.log10(Math.max(0.000125, shutterSec)) * 14) +
          (element === 'Astral' || element === 'Monochrome' ? 8 : 0)
      )
    )
  );
  const baseCrit = Math.round(
    Math.max(10, Math.min(48, Math.round(36 - fNum * 2.4) + (role === 'Striker' ? 8 : 0)))
  );

  // 5. Determine Rarity Score
  const hasFullExif = Boolean(exif.camera && (exif.focalLength || exif.aperture));
  const powerScore =
    baseHp / 10 + baseAtk * 1.4 + baseDef * 1.1 + baseSpd * 0.9 + baseCrit * 2.2 + (hasFullExif ? 45 : 0);

  let rarity: RarityTier = 'Rare';
  if (powerScore >= 465) rarity = 'Mythic';
  else if (powerScore >= 425) rarity = 'Legendary';
  else if (powerScore >= 385) rarity = 'Epic';
  else if (powerScore >= 340) rarity = 'Rare';
  else rarity = 'Common';

  const rarityMult =
    rarity === 'Mythic'
      ? 1.22
      : rarity === 'Legendary'
      ? 1.15
      : rarity === 'Epic'
      ? 1.08
      : rarity === 'Rare'
      ? 1.03
      : 1.0;

  const hp = Math.round(baseHp * rarityMult);
  const atk = Math.round(baseAtk * rarityMult);
  const def = Math.round(baseDef * rarityMult);
  const spd = baseSpd;
  const crit = baseCrit;
  const powerRating = Math.round(hp * 0.25 + atk * 2.4 + def * 1.8 + spd * 1.6 + crit * 3.5);

  const epithets = ELEMENT_EPITHETS[element];
  const epithet = epithets[(r + g + b + width) % epithets.length];

  return {
    element,
    role,
    rarity,
    foil: rarity === 'Mythic' ? 'Prismatic' : rarity === 'Legendary' ? 'Holo' : 'Standard',
    opticalTrait,
    epithet,
    hp,
    atk,
    def,
    spd,
    crit,
    powerRating,
    ability: ELEMENT_ABILITIES[element],
    colorTelemetry: {
      r,
      g,
      b,
      luminance,
      contrast,
      saturation,
    },
  };
}
