import exifr from 'exifr';
import type { ExifData, ElementType, PhotoCategory, CardRole } from '../types.ts';

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
  isNsfw: boolean;
  nsfwReason: string;
  aiDescription: string;
  aiName: string;
  aiNamePool: string[];
  visionProvider: string;
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

/**
 * Step 2 (Client-side NLP fallback): Derives short 2-4 word card names strictly from
 * the plain-text visual description of the image itself.
 */
export function deriveShortNamesFromDescription(description: string): string[] {
  const text = description.trim();
  const lower = text.toLowerCase();

  const depictingMatch = text.match(/depicting\s+([a-zA-Z0-9\s-]{3,28})(?:,|\.|$)/i);
  const hintWords = depictingMatch
    ? depictingMatch[1]
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    : null;

  let toneWord = 'Natural';
  if (/\bgolden|amber|sunset|warm\b/.test(lower)) toneWord = 'Golden';
  else if (/\bocean|blue|azure|sapphire\b/.test(lower)) toneWord = 'Ocean';
  else if (/\bgreen|emerald|forest|lush\b/.test(lower)) toneWord = 'Emerald';
  else if (/\bcrimson|red|scarlet|ruby\b/.test(lower)) toneWord = 'Crimson';
  else if (/\bmonochrome|black-and-white|silver\b/.test(lower)) toneWord = 'Monochrome';
  else if (/\bviolet|twilight|purple\b/.test(lower)) toneWord = 'Twilight';
  else if (/\bnight|dark sky|stars\b/.test(lower)) toneWord = 'Midnight';
  else if (/\bdaylight|bright\b/.test(lower)) toneWord = 'Sunlit';
  else if (/\bshadow|moody|low-key\b/.test(lower)) toneWord = 'Shadowed';
  else if (/\bcontrast\b/.test(lower)) toneWord = 'Stark';

  const nounPatterns: Array<{ re: RegExp; alts: string[] }> = [
    { re: /\b(dog|puppy|retriever|hound)\b/, alts: ['Hound', 'Retriever', 'Companion'] },
    { re: /\b(cat|kitten|feline)\b/, alts: ['Feline', 'Cat', 'Prowler'] },
    { re: /\b(bird|eagle|owl|hawk|seagull)\b/, alts: ['Bird', 'Wing', 'Soarer'] },
    { re: /\b(car|vehicle|motorcycle|bike|train)\b/, alts: ['Cruiser', 'Machine', 'Racer'] },
    { re: /\b(flower|rose|bloom|blossom|petal)\b/, alts: ['Blossom', 'Bloom', 'Petal'] },
    { re: /\b(coffee|espresso|latte|drink|cup|glass)\b/, alts: ['Glass', 'Cup', 'Brew'] },
    { re: /\b(food|dish|plate|cake|meal|pizza|burger)\b/, alts: ['Plate', 'Dish', 'Tabletop'] },
    { re: /\b(mountain|peak|ridge|cliff|hill)\b/, alts: ['Ridge', 'Peak', 'Summit'] },
    { re: /\b(beach|shore|wave|ocean|sea|water|lake|river)\b/, alts: ['Shoreline', 'Waters', 'Waves'] },
    { re: /\b(tree|trees|forest|woods|greenery|foliage|canopy)\b/, alts: ['Canopy', 'Woods', 'Grove'] },
    { re: /\b(night lights|stars|starry|moon|skyline)\b/, alts: ['Nightlights', 'Skyline', 'Starglow'] },
    { re: /\b(architectural|building|buildings|bridge|tower|street|city)\b/, alts: ['Skyline', 'Architecture', 'Towers'] },
    { re: /\b(portrait|person|face|woman|man|child|smile)\b/, alts: ['Portrait', 'Close-Up', 'Silhouette'] },
    { re: /\b(macro|insect|leaf|texture)\b/, alts: ['Macro Study', 'Detail', 'Close-Up'] },
    { re: /\b(still life|arranged|object|table)\b/, alts: ['Still Life', 'Study', 'Tabletop'] },
    { re: /\b(horizon|landscape|scenic|view)\b/, alts: ['Horizon', 'Vista', 'Landscape'] },
  ];

  let matchedNouns = ['Capture', 'Frame', 'Scene'];
  for (const entry of nounPatterns) {
    if (entry.re.test(lower)) {
      matchedNouns = entry.alts;
      break;
    }
  }

  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'with', 'under', 'beneath', 'against',
    'photograph', 'image', 'photo', 'picture', 'featuring', 'colored', 'tones', 'light',
    'lighting', 'visual', 'composition', 'even', 'balanced', 'depicting', 'soft', 'focus',
    'center', 'background', 'blur', 'frame', 'view', 'scene', 'detail', 'object', 'very',
  ]);

  const descKeywords = text
    .replace(/[^a-zA-Z\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !stopWords.has(w.toLowerCase()))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  const alts: string[] = [];
  if (hintWords) {
    alts.push(hintWords);
    alts.push(`${toneWord} ${hintWords}`.split(/\s+/).slice(0, 3).join(' '));
  }
  alts.push(`${toneWord} ${matchedNouns[0]}`);
  alts.push(`${toneWord} ${matchedNouns[1]}`);
  if (descKeywords.length >= 2) {
    alts.push(`${descKeywords[0]} ${descKeywords[1]}`);
  }
  alts.push(`${matchedNouns[2]} Study`);

  return Array.from(
    new Set(
      alts
        .map((n) => n.split(/\s+/).slice(0, 4).join(' ').trim())
        .filter((n) => n.length >= 3)
    )
  ).slice(0, 4);
}

