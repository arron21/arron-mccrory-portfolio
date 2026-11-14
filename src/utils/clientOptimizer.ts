import exifr from 'exifr';
import type { ExifData, ElementType, PhotoCategory, CardRole } from '../types.ts';

export type AiNamingTheme = 'auto' | 'mythic' | 'cyber' | 'primal' | 'arcane';

export interface StagedPhotoAiPreview {
  fileName: string;
  fileSize: number;
  previewUrl: string;
  width: number;
  height: number;
  exif: ExifData;
  r: number;
  g: number;
  b: number;
  luminance: number;
  contrast: number;
  saturation: number;
  dominantHex: string;
  paletteHexes: string[];
  predictedElement: ElementType;
  predictedCategory: PhotoCategory;
  predictedRole: CardRole;
  predictedBonusLabel: string;
  aiVisualTags: string[];
  aiName: string;
  aiNamePool: string[];
  aiCaption: string;
  aiCaptionPool: string[];
  rerollIndex: number;
}

function formatShutterSpeed(exposureTime?: number): string {
  if (!exposureTime || typeof exposureTime !== 'number' || exposureTime <= 0) return '';
  if (exposureTime >= 1) {
    return `${Number(exposureTime.toFixed(1))}s`;
  }
  const denominator = Math.round(1 / exposureTime);
  return `1/${denominator}s`;
}

function formatAperture(fNumber?: number): string {
  if (!fNumber || typeof fNumber !== 'number' || fNumber <= 0) return '';
  return `f/${Number(fNumber.toFixed(1))}`;
}

function formatFocalLength(focalLength?: number): string {
  if (!focalLength || typeof focalLength !== 'number' || focalLength <= 0) return '';
  return `${Math.round(focalLength)}mm`;
}

export async function extractClientExif(file: File): Promise<ExifData> {
  const empty: ExifData = {
    camera: '',
    lens: '',
    focalLength: '',
    aperture: '',
    shutterSpeed: '',
    iso: '',
    takenAt: '',
  };

  try {
    const parsed = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: false,
    });
    if (!parsed) return empty;

    const make = (parsed.Make || '').toString().trim();
    const model = (parsed.Model || '').toString().trim();
    let camera = model;
    if (make && model && !model.toLowerCase().startsWith(make.toLowerCase())) {
      camera = `${make} ${model}`;
    } else if (!camera && make) {
      camera = make;
    }

    const lens = (parsed.LensModel || parsed.Lens || '').toString().trim();
    const focalLength = formatFocalLength(
      parsed.FocalLengthIn35mmFormat || parsed.FocalLength
    );
    const aperture = formatAperture(parsed.FNumber || parsed.ApertureValue);
    const shutterSpeed = formatShutterSpeed(parsed.ExposureTime);
    const isoVal = parsed.ISO || parsed.ISOSpeedRatings;
    const iso = isoVal ? `ISO ${isoVal}` : '';

    let takenAt = '';
    const rawDate = parsed.DateTimeOriginal || parsed.CreateDate;
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      takenAt = rawDate.toISOString().split('T')[0];
    } else if (typeof rawDate === 'string' && rawDate.trim()) {
      takenAt = rawDate.trim().slice(0, 10).replace(/:/g, '-');
    }

    return {
      camera,
      lens,
      focalLength,
      aperture,
      shutterSpeed,
      iso,
      takenAt,
    };
  } catch {
    return empty;
  }
}

const VERCEL_SAFE_MAX_BYTES = 2.8 * 1024 * 1024; // 2.8 MB max per request (well under Vercel's 4.5 MB limit)
const MAX_MASTER_DIMENSION = 2400; // Matches Lightbox 2400w max derivative

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

