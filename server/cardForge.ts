import sharp from 'sharp';
import type { ExtractedExif } from './optimizer.ts';

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

export interface ForgedCardStats {
  element: ElementType;
  category: PhotoCategory;
  categoryConfidence: number;
  categoryBonusLabel: string;
  categoryReason: string;
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

export interface CategoryModifiers {
  hpMult: number;
  atkMult: number;
  defMult: number;
  spdMult: number;
  critAdd: number;
  preferredRole: CardRole;
  bonusLabel: string;
  traitName: string;
}

export const PHOTO_CATEGORY_MODIFIERS: Record<PhotoCategory, CategoryModifiers> = {
  Portrait: {
    hpMult: 0.98,
    atkMult: 1.14,
    defMult: 0.96,
    spdMult: 1.08,
    critAdd: 8,
    preferredRole: 'Striker',
    bonusLabel: '+8% CRIT · +14% ATK · +8% SPD',
    traitName: 'Soul-Gaze Isolation',
  },
  Architecture: {
    hpMult: 1.18,
    atkMult: 0.96,
    defMult: 1.26,
    spdMult: 0.94,
    critAdd: 0,
    preferredRole: 'Vanguard',
    bonusLabel: '+26% DEF · +18% HP (Fortress)',
    traitName: 'Monolithic Geometry',
  },
  Nature: {
    hpMult: 1.22,
    atkMult: 1.06,
    defMult: 1.12,
    spdMult: 1.0,
    critAdd: 2,
    preferredRole: 'Bruiser',
    bonusLabel: '+22% HP · +12% DEF · +6% ATK',
    traitName: 'Photosynthetic Vitality',
  },
  'Still Life': {
    hpMult: 1.08,
    atkMult: 1.16,
    defMult: 1.16,
    spdMult: 0.98,
    critAdd: 4,
    preferredRole: 'Arcanist',
    bonusLabel: '+16% ATK · +16% DEF · +4% CRIT',
    traitName: 'Tabletop Alchemy',
  },
  'Street & Action': {
    hpMult: 0.96,
    atkMult: 1.14,
    defMult: 0.95,
    spdMult: 1.2,
    critAdd: 5,
    preferredRole: 'Striker',
    bonusLabel: '+20% SPD · +14% ATK · +5% CRIT',
    traitName: 'Decisive Moment Reflex',
  },
  'Macro & Wildlife': {
    hpMult: 1.0,
    atkMult: 1.2,
    defMult: 0.98,
    spdMult: 1.08,
    critAdd: 6,
    preferredRole: 'Striker',
    bonusLabel: '+20% ATK · +6% CRIT · +8% SPD',
    traitName: 'Predatory Magnification',
  },
  'Night & Astro': {
    hpMult: 1.08,
    atkMult: 1.22,
    defMult: 0.96,
    spdMult: 1.04,
    critAdd: 6,
    preferredRole: 'Arcanist',
    bonusLabel: '+22% ATK · +6% CRIT · +8% HP',
    traitName: 'Celestial Long-Exposure',
  },
  'Fine Art & Abstract': {
    hpMult: 1.02,
    atkMult: 1.16,
    defMult: 1.04,
    spdMult: 1.12,
    critAdd: 5,
    preferredRole: 'Arcanist',
    bonusLabel: '+16% ATK · +12% SPD · +5% CRIT',
    traitName: 'Avant-Garde Distortion',
  },
};

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
  if (!shutter) return 0.008;
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

/**
 * Spatial 64x64 Computer-Vision + EXIF Photography Genre Classifier
 * Analyzes subject isolation (center vs. border sharpness), orthogonal architectural lines,
 * horizon sky-to-land gradients, skin-tone chromatics, tabletop background uniformity,
 * and low-light specular highlights to classify the photograph into 1 of 8 genres.
 */
async function classifyPhotographyCategory(
  buffer: Buffer,
  width: number,
  height: number,
  luminance: number,
  contrast: number,
  saturation: number,
  focalMm: number,
  fNum: number,
  shutterSec: number,
  isoVal: number,
  hintText: string
): Promise<{
  category: PhotoCategory;
  confidence: number;
  reason: string;
}> {
  const GRID = 64;
  const { data } = await sharp(buffer, { failOn: 'none' })
    .resize(GRID, GRID, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const lumGrid = new Float32Array(GRID * GRID);
  let centerSkinPixels = 0;
  let centerPixelCount = 0;
  let foliageOrEarthPixels = 0;
  let skyTopPixels = 0;
  let brightPinpointPixels = 0;

  let borderLumSum = 0;
  let borderLumSqSum = 0;
  let borderCount = 0;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = (y * GRID + x) * 3;
      const pr = data[idx] ?? 0;
      const pg = data[idx + 1] ?? 0;
      const pb = data[idx + 2] ?? 0;
      const pl = 0.299 * pr + 0.587 * pg + 0.114 * pb;
      lumGrid[y * GRID + x] = pl;

      const isCenter = x >= 16 && x < 48 && y >= 14 && y < 50;
      const isBorder = x < 8 || x >= 56 || y < 8 || y >= 56;

      if (isCenter) {
        centerPixelCount++;
        // Human skin-tone / warm subject chromaticity check
        if (
          pr > 95 &&
          pg > 45 &&
          pb > 25 &&
          pr > pg + 10 &&
          pg >= pb &&
          pr - pb < 115 &&
          pl > 60 &&
          pl < 225
        ) {
          centerSkinPixels++;
        }
      }

      if (isBorder) {
        borderCount++;
        borderLumSum += pl;
        borderLumSqSum += pl * pl;
      }

      // Top third sky check (blue/cyan/bright cloud/sunset)
      if (y < 22 && (pb > pr + 12 || (pl > 155 && pb > 130))) {
        skyTopPixels++;
      }

      // Foliage green / natural earth check
      if (
        (pg > pr + 6 && pg > pb + 8 && pg > 45) ||
        (y >= 24 && pb > pr + 18 && pb > 70)
      ) {
        foliageOrEarthPixels++;
      }

      if (pl > 220) {
        brightPinpointPixels++;
      }
    }
  }

