import sharp from 'sharp';
import type { ExtractedExif } from './optimizer.ts';

export interface ImageAnalysisStep1Result {
  isNsfw: boolean;
  nsfwScore: number; // 0.0 to 1.0
  nsfwReason: string;
  description: string;
  provider: 'openai-vision' | 'gemini-vision' | 'local-vision';
}

export interface DescriptionNamingStep2Result {
  shortName: string;
  alternatives: string[];
  provider: 'openai-text' | 'gemini-text' | 'description-nlp';
}

const NSFW_FILENAME_REGEX =
  /(?:^|[\W_])(nsfw|porn|xxx|nude|naked|hentai|erotic|explicit|onlyfans|boobs|tits|asshole|pussy|dick|cock|penis|vagina|gore|snuff)(?:$|[\W_])/i;

/**
 * Resize an uploaded image buffer into a small JPEG suitable for Vision AI inspection.
 */
async function buildVisionInspectionJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Heuristic + spatial pixel analysis fallback for NSFW screening & literal scene description
 * when no cloud Vision API key (OPENAI_API_KEY / GEMINI_API_KEY) is configured.
 */
async function analyzeImageLocalVision(
  buffer: Buffer,
  originalFilename: string,
  exif?: ExtractedExif
): Promise<ImageAnalysisStep1Result> {
  // 1. Filename safety check
  if (NSFW_FILENAME_REGEX.test(originalFilename)) {
    return {
      isNsfw: true,
      nsfwScore: 0.96,
      nsfwReason: 'Explicit / NSFW indicator detected in uploaded image metadata.',
      description: 'Flagged explicit image.',
      provider: 'local-vision',
    };
  }

  const G = 64;
  const { data, info } = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(G, G, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const meta = await sharp(buffer, { failOn: 'none' }).rotate().metadata();
  const origW = meta.width || 1200;
  const origH = meta.height || 900;
  const aspect = origW / Math.max(1, origH);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const lums: number[] = [];

  let skinPx = 0;
  let centerSkinPx = 0;
  let centerTotalPx = 0;
  let skinSmoothPx = 0;
  let foliagePx = 0;
  let skyBluePx = 0;
  let waterPx = 0;
  let warmGlowPx = 0;
  let pinpointLights = 0;

  let centerEdges = 0;
  let borderEdges = 0;
  let centerEdgeCount = 0;
  let borderEdgeCount = 0;
  let orthoEdges = 0;
  let diagEdges = 0;

  const totalPx = info.width * info.height;
  const gray = new Float32Array(totalPx);
  const isSkinMask = new Uint8Array(totalPx);

  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const i = y * G + x;
      const idx = i * 3;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      rSum += r;
      gSum += g;
      bSum += b;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = lum;
      lums.push(lum);

      // YCbCr skin detector (standard Kovac + Chai/Ngan bounds)
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const isSkin =
        r > 85 &&
        g > 40 &&
        b > 20 &&
        r > g &&
        r > b &&
        Math.abs(r - g) > 12 &&
        cb >= 77 &&
        cb <= 127 &&
        cr >= 133 &&
        cr <= 173;

      const inCenter = x >= G * 0.2 && x <= G * 0.8 && y >= G * 0.2 && y <= G * 0.8;
      if (inCenter) centerTotalPx++;

      if (isSkin) {
        isSkinMask[i] = 1;
        skinPx++;
        if (inCenter) centerSkinPx++;
      }

      if (g > r + 10 && g > b + 12 && g > 48) foliagePx++;
      if (y < G * 0.45 && b > r + 18 && b >= g && lum > 110) skyBluePx++;
      if (y >= G * 0.45 && b > r + 15 && b >= g - 5) waterPx++;
      if (r > 180 && g > 95 && b < 110) warmGlowPx++;
      if (lum > 225) pinpointLights++;
    }
  }

  for (let y = 1; y < G - 1; y++) {
    for (let x = 1; x < G - 1; x++) {
      const i = y * G + x;
      const gx = Math.abs(gray[y * G + (x + 1)] - gray[y * G + (x - 1)]);
      const gy = Math.abs(gray[(y + 1) * G + x] - gray[(y - 1) * G + x]);
      const mag = gx + gy;

      if (isSkinMask[i] && mag < 18) {
        skinSmoothPx++;
      }

      if (mag > 22) {
        if (gx > gy * 2.1 || gy > gx * 2.1) orthoEdges++;
        else diagEdges++;
      }

      const inCenter = x >= G * 0.25 && x <= G * 0.75 && y >= G * 0.2 && y <= G * 0.8;
      if (inCenter) {
        centerEdges += mag;
        centerEdgeCount++;
      } else {
        borderEdges += mag;
        borderEdgeCount++;
      }
    }
  }

  const skinRatio = skinPx / Math.max(1, totalPx);
  const centerSkinRatio = centerSkinPx / Math.max(1, centerTotalPx);
  const smoothSkinRatio = skinSmoothPx / Math.max(1, skinPx);

  // Conservative NSFW skin-exposure screen: normal clothed portraits stay far below 0.56.
  // Images dominated by contiguous smooth exposed flesh across the frame are flagged & purged.
  const nsfwScore = Number(
    Math.min(
      0.99,
      skinRatio * 0.65 + centerSkinRatio * 0.35 + (smoothSkinRatio > 0.78 ? 0.15 : 0)
    ).toFixed(2)
  );
  const isNsfw =
    (skinRatio > 0.56 && centerSkinRatio > 0.58 && smoothSkinRatio > 0.68) ||
    skinRatio > 0.72;

  if (isNsfw) {
    return {
      isNsfw: true,
      nsfwScore: Math.max(0.82, nsfwScore),
      nsfwReason:
        'Excessive exposed skin concentration detected by Soul-Lens NSFW Vision Shield.',
      description: 'Blocked NSFW image removed before storage.',
      provider: 'local-vision',
    };
  }

  // Build literal visual scene description based on observed visual traits
  const r = Math.round(rSum / totalPx);
  const g = Math.round(gSum / totalPx);
  const b = Math.round(bSum / totalPx);
  const avgLum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const contrast = Math.round(
    Math.sqrt(lums.reduce((acc, l) => acc + (l - avgLum) ** 2, 0) / Math.max(1, lums.length))
  );
  const saturation = Math.max(r, g, b) - Math.min(r, g, b);

  const centerFocusRatio =
    centerEdges / Math.max(1, centerEdgeCount) / Math.max(1, borderEdges / Math.max(1, borderEdgeCount));
  const orthoRatio = orthoEdges / Math.max(1, orthoEdges + diagEdges);
  const foliageRatio = foliagePx / totalPx;
  const skyRatio = skyBluePx / totalPx;
  const waterRatio = waterPx / totalPx;
  const warmRatio = warmGlowPx / totalPx;

  let colorMood = 'natural balanced';
  if (saturation < 22) colorMood = 'crisp monochrome black-and-white';
  else if (warmRatio > 0.18 || (r > g + 18 && g > b + 20)) colorMood = 'warm golden-amber';
  else if (r > g + 25 && r > b + 25) colorMood = 'vivid crimson-red';
  else if (foliageRatio > 0.15) colorMood = 'lush forest green';
  else if (waterRatio > 0.18 || b > r + 20) colorMood = 'deep ocean blue';
  else if (r > 130 && b > 130 && g < 120) colorMood = 'violet twilight';

  let lightingDesc = 'even natural light';
  if (avgLum < 58 && pinpointLights > 18) lightingDesc = 'glowing highlights under a dark night sky';
  else if (avgLum < 68) lightingDesc = 'moody low-key shadows';
  else if (avgLum > 182) lightingDesc = 'bright high-key daylight';
  else if (contrast > 62) lightingDesc = 'dramatic high-contrast light and shadow';

  let subjectDesc = 'a balanced visual composition';
  if (avgLum < 62 && pinpointLights > 24) {
    subjectDesc = 'bright night lights or stars glowing against a dark sky';
  } else if (foliageRatio > 0.18 && skyRatio > 0.08) {
    subjectDesc = 'an outdoor landscape with green trees beneath an open sky';
  } else if (foliageRatio > 0.2) {
    subjectDesc = 'dense natural greenery and outdoor foliage';
  } else if (waterRatio > 0.2 && skyRatio > 0.08) {
    subjectDesc = 'open water reflecting a wide horizon sky';
  } else if (orthoRatio > 0.56 && centerFocusRatio < 1.35) {
    subjectDesc = 'structured architectural buildings and clean geometric lines';
  } else if ((aspect < 0.92 && skinRatio > 0.06) || (centerFocusRatio > 1.3 && skinRatio > 0.08)) {
    subjectDesc = 'a centered close-up portrait subject with soft background blur';
  } else if (centerFocusRatio > 1.5 && foliageRatio > 0.05) {
    subjectDesc = 'a close-up macro wildlife or nature detail in sharp center focus';
  } else if (centerFocusRatio > 1.36 && aspect >= 0.8 && aspect <= 1.4) {
    subjectDesc = 'an arranged still life object centered in soft ambient light';
  } else if (aspect >= 1.35) {
    subjectDesc = 'a wide scenic horizon view';
  } else if (aspect <= 0.78) {
    subjectDesc = 'a tall vertical street or architectural frame';
  }

  // Include clean semantic words from filename only if meaningful (no IMG_1234 camera codes)
  const cleanWords = originalFilename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z]/g, ''))
    .filter((w) => w.length >= 3 && w.length <= 15)
    .filter(
      (w) =>
        !/^(img|dsc|dscf|dscn|pxl|dcim|mvi|gopr|dji|sam|screenshot|photo|image|pic|untitled|upload|file|jpeg|jpg|png|webp|avif)$/i.test(
          w
        )
    );

  const hintClause =
    cleanWords.length > 0 ? ` depicting ${cleanWords.slice(0, 3).join(' ').toLowerCase()}` : '';

  const fNote = exif?.focalLength && parseInt(exif.focalLength, 10) >= 85 ? ' with telephoto compression' : '';

  const description = `A photograph featuring ${subjectDesc}${hintClause}, colored in ${colorMood} tones with ${lightingDesc}${fNote}.`;

  return {
    isNsfw: false,
    nsfwScore,
    nsfwReason: '',
    description,
    provider: 'local-vision',
  };
}