function extractMeaningfulFileHint(fileName: string): string | null {
  const base = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!base) return null;

  const stopWords = new Set([
    'img', 'dsc', 'dscf', 'dscn', 'pxl', 'dcim', 'mvi', 'gopr', 'dji', 'sam',
    'screenshot', 'screen', 'shot', 'photo', 'picture', 'image', 'pic', 'camera',
    'upload', 'file', 'untitled', 'download', 'whatsapp', 'signal', 'telegram',
    'copy', 'edit', 'final', 'v1', 'v2', 'new', 'old', 'test', 'temp', 'tmp',
    'jpeg', 'jpg', 'png', 'webp', 'heic', 'avif', 'raw', 'cr2', 'nef', 'arw',
    'card', 'the', 'and', 'for', 'with', 'from', 'into',
  ]);

  const tokens = base
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z]/g, ''))
    .filter((w) => w.length >= 3 && w.length <= 14)
    .filter((w) => !stopWords.has(w.toLowerCase()))
    .filter((w) => !/^[a-f0-9]{6,}$/i.test(w));

  if (tokens.length === 0) return null;
  return tokens
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const CATEGORY_BONUS_SUMMARY: Record<PhotoCategory, { role: CardRole; bonus: string }> = {
  Portrait: { role: 'Striker', bonus: '+8% CRIT · +14% ATK · +8% SPD' },
  Architecture: { role: 'Vanguard', bonus: '+26% DEF · +18% HP (Fortress)' },
  Nature: { role: 'Bruiser', bonus: '+22% HP · +12% DEF · +6% ATK' },
  'Still Life': { role: 'Arcanist', bonus: '+16% ATK · +16% DEF · +4% CRIT' },
  'Street & Action': { role: 'Striker', bonus: '+20% SPD · +14% ATK · +5% CRIT' },
  'Macro & Wildlife': { role: 'Striker', bonus: '+20% ATK · +6% CRIT · +8% SPD' },
  'Night & Astro': { role: 'Arcanist', bonus: '+22% ATK · +6% CRIT · +8% HP' },
  'Fine Art & Abstract': { role: 'Arcanist', bonus: '+16% ATK · +12% SPD · +5% CRIT' },
};