  // Compute spatial edge gradients (center vs. border sharpness, and orthogonal vs. diagonal lines)
  let centerEdgeSum = 0;
  let centerEdgeCount = 0;
  let borderEdgeSum = 0;
  let borderEdgeCount = 0;
  let orthoStrongEdges = 0;
  let totalStrongEdges = 0;

  for (let y = 1; y < GRID - 1; y++) {
    for (let x = 1; x < GRID - 1; x++) {
      const gx =
        Math.abs(lumGrid[y * GRID + (x + 1)] - lumGrid[y * GRID + (x - 1)]) * 0.5;
      const gy =
        Math.abs(lumGrid[(y + 1) * GRID + x] - lumGrid[(y - 1) * GRID + x]) * 0.5;
      const mag = Math.hypot(gx, gy);

      const isCenter = x >= 16 && x < 48 && y >= 16 && y < 48;
      if (isCenter) {
        centerEdgeSum += mag;
        centerEdgeCount++;
      } else if (x < 10 || x >= 54 || y < 10 || y >= 54) {
        borderEdgeSum += mag;
        borderEdgeCount++;
      }

      if (mag > 16) {
        totalStrongEdges++;
        // Orthogonal check: either strongly vertical (gx >> gy) or strongly horizontal (gy >> gx)
        if (gx > gy * 2.15 || gy > gx * 2.15) {
          orthoStrongEdges++;
        }
      }
    }
  }

  const centerEdgeMean = centerEdgeSum / Math.max(1, centerEdgeCount);
  const borderEdgeMean = borderEdgeSum / Math.max(1, borderEdgeCount);
  const centerFocusRatio = centerEdgeMean / Math.max(2.5, borderEdgeMean);
  const orthoRatio = orthoStrongEdges / Math.max(1, totalStrongEdges);
  const skinRatio = centerSkinPixels / Math.max(1, centerPixelCount);
  const foliageRatio = foliageOrEarthPixels / (GRID * GRID);
  const skyRatio = skyTopPixels / (22 * GRID);

  const borderMean = borderLumSum / Math.max(1, borderCount);
  const borderVariance = Math.max(
    0,
    borderLumSqSum / Math.max(1, borderCount) - borderMean * borderMean
  );
  const borderStdev = Math.sqrt(borderVariance);

  const aspect = width / Math.max(1, height);
  const lowerHint = (hintText || '').toLowerCase();