/**
 * Calls the server's Step 2 endpoint with ONLY the description string to generate
 * short image-related card names.
 */
export async function generateShortNameFromServerDescription(
  description: string
): Promise<{ shortName: string; alternatives: string[] }> {
  try {
    const res = await fetch('/api/mmo/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.shortName) {
        return {
          shortName: data.shortName,
          alternatives: Array.isArray(data.alternatives)
            ? data.alternatives
            : [data.shortName],
        };
      }
    }
  } catch {
    // Fallback cleanly below
  }
  const alts = deriveShortNamesFromDescription(description);
  return { shortName: alts[0] || 'Photo Capture', alternatives: alts };
}

/**
 * Builds a small (<80KB) 512px JPEG file for fast Step 1 server AI analysis & NSFW check.
 */
async function buildInspectionFile(file: File, img: HTMLImageElement): Promise<File> {
  const maxDim = 512;
  const origW = img.naturalWidth || img.width || 512;
  const origH = img.naturalHeight || img.height || 512;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const w = Math.max(1, Math.round(origW * scale));
  const h = Math.max(1, Math.round(origH * scale));

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.78);
  if (!blob) return file;
  return new File([blob], file.name, { type: 'image/jpeg' });
}

/**
 * Step 1 + Step 2 Pre-Forge Scanner:
 * 1) Extracts fast client visual telemetry & uploads a tiny 512px inspection image to /api/mmo/analyze
 *    to run Step 1 (NSFW screening + visual image description).
 * 2) Uses ONLY the Step 1 image description to obtain a short image-related card name.
 */
export async function analyzeStagedPhotoPreview(
  file: File
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

    // Build fallback literal description in case offline / network error
    const toneStr =
      luminance < 68
        ? 'moody low-key shadows'
        : luminance > 180
        ? 'bright daylight highlights'
        : r > b + 28
        ? 'warm golden tones'
        : b > r + 18
        ? 'cool blue tones'
        : 'balanced natural tones';
    let aiDescription = `A ${predictedCategory.toLowerCase()} photograph with ${toneStr}.`;
    let isNsfw = false;
    let nsfwReason = '';
    let visionProvider = 'local-vision';
    let aiNamePool = deriveShortNamesFromDescription(aiDescription);

    try {
      const inspectionFile = await buildInspectionFile(file, img);
      const fd = new FormData();
      fd.append('photos', inspectionFile);
      const analyzeRes = await fetch('/api/mmo/analyze', {
        method: 'POST',
        body: fd,
      });
      if (analyzeRes.ok) {
        const analyzeJson = await analyzeRes.json();
        const first = Array.isArray(analyzeJson.results) ? analyzeJson.results[0] : null;
        if (first) {
          isNsfw = Boolean(first.isNsfw);
          nsfwReason = String(first.nsfwReason || '');
          if (first.description) {
            aiDescription = String(first.description);
          }
          if (Array.isArray(first.alternatives) && first.alternatives.length > 0) {
            aiNamePool = first.alternatives;
          } else if (first.shortName) {
            aiNamePool = [String(first.shortName)];
          } else {
            aiNamePool = deriveShortNamesFromDescription(aiDescription);
          }
          visionProvider = String(first.step1Provider || 'server-vision');
        }
      }
    } catch {
      // Keep local description & short names if offline
    }

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
      isNsfw,
      nsfwReason,
      aiDescription,
      aiName: aiNamePool[0] || 'Photo Capture',
      aiNamePool,
      visionProvider,
      rerollIndex: 0,
    };
  } catch {
    const fallbackDesc = 'A photograph ready for analysis and naming.';
    const fallbackPool = deriveShortNamesFromDescription(fallbackDesc);
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
      isNsfw: false,
      nsfwReason: '',
      aiDescription: fallbackDesc,
      aiName: fallbackPool[0] || 'Photo Capture',
      aiNamePool: fallbackPool,
      visionProvider: 'local-vision',
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