export function generateClientAiNamesAndLore(params: {
  fileName: string;
  element: ElementType;
  category: PhotoCategory;
  role: CardRole;
  r: number;
  g: number;
  b: number;
  luminance: number;
  contrast: number;
  saturation: number;
  exif: ExifData;
  theme?: AiNamingTheme;
}): { aiNamePool: string[]; aiCaptionPool: string[] } {
  const {
    fileName,
    element,
    category,
    role,
    r,
    g,
    b,
    luminance,
    contrast,
    saturation,
    exif,
    theme = 'auto',
  } = params;

  const seed = Math.abs(
    r * 37 + g * 23 + b * 13 + luminance * 11 + contrast * 7 + saturation * 5 + fileName.length * 19
  );
  const semanticSubject = extractMeaningfulFileHint(fileName);

  const elementAdjectives: Record<ElementType, string[]> = {
    Solar: ['Sunforged', 'Aurelian', 'Helios', 'Gilded', 'Solstice', 'Radiant', 'Amber'],
    Abyssal: ['Trenchborn', 'Pelagic', 'Tidal', 'Sapphire', 'Riptide', 'Fathom', 'Glacial'],
    Crimson: ['Bloodmoon', 'Scarlet', 'Emberheart', 'Cinnabar', 'Vermilion', 'Pyre', 'Ignis'],
    Verdant: ['Sylvan', 'Briar', 'Wildwood', 'Emerald', 'Mossbound', 'Canopy', 'Thorn'],
    Astral: ['Nebula', 'Starlight', 'Celestial', 'Aether', 'Zenith', 'Cosmic', 'Voidborn'],
    Monochrome: ['Chiaroscuro', 'Obsidian', 'Noir', 'Silverplate', 'Phantom', 'Graphite', 'Ashen'],
  };

  const categoryNouns: Record<PhotoCategory, string[]> = {
    Portrait: ['Sovereign', 'Valkyrie', 'Oracle', 'Duelist', 'Visage', 'Envoy', 'Mirage'],
    Architecture: ['Citadel', 'Monolith', 'Bastion', 'Obelisk', 'Spire', 'Sanctum', 'Colossus'],
    Nature: ['Titan', 'Grovekeeper', 'Behemoth', 'Warden', 'Tempest', 'Wildheart', 'Horizon'],
    'Still Life': ['Reliquary', 'Chalice', 'Talisman', 'Artifact', 'Chronicle', 'Vessel', 'Curio'],
    'Street & Action': ['Outrider', 'Ronin', 'Interceptor', 'Strider', 'Vortex', 'Drifter', 'Phantom'],
    'Macro & Wildlife': ['Stalker', 'Apex', 'Mantis', 'Lynx', 'Predator', 'Fangs', 'Huntress'],
    'Night & Astro': ['Eclipse', 'Supernova', 'Stargazer', 'Nocturne', 'Pulsar', 'Constellation', 'Comet'],
    'Fine Art & Abstract': ['Paradox', 'Prism', 'Enigma', 'Tessellation', 'Dreamweaver', 'Chimera', 'Anomaly'],
  };

  const lightingPrefixes =
    luminance < 70
      ? ['Midnight', 'Umbral', 'Nocturnal', 'Shadow']
      : luminance > 180
      ? ['High-Noon', 'Daybreak', 'Luminous', 'Halo']
      : contrast > 60
      ? ['Razor', 'Stormlit', 'Stark', 'Flash']
      : saturation > 68
      ? ['Prismatic', 'Vivid', 'Neon', 'Chromatic']
      : ['Twilight', 'Velvet', 'Misty', 'Haze'];

  const adj = elementAdjectives[element];
  const nouns = categoryNouns[category];
  const light = lightingPrefixes;

  const a1 = adj[seed % adj.length];
  const a2 = adj[(seed + 2) % adj.length];
  const a3 = adj[(seed + 4) % adj.length];
  const n1 = nouns[seed % nouns.length];
  const n2 = nouns[(seed + 3) % nouns.length];
  const n3 = nouns[(seed + 5) % nouns.length];
  const l1 = light[seed % light.length];
  const l2 = light[(seed + 2) % light.length];

  let pool: string[] = [];

  if (theme === 'mythic') {
    pool = [
      semanticSubject ? `${a1} ${semanticSubject}, the ${n1}` : `${a1} ${n1} of ${l1}`,
      `${l1} ${a2} ${n2}`,
      `High ${n3} of the ${a3} Crown`,
      `${a1} Oathkeeper · ${n1}`,
      `The ${l2} ${semanticSubject || n2}`,
      `${a2} Ascendant ${n3}`,
    ];
  } else if (theme === 'cyber') {
    const codeNum = ((seed % 89) + 10).toString();
    pool = [
      `NEO-${codeNum} // ${a1} ${semanticSubject || n1}`,
      `${l1} Protocol: ${n2}.EXE`,
      `Chroma-Unit ${codeNum} [${element.toUpperCase()}]`,
      `Cyber-${n1} // ${a2} Lens`,
      `Optic Zero: ${l2} ${semanticSubject || n3}`,
      `SYNTH-${a3.toUpperCase()} ${role}`,
    ];
  } else if (theme === 'primal') {
    pool = [
      `Primeval ${a1} ${semanticSubject || n1}`,
      `${l1} Fang of the ${a2} Wilds`,
      `Untamed ${semanticSubject || n2} Behemoth`,
      `${a3} Storm-${n3}`,
      `Apex ${l2} ${n1}`,
      `Wildborn ${a1} ${role}`,
    ];
  } else if (theme === 'arcane') {
    pool = [
      `Sigil of the ${a1} ${semanticSubject || n1}`,
      `${l1} Grimoire: ${a2} ${n2}`,
      `Astral Relic of ${semanticSubject || n3}`,
      `The ${a3} Alchemy ${n1}`,
      `Runebound ${l2} ${n2}`,
      `Aether-Forged ${a1} ${role}`,
    ];
  } else {
    // 'auto' blends the best visual telemetry names
    pool = [
      semanticSubject ? `${a1} ${semanticSubject}` : `${a1} ${n1}`,
      semanticSubject ? `${l1} ${semanticSubject} ${n2}` : `${l1} ${a2} ${n2}`,
      `${a3} ${n3} of ${l1}`,
      `NEO-${(seed % 89) + 10} // ${a1} ${n1}`,
      `Sigil of the ${l2} ${semanticSubject || n2}`,
      `Apex ${a2} ${role}`,
    ];
  }

  const opticsSnippet = [exif.focalLength, exif.aperture, exif.shutterSpeed]
    .filter(Boolean)
    .join(' · ') || 'direct optical sensor capture';

  const toneDesc =
    luminance < 72
      ? 'deep nocturnal shadow telemetry'
      : luminance > 175
      ? 'radiant high-key luminance'
      : contrast > 58
      ? 'high-contrast chiaroscuro edges'
      : 'rich chromatic color harmony';

  const bonusInfo = CATEGORY_BONUS_SUMMARY[category].bonus;

  const captions = [
    `AI Vision Telemetry: ${element} ${category} (${role}) synthesized from ${toneDesc} [${opticsSnippet}]. Grants ${bonusInfo}.`,
    `Forged through the Soul-Lens from ${toneDesc}. Its ${element} resonance empowers this ${category} ${role} with ${bonusInfo}.`,
    `Optical Alchemy Record (${opticsSnippet}): A ${element}-aligned ${category} specimen channeling ${toneDesc} for ${bonusInfo}.`,
    `Field Note: Captured in ${l1.toLowerCase()} light, this ${element} ${role} converts ${category.toLowerCase()} composition into ${bonusInfo}.`,
  ];

  return {
    aiNamePool: pool,
    aiCaptionPool: captions,
  };
}