/**
 * STEP 1: Analyze the uploaded image with AI Vision (OpenAI / Gemini when keys exist, else local sharp CV).
 * Determines whether the image is NSFW (so it can be deleted immediately) and returns an objective description.
 */
export async function analyzeUploadedImageStep1(
  buffer: Buffer,
  originalFilename: string,
  exif?: ExtractedExif
): Promise<ImageAnalysisStep1Result> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();

  if (openaiKey || geminiKey) {
    try {
      const jpegBuf = await buildVisionInspectionJpeg(buffer);
      const b64 = jpegBuf.toString('base64');

      const systemPrompt =
        'You are an image safety moderator and visual captioner. Return ONLY valid JSON with keys: "isNsfw" (boolean: true if explicit nudity, sexual content, pornography, or graphic gore/violence), "nsfwReason" (string, empty if safe), and "description" (string: 1-2 clear sentences describing ONLY what is literally visible in the image itself — subjects, objects, setting, colors, lighting).';

      if (openaiKey) {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            max_tokens: 220,
            temperature: 0.2,
            messages: [
              { role: 'system', content: systemPrompt },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Analyze this uploaded image for NSFW safety and describe what is visible.' },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' } },
                ],
              },
            ],
          }),
        });
        if (resp.ok) {
          const data = (await resp.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const rawText = data.choices?.[0]?.message?.content || '';
          const parsed = JSON.parse(rawText);
          if (typeof parsed.description === 'string') {
            return {
              isNsfw: Boolean(parsed.isNsfw),
              nsfwScore: parsed.isNsfw ? 0.95 : 0.02,
              nsfwReason: String(parsed.nsfwReason || (parsed.isNsfw ? 'Flagged NSFW by safety filter.' : '')),
              description: parsed.description.trim(),
              provider: 'openai-vision',
            };
          }
        }
      }

      if (geminiKey) {
        const model = process.env.GEMINI_VISION_MODEL || 'gemini-2.0-flash';
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
            geminiKey
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: systemPrompt },
                    { inlineData: { mimeType: 'image/jpeg', data: b64 } },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2,
              },
            }),
          }
        );
        if (resp.ok) {
          const data = (await resp.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const parsed = JSON.parse(rawText);
          if (typeof parsed.description === 'string') {
            return {
              isNsfw: Boolean(parsed.isNsfw),
              nsfwScore: parsed.isNsfw ? 0.95 : 0.02,
              nsfwReason: String(parsed.nsfwReason || (parsed.isNsfw ? 'Flagged NSFW by safety filter.' : '')),
              description: parsed.description.trim(),
              provider: 'gemini-vision',
            };
          }
        }
      }
    } catch {
      // Fall through cleanly to local computer vision if external API fails
    }
  }

  return analyzeImageLocalVision(buffer, originalFilename, exif);
}