  // Score each of the 8 Photography Categories
  const scores: Record<PhotoCategory, { score: number; reason: string }> = {
    Portrait: {
      score:
        skinRatio * 95 +
        (centerFocusRatio > 1.25 ? 24 : 0) +
        (aspect <= 0.92 ? 18 : 0) +
        (focalMm >= 45 && focalMm <= 135 ? 16 : 0) +
        (fNum <= 2.8 ? 14 : 0) +
        (/\b(portrait|person|face|headshot|selfie|model|woman|man|girl|boy|bride)\b/.test(
          lowerHint
        )
          ? 65
          : 0),
      reason: `Center subject isolation (${centerFocusRatio.toFixed(
        1
      )}x bokeh focus) & portrait tonal harmonics`,
    },
    Architecture: {
      score:
        orthoRatio * 105 +
        (totalStrongEdges > 420 ? 22 : 0) +
        (focalMm <= 32 ? 14 : 0) +
        (fNum >= 5.0 ? 12 : 0) +
        (/\b(arch|building|city|tower|bridge|house|cathedral|church|interior|facade|skyline|urban|monument|spire|obelisk)\b/.test(
          lowerHint
        )
          ? 65
          : 0),
      reason: `High orthogonal structural geometry (${Math.round(
        orthoRatio * 100
      )}% vertical/horizontal line alignment)`,
    },
    Nature: {
      score:
        foliageRatio * 95 +
        skyRatio * 48 +
        (aspect >= 1.18 ? 16 : 0) +
        (focalMm <= 35 ? 12 : 0) +
        (/\b(nature|landscape|mountain|forest|tree|ocean|sea|beach|lake|river|sunset|sunrise|valley|canyon|park|sky|cloud|meadow)\b/.test(
          lowerHint
        )
          ? 65
          : 0),
      reason: `Natural horizon & organic foliage/water spectrum (${Math.round(
        (foliageRatio + skyRatio * 0.5) * 100
      )}% environmental index)`,
    },
    'Still Life': {
      score:
        (borderStdev < 36 ? 34 : borderStdev < 48 ? 18 : 0) +
        (centerFocusRatio > 1.28 ? 26 : 0) +
        (focalMm >= 35 && focalMm <= 95 ? 14 : 0) +
        (aspect >= 0.8 && aspect <= 1.35 ? 12 : 0) +
        (/\b(still|table|food|coffee|cup|vase|bottle|watch|product|book|fruit|plate|dish|studio|object|candle|relic)\b/.test(
          lowerHint
        )
          ? 65
          : 0),
      reason: `Controlled studio/tabletop perimeter lighting (border σ=${Math.round(
        borderStdev
      )}) with centered object focus`,
    },
    'Street & Action': {
      score:
        (shutterSec <= 0.0025 ? 36 : shutterSec <= 0.004 ? 20 : 0) +
        (totalStrongEdges > 350 && orthoRatio < 0.45 ? 24 : 0) +
        (contrast >= 58 ? 14 : 0) +
        (/\b(street|action|sport|run|car|bike|skate|candid|crowd|motion|dance|race|jump)\b/.test(
          lowerHint
        )
          ? 65
          : 0),
      reason: `High-velocity shutter capture (${
        shutterSec < 1 ? `1/${Math.round(1 / shutterSec)}s` : `${shutterSec}s`
      }) & dynamic kinetic contrast`,
    },
    'Macro & Wildlife': {
      score:
        (centerFocusRatio > 1.55 ? 42 : centerFocusRatio > 1.35 ? 24 : 0) +
        (saturation >= 55 ? 18 : 0) +
        (focalMm >= 85 ? 20 : 0) +
        (/\b(macro|wildlife|bird|cat|dog|pet|animal|insect|bee|butterfly|flower|petal|leaf|spider|reptile|fox|deer)\b/.test(
          lowerHint
        )
          ? 65
          : 0),
      reason: `Deep foreground-to-background separation (${centerFocusRatio.toFixed(
        2
      )}x subject magnification) & fine micro-texture`,
    },
    'Night & Astro': {
      score:
        (luminance < 58 ? 48 : luminance < 78 ? 28 : 0) +
        (brightPinpointPixels > 15 && luminance < 85 ? 24 : 0) +
        (isoVal >= 1600 || shutterSec >= 0.08 ? 22 : 0) +
        (/\b(night|astro|star|galaxy|moon|nebula|neon|midnight|dark|nocturne|aurora|milky)\b/.test(
          lowerHint
        )
          ? 65
          : 0),
      reason: `Nocturnal low-key luminance (${luminance}/255) with specular highlight contrast`,
    },
    'Fine Art & Abstract': {
      score:
        (saturation < 22 ? 52 : saturation > 110 ? 28 : 0) +
        (contrast >= 68 ? 22 : 0) +
        (/\b(abstract|art|minimal|bw|monochrome|noir|pattern|shadow|texture|conceptual|surreal)\b/.test(
          lowerHint
        )
          ? 65
          : 0),
      reason:
        saturation < 22
          ? `Pure monochromatic tonal study (saturation ${saturation}, contrast ${contrast})`
          : `High-contrast chromatic abstraction (contrast ${contrast}, saturation ${saturation})`,
    },
  };