/**
 * Performs an instant client-side 48x48 spatial & RGB vision scan on a staged photo
 * so the user immediately sees AI-generated card names, extracted color swatches,
 * predicted photography category, elemental affinity, and visual tags before uploading.
 */
export async function analyzeStagedPhotoPreview(
  file: File,
  theme: AiNamingTheme = 'auto'
): Promise<StagedPhotoAiPreview> {
  const previewUrl = URL.createObjectURL(file);
  const exif = await extractClientExif(file);

  try {
    const img = await loadImageElement(file);
    const width = img.naturalWidth || img.width || 1200;
    const height = img.naturalHeight || img.height || 900;

    const G = 48;
    const canvas = document.createElement('canvas');
    canvas.width = G;
    canvas.height = G;
    const ctx = canvas.getContext('2d');

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    const lums: number[] = [];
    const quadRGB = [
      { r: 0, g: 0, b: 0, c: 0 },
      { r: 0, g: 0, b: 0, c: 0 },
      { r: 0, g: 0, b: 0, c: 0 },
      { r: 0, g: 0, b: 0, c: 0 },
    ];

    let centerSharp = 0;
    let borderSharp = 0;
    let centerCount = 0;
    let borderCount = 0;
    let orthoEdges = 0;
    let diagEdges = 0;
    let skinPixels = 0;
    let foliagePixels = 0;

    if (ctx) {
      ctx.drawImage(img, 0, 0, G, G);
      const data = ctx.getImageData(0, 0, G, G).data;
      const gray = new Float32Array(G * G);

      for (let y = 0; y < G; y++) {
        for (let x = 0; x < G; x++) {
          const idx = (y * G + x) * 4;
          const pr = data[idx];
          const pg = data[idx + 1];
          const pb = data[idx + 2];
          rSum += pr;
          gSum += pg;
          bSum += pb;

          const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
          gray[y * G + x] = lum;
          lums.push(lum);

          const qIdx = (y < G / 2 ? 0 : 2) + (x < G / 2 ? 0 : 1);
          quadRGB[qIdx].r += pr;
          quadRGB[qIdx].g += pg;
          quadRGB[qIdx].b += pb;
          quadRGB[qIdx].c += 1;

          if (pr > 95 && pg > 40 && pb > 20 && pr > pg + 12 && pg > pb && pr - pb > 25) {
            skinPixels++;
          }
          if (pg > pr + 8 && pg > pb + 12 && pg > 45) {
            foliagePixels++;
          }
        }
      }

      for (let y = 1; y < G - 1; y++) {
        for (let x = 1; x < G - 1; x++) {
          const gx = Math.abs(gray[y * G + (x + 1)] - gray[y * G + (x - 1)]);
          const gy = Math.abs(gray[(y + 1) * G + x] - gray[(y - 1) * G + x]);
          const mag = gx + gy;
          if (mag > 22) {
            if (gx > gy * 2.1 || gy > gx * 2.1) orthoEdges++;
            else diagEdges++;
          }
          const inCenter = x >= G * 0.25 && x <= G * 0.75 && y >= G * 0.2 && y <= G * 0.8;
          if (inCenter) {
            centerSharp += mag;
            centerCount++;
          } else {
            borderSharp += mag;
            borderCount++;
          }
        }
      }
    }

    const totalPx = Math.max(1, lums.length);
    const r = Math.round(rSum / totalPx) || 110;
    const g = Math.round(gSum / totalPx) || 110;
    const b = Math.round(bSum / totalPx) || 110;
    const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    let varSum = 0;
    for (const l of lums) {
      varSum += (l - luminance) * (l - luminance);
    }
    const contrast = Math.round(Math.sqrt(varSum / totalPx));
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);

    const dominantHex = rgbToHex(r, g, b);
    const paletteHexes = quadRGB.map((q) =>
      q.c > 0 ? rgbToHex(q.r / q.c, q.g / q.c, q.b / q.c) : dominantHex
    );

    // Predict Element
    let predictedElement: ElementType = 'Astral';
    if (saturation < 22) predictedElement = 'Monochrome';
    else if (r >= g && g >= b && r > b + 28 && g > 85) predictedElement = 'Solar';
    else if (r > g + 22 && r > b + 18) predictedElement = 'Crimson';
    else if (g >= r && g >= b + 10) predictedElement = 'Verdant';
    else if (b >= r + 12 && luminance < 135) predictedElement = 'Abyssal';
    else predictedElement = 'Astral';

    // Predict Category
    const centerRatio = (centerSharp / Math.max(1, centerCount)) / Math.max(1, borderSharp / Math.max(1, borderCount));
    const orthoRatio = orthoEdges / Math.max(1, orthoEdges + diagEdges);
    const skinRatio = skinPixels / totalPx;
    const foliageRatio = foliagePixels / totalPx;
    const aspect = width / Math.max(1, height);

    let predictedCategory: PhotoCategory = 'Fine Art & Abstract';
    if (luminance < 58) {
      predictedCategory = 'Night & Astro';
    } else if (foliageRatio > 0.14 || (predictedElement === 'Verdant' && aspect >= 1.15)) {
      predictedCategory = 'Nature';
    } else if (orthoRatio > 0.56 && centerRatio < 1.35) {
      predictedCategory = 'Architecture';
    } else if (centerRatio > 1.55 && foliageRatio > 0.06) {
      predictedCategory = 'Macro & Wildlife';
    } else if ((aspect < 0.92 && skinRatio > 0.05) || (centerRatio > 1.32 && skinRatio > 0.08)) {
      predictedCategory = 'Portrait';
    } else if (centerRatio > 1.38 && aspect >= 0.85 && aspect <= 1.35) {
      predictedCategory = 'Still Life';
    } else if (contrast > 56) {
      predictedCategory = 'Street & Action';
    }

    const predictedRole = CATEGORY_BONUS_SUMMARY[predictedCategory].role;
    const predictedBonusLabel = CATEGORY_BONUS_SUMMARY[predictedCategory].bonus;

    const aiVisualTags: string[] = [];
    if (luminance < 68) aiVisualTags.push('🌙 Nocturnal Low-Key');
    else if (luminance > 175) aiVisualTags.push('☀️ Radiant High-Key');
    else if (r > b + 30) aiVisualTags.push('🌅 Golden Warmth');
    else if (b > r + 20) aiVisualTags.push('❄️ Cool Cyan Tone');

    if (centerRatio > 1.35) aiVisualTags.push('🎯 Subject Bokeh Lock');
    else if (orthoRatio > 0.54) aiVisualTags.push('🏛️ Geometric Lines');

    if (contrast > 60) aiVisualTags.push('⚡ High-Contrast Edge');
    else if (saturation > 70) aiVisualTags.push('🌈 Hyper-Saturated');

    if (exif.focalLength || exif.aperture) {
      aiVisualTags.push(`📷 ${[exif.focalLength, exif.aperture].filter(Boolean).join(' ')}`);
    }

    const { aiNamePool, aiCaptionPool } = generateClientAiNamesAndLore({
      fileName: file.name,
      element: predictedElement,
      category: predictedCategory,
      role: predictedRole,
      r,
      g,
      b,
      luminance,
      contrast,
      saturation,
      exif,
      theme,
    });

    return {
      fileName: file.name,
      fileSize: file.size,
      previewUrl,
      width,
      height,
      exif,
      r,
      g,
      b,
      luminance,
      contrast,
      saturation,
      dominantHex,
      paletteHexes,
      predictedElement,
      predictedCategory,
      predictedRole,
      predictedBonusLabel,
      aiVisualTags: aiVisualTags.slice(0, 4),
      aiName: aiNamePool[0],
      aiNamePool,
      aiCaption: aiCaptionPool[0],
      aiCaptionPool,
      rerollIndex: 0,
    };
  } catch {
    const fallbackPool = ['Aether Relic', 'Helios Sovereign', 'Obsidian Sentinel', 'Verdant Warden'];
    const fallbackCaptions = [
      'AI Vision Telemetry: Synthesized directly from optical sensor frequencies.',
    ];
    return {
      fileName: file.name,
      fileSize: file.size,
      previewUrl,
      width: 1200,
      height: 900,
      exif,
      r: 120,
      g: 110,
      b: 140,
      luminance: 120,
      contrast: 48,
      saturation: 35,
      dominantHex: '#786e8c',
      paletteHexes: ['#786e8c', '#9a8cb2', '#524866', '#c4b5fd'],
      predictedElement: 'Astral',
      predictedCategory: 'Fine Art & Abstract',
      predictedRole: 'Arcanist',
      predictedBonusLabel: '+16% ATK · +12% SPD · +5% CRIT',
      aiVisualTags: ['✨ Optical Resonance'],
      aiName: fallbackPool[0],
      aiNamePool: fallbackPool,
      aiCaption: fallbackCaptions[0],
      aiCaptionPool: fallbackCaptions,
      rerollIndex: 0,
    };
  }
}