/**
 * Deterministic Step 2 helper: Derives a short (2-4 word) card name strictly from
 * the plain-text visual description of the image itself.
 */
export function buildShortNameFromDescription(description: string): DescriptionNamingStep2Result {
  const text = description.trim();
  const lower = text.toLowerCase();

  // If the description explicitly states what is depicted ("depicting X Y"), prioritize that subject!
  const depictingMatch = text.match(/depicting\s+([a-zA-Z0-9\s-]{3,28})(?:,|\.|$)/i);
  const subjectWordsFromHint = depictingMatch
    ? depictingMatch[1]
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
    : null;

  // Color/Light descriptor extracted ONLY from the description text
  let toneWord = '';
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
  else toneWord = 'Natural';

  // Concrete visual subject noun extracted ONLY from the description text
  const nounPatterns: Array<{ re: RegExp; alts: string[] }> = [
    { re: /\b(dog|puppy|retriever|hound)\b/, alts: ['Hound', 'Companion', 'Retriever'] },
    { re: /\b(cat|kitten|feline)\b/, alts: ['Feline', 'Cat', 'Prowler'] },
    { re: /\b(bird|eagle|owl|hawk|seagull)\b/, alts: ['Wing', 'Bird', 'Soarer'] },
    { re: /\b(car|vehicle|motorcycle|bike|train)\b/, alts: ['Cruiser', 'Machine', 'Racer'] },
    { re: /\b(flower|rose|bloom|blossom|petal)\b/, alts: ['Blossom', 'Bloom', 'Petal'] },
    { re: /\b(coffee|espresso|latte|drink|cup|glass)\b/, alts: ['Glass', 'Cup', 'Brew'] },
    { re: /\b(food|dish|plate|cake|meal|pizza|burger)\b/, alts: ['Plate', 'Feast', 'Tabletop'] },
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

  // Also grab salient capitalized or descriptive nouns directly from description words
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
  if (subjectWordsFromHint) {
    alts.push(subjectWordsFromHint);
    alts.push(`${toneWord} ${subjectWordsFromHint}`.split(/\s+/).slice(0, 3).join(' '));
  }
  alts.push(`${toneWord} ${matchedNouns[0]}`);
  alts.push(`${toneWord} ${matchedNouns[1]}`);
  if (descKeywords.length >= 2) {
    alts.push(`${descKeywords[0]} ${descKeywords[1]}`);
  }
  alts.push(`${matchedNouns[2]} Study`);

  // Deduplicate and enforce short 2-4 word names
  const uniqueAlts = Array.from(
    new Set(
      alts
        .map((n) => n.split(/\s+/).slice(0, 4).join(' ').trim())
        .filter((n) => n.length >= 3)
    )
  ).slice(0, 4);

  return {
    shortName: uniqueAlts[0] || `${toneWord} ${matchedNouns[0]}`,
    alternatives: uniqueAlts,
    provider: 'description-nlp',
  };
}

/**
 * STEP 2: Using ONLY the text description of the image, generate a short (2-4 word)
 * card name that relates directly to the image itself.
 */
export async function nameCardFromDescriptionStep2(
  description: string
): Promise<DescriptionNamingStep2Result> {
  const cleanDescription = description.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();

  const prompt =
    `Using ONLY the image description below, provide a short card name (2 to 4 words max) that directly relates to what is in the image itself, plus 3 short alternative names (2 to 4 words each). Do NOT use generic unrelated fantasy RPG words.\n` +
    `Return ONLY JSON: { "shortName": string, "alternatives": string[] }\n\n` +
    `Image description: "${cleanDescription}"`;

  try {
    if (openaiKey) {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          max_tokens: 120,
          temperature: 0.4,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        if (typeof parsed.shortName === 'string' && parsed.shortName.trim()) {
          const shortName = parsed.shortName.trim().split(/\s+/).slice(0, 4).join(' ');
          const alternatives = Array.isArray(parsed.alternatives)
            ? parsed.alternatives
                .map((x: unknown) => String(x).trim().split(/\s+/).slice(0, 4).join(' '))
                .filter(Boolean)
            : [];
          return {
            shortName,
            alternatives: Array.from(new Set([shortName, ...alternatives])).slice(0, 4),
            provider: 'openai-text',
          };
        }
      }
    }

    if (geminiKey) {
      const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.0-flash';
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          geminiKey
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.4,
            },
          }),
        }
      );
      if (resp.ok) {
        const data = (await resp.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const parsed = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        if (typeof parsed.shortName === 'string' && parsed.shortName.trim()) {
          const shortName = parsed.shortName.trim().split(/\s+/).slice(0, 4).join(' ');
          const alternatives = Array.isArray(parsed.alternatives)
            ? parsed.alternatives
                .map((x: unknown) => String(x).trim().split(/\s+/).slice(0, 4).join(' '))
                .filter(Boolean)
            : [];
          return {
            shortName,
            alternatives: Array.from(new Set([shortName, ...alternatives])).slice(0, 4),
            provider: 'gemini-text',
          };
        }
      }
    }
  } catch {
    // Fall back to deterministic description NLP
  }

  return buildShortNameFromDescription(cleanDescription);
}