  let bestCat: PhotoCategory = 'Still Life';
  let bestScore = -1;
  let secondScore = -1;

  for (const [cat, info] of Object.entries(scores) as [
    PhotoCategory,
    { score: number; reason: string },
  ][]) {
    if (info.score > bestScore) {
      secondScore = bestScore;
      bestScore = info.score;
      bestCat = cat;
    } else if (info.score > secondScore) {
      secondScore = info.score;
    }
  }

  const margin = Math.max(0, bestScore - Math.max(0, secondScore));
  const confidence = Math.min(99, Math.max(76, Math.round(76 + margin * 0.45)));

  return {
    category: bestCat,
    confidence,
    reason: scores[bestCat].reason,
  };
}

export async function analyzeAndForgeCard(
  buffer: Buffer,
  exif: ExtractedExif,
  width: number,
  height: number,
  hintText = ''
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

  // 3. Classify Photography Genre / Category via Spatial Computer Vision + EXIF
  const classification = await classifyPhotographyCategory(
    buffer,
    width,
    height,
    luminance,
    contrast,
    saturation,
    focalMm,
    fNum,
    shutterSec,
    isoVal,
    hintText
  );
  const { category, confidence: categoryConfidence, reason: categoryReason } = classification;
  const catMod = PHOTO_CATEGORY_MODIFIERS[category];

  // 4. Determine Combat Role from Category & Focal Length
  let role: CardRole = catMod.preferredRole;
  if (focalMm <= 24) {
    role = 'Vanguard';
  } else if (focalMm >= 95 && category !== 'Architecture') {
    role = 'Arcanist';
  }

  const opticalTrait = catMod.traitName;

  // 5. Calculate Combat Stats Influenced by Photography Category + Optical EXIF + RGB Spectrum
  const megapixels = Math.min(24, Math.max(2, (width * height) / 1_000_000));
  const roleHpMod =
    role === 'Vanguard' ? 1.22 : role === 'Bruiser' ? 1.1 : role === 'Striker' ? 0.95 : 0.92;
  const roleAtkMod =
    role === 'Striker' ? 1.2 : role === 'Arcanist' ? 1.18 : role === 'Bruiser' ? 1.06 : 0.94;

  const rawHp = (780 + megapixels * 20 + contrast * 3.0) * roleHpMod * catMod.hpMult;
  const rawAtk =
    (118 + saturation * 0.6 + contrast * 0.8 + Math.log10(Math.max(100, isoVal)) * 16) *
    roleAtkMod *
    catMod.atkMult;
  const rawDef =
    (46 + Math.min(42, fNum * 4.2) + (role === 'Vanguard' ? 24 : role === 'Bruiser' ? 12 : 4)) *
    catMod.defMult;
  const rawSpd =
    (100 +
      Math.round(-Math.log10(Math.max(0.000125, shutterSec)) * 13) +
      (element === 'Astral' || element === 'Monochrome' ? 6 : 0)) *
    catMod.spdMult;

  const baseHp = Math.round(rawHp);
  const baseAtk = Math.round(rawAtk);
  const baseDef = Math.round(rawDef);
  const baseSpd = Math.max(60, Math.min(185, Math.round(rawSpd)));
  const baseCrit = Math.max(
    8,
    Math.min(
      58,
      Math.round(32 - fNum * 2.0) + catMod.critAdd + (role === 'Striker' ? 5 : 0)
    )
  );

  // 6. Determine Rarity Score
  const hasFullExif = Boolean(exif.camera && (exif.focalLength || exif.aperture));
  const powerScore =
    baseHp / 10 +
    baseAtk * 1.4 +
    baseDef * 1.1 +
    baseSpd * 0.9 +
    baseCrit * 2.2 +
    (hasFullExif ? 40 : 0);

  let rarity: RarityTier = 'Rare';
  if (powerScore >= 475) rarity = 'Mythic';
  else if (powerScore >= 430) rarity = 'Legendary';
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
  const powerRating = Math.round(
    hp * 0.25 + atk * 2.4 + def * 1.8 + spd * 1.6 + crit * 3.5
  );

  const epithets = ELEMENT_EPITHETS[element];
  const epithet = epithets[(r + g + b + width) % epithets.length];

  return {
    element,
    category,
    categoryConfidence,
    categoryBonusLabel: catMod.bonusLabel,
    categoryReason,
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