/**
 * Prepares a photo file for upload so that it never exceeds Vercel's 4.5 MB
 * FUNCTION_PAYLOAD_TOO_LARGE limit, while preserving full 2400px master resolution
 * and extracting optical EXIF metadata from the untouched original file first.
 */
export async function preparePhotoForUpload(file: File): Promise<{
  uploadFile: File;
  originalSizeBytes: number;
  exif: ExifData;
}> {
  const originalSizeBytes = file.size;
  const exif = await extractClientExif(file);

  // If the file is already small (< 2.5 MB), we still check if we need to compress or can send directly
  try {
    const img = await loadImageElement(file);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    if (
      file.size <= VERCEL_SAFE_MAX_BYTES &&
      origW <= MAX_MASTER_DIMENSION &&
      origH <= MAX_MASTER_DIMENSION
    ) {
      return { uploadFile: file, originalSizeBytes, exif };
    }

    // Scale down to fit within 2400x2400 preserving exact aspect ratio
    const scale = Math.min(1, MAX_MASTER_DIMENSION / Math.max(origW, origH));
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { uploadFile: file, originalSizeBytes, exif };
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Encode as high-quality WebP (or JPEG fallback) under 2.8 MB
    let quality = 0.88;
    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    let mime = 'image/webp';
    let ext = '.webp';

    if (!blob || blob.type !== 'image/webp') {
      mime = 'image/jpeg';
      ext = '.jpg';
      blob = await canvasToBlob(canvas, mime, quality);
    }

    while (blob && blob.size > VERCEL_SAFE_MAX_BYTES && quality > 0.55) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, mime, quality);
    }

    if (!blob) {
      return { uploadFile: file, originalSizeBytes, exif };
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const uploadFile = new File([blob], `${baseName}${ext}`, {
      type: mime,
      lastModified: file.lastModified,
    });

    return { uploadFile, originalSizeBytes, exif };
  } catch {
    return { uploadFile: file, originalSizeBytes, exif };
  }
}
