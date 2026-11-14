import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { UPLOADS_DIR } from './db.ts';
import { optimizeUploadedPhoto, deletePhotoFiles } from './optimizer.ts';
import {
  registerAuthRoutes,
  getSessionUser,
  createSession,
  type SessionUser,
} from './auth.ts';
import { analyzeAndForgeCard } from './cardForge.ts';
import {
  analyzeUploadedImageStep1,
  nameCardFromDescriptionStep2,
} from './visionAi.ts';
import {
  getMmoState,
  saveMmoState,
  resetMmoState,
  createNewMmoCardId,
  registerMmoAccount,
  loginMmoAccount,
  requestPhoneVerificationCode,
  verifyPhoneCodeAndAuthenticate,
  listRegisteredAccounts,
  ensurePlayerInState,
  mergeClientStateIntoServer,
  type MmoCard,
  type MmoPlayer,
  type MmoState,
  type FactionId,
  type FoilTier,
} from './mmoState.ts';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

// Serve optimized WebP/AVIF derivatives with aggressive caching
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '365d',
    immutable: true,
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 60 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/tiff',
    ];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image format: ${file.mimetype}`));
    }
  },
});

const api = express.Router();
registerAuthRoutes(api);

function resolveAuthenticatedOrHeaderPlayer(
  req: Request,
  state: MmoState
): MmoPlayer | null {
  const sessionUser = getSessionUser(req);
  if (sessionUser) {
    const playerId = sessionUser.id.startsWith('player-')
      ? sessionUser.id
      : `player-${sessionUser.username.toLowerCase()}`;
    return ensurePlayerInState(state, {
      id: playerId,
      username: sessionUser.username,
      displayName: sessionUser.name,
    });
  }

  return null;
}

function requireAuthPlayer(
  req: Request,
  res: Response,
  state: MmoState
): MmoPlayer | null {
  const player = resolveAuthenticatedOrHeaderPlayer(req, state);
  if (!player) {
    res.status(401).json({
      error: 'Please sign in with your phone number first.',
    });
    return null;
  }
  return player;
}

// Get Full CHROMARIFT MMO State
api.get('/mmo/state', (req: Request, res: Response) => {
  const state = getMmoState();
  const sessionUser = getSessionUser(req);
  const activePlayer = resolveAuthenticatedOrHeaderPlayer(req, state);
  saveMmoState(state);
  res.json({
    ...state,
    sessionUser,
    activePlayerId: activePlayer ? activePlayer.id : null,
    accounts: listRegisteredAccounts(),
  });
});

// Sync Client IndexedDB / LocalStorage State into Server DB (Prevents upload loss across serverless cold starts!)
api.post('/mmo/sync', (req: Request, res: Response) => {
  const incoming = (req.body?.state || req.body || {}) as Partial<MmoState>;
  const state = mergeClientStateIntoServer(incoming);
  const sessionUser = getSessionUser(req);
  const activePlayer = resolveAuthenticatedOrHeaderPlayer(req, state);
  saveMmoState(state);
  res.json({
    ok: true,
    state,
    sessionUser,
    activePlayerId: activePlayer ? activePlayer.id : null,
    accounts: listRegisteredAccounts(),
  });
});

// Phone Verification Step 1: Send 6-Digit SMS Verification Code (Sign Up or Log In)
api.post('/mmo/auth/phone/send-code', async (req: Request, res: Response) => {
  try {
    const { phone, countryCode } = (req.body || {}) as {
      phone?: string;
      countryCode?: string;
    };
    const result = await requestPhoneVerificationCode(phone || '', countryCode || '+1');
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to send verification code.';
    res.status(500).json({ error: msg });
  }
});

// Phone Verification Step 2: Verify 6-Digit Code -> Instant Account Creation or Sign In
api.post('/mmo/auth/phone/verify', (req: Request, res: Response) => {
  const { phone, countryCode, code, otpToken, displayName, username, faction } = (req.body ||
    {}) as {
    phone?: string;
    countryCode?: string;
    code?: string;
    otpToken?: string;
    displayName?: string;
    username?: string;
    faction?: FactionId;
  };

  const result = verifyPhoneCodeAndAuthenticate({
    phoneRaw: phone || '',
    countryCode,
    codeRaw: code || '',
    otpToken,
    displayNameRaw: displayName,
    usernameRaw: username,
    factionRaw: faction,
  });

  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  const sessionUser: SessionUser = {
    id: result.account.id,
    name: result.account.displayName,
    username: result.account.username,
    email: `${result.account.username}@chromarift.local`,
    provider: 'local-owner',
  };
  createSession(res, sessionUser);

  const state = getMmoState();
  res.status(result.isNewUser ? 201 : 200).json({
    ok: true,
    isNewUser: result.isNewUser,
    sessionUser,
    activePlayerId: result.player.id,
    player: result.player,
    state,
    accounts: listRegisteredAccounts(),
  });
});

// Legacy Password Registration Endpoint (Kept for backward compatibility)
api.post('/mmo/auth/register', (req: Request, res: Response) => {
  const { username, displayName, password, faction } = (req.body || {}) as {
    username?: string;
    displayName?: string;
    password?: string;
    faction?: FactionId;
  };

  const result = registerMmoAccount(
    username || '',
    displayName || '',
    password || '',
    faction
  );
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  const sessionUser: SessionUser = {
    id: result.account.id,
    name: result.account.displayName,
    username: result.account.username,
    email: `${result.account.username}@chromarift.local`,
    provider: 'local-owner',
  };
  createSession(res, sessionUser);

  const state = getMmoState();
  res.status(201).json({
    ok: true,
    sessionUser,
    activePlayerId: result.player.id,
    player: result.player,
    state,
    accounts: listRegisteredAccounts(),
  });
});

// Legacy Password Login Endpoint (Kept for backward compatibility)
api.post('/mmo/auth/login', (req: Request, res: Response) => {
  const { username, password } = (req.body || {}) as {
    username?: string;
    password?: string;
  };

  const result = loginMmoAccount(username || '', password);
  if (!result.ok) {
    res.status(401).json({ error: result.error });
    return;
  }

  const sessionUser: SessionUser = {
    id: result.account.id,
    name: result.account.displayName,
    username: result.account.username,
    email: `${result.account.username}@chromarift.local`,
    provider: 'local-owner',
  };
  createSession(res, sessionUser);

  const state = getMmoState();
  res.json({
    ok: true,
    sessionUser,
    activePlayerId: result.player.id,
    player: result.player,
    state,
    accounts: listRegisteredAccounts(),
  });
});

// Log Out of Current Session
api.post('/mmo/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('arron_portfolio_session', { path: '/' });
  const state = getMmoState();
  res.json({
    ok: true,
    sessionUser: null,
    activePlayerId: null,
    state,
    accounts: listRegisteredAccounts(),
  });
});

// Reset MMO State (Clean Slate Wipe)
api.post('/mmo/reset', (_req: Request, res: Response) => {
  res.clearCookie('arron_portfolio_session', { path: '/' });
  const state = resetMmoState();
  res.json({ ok: true, state });
});

// 2-Step AI Pre-Forge Endpoint:
// 1) Analyze image -> check NSFW (and immediately delete/discard if NSFW) + return literal description
// 2) Using JUST the description, generate a short card name relating to the image itself
api.post(
  '/mmo/analyze',
  upload.array('photos', 10),
  async (req: Request, res: Response) => {
    try {
      // Optional text-only Step 2 mode: regenerate short name strictly from provided description
      if (req.is('application/json') && typeof req.body?.description === 'string') {
        const desc = req.body.description.trim();
        if (!desc) {
          res.status(400).json({ error: 'Image description is required for Step 2 naming.' });
          return;
        }
        const step2 = await nameCardFromDescriptionStep2(desc);
        res.json({
          ok: true,
          description: desc,
          shortName: step2.shortName,
          alternatives: step2.alternatives,
          step2Provider: step2.provider,
        });
        return;
      }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No photo uploaded for AI analysis.' });
        return;
      }

      const results = [];
      for (const file of files) {
        // Step 1: Analyze uploaded image + screen for NSFW
        const step1 = await analyzeUploadedImageStep1(file.buffer, file.originalname);
        if (step1.isNsfw) {
          // Immediately purge buffer reference — never store NSFW uploads
          file.buffer.fill(0);
          results.push({
            fileName: file.originalname,
            isNsfw: true,
            deleted: true,
            nsfwScore: step1.nsfwScore,
            nsfwReason: step1.nsfwReason,
            description: '',
            shortName: '',
            alternatives: [],
            step1Provider: step1.provider,
          });
          continue;
        }

        // Step 2: Using JUST the description from Step 1, generate a short name related to the image
        const step2 = await nameCardFromDescriptionStep2(step1.description);
        results.push({
          fileName: file.originalname,
          isNsfw: false,
          deleted: false,
          nsfwScore: step1.nsfwScore,
          nsfwReason: '',
          description: step1.description,
          shortName: step2.shortName,
          alternatives: step2.alternatives,
          step1Provider: step1.provider,
          step2Provider: step2.provider,
        });
      }

      res.json({ ok: true, results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze image';
      res.status(500).json({ error: msg });
    }
  }
);

// Forge Photo(s) into Collectible Combat Cards (Either Bound to Player Deck OR Sent to the Wild!)
api.post(
  '/mmo/forge',
  upload.array('photos', 10),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No photo received for Soul-Lens Forging.' });
        return;
      }

      const state = getMmoState();
      const player = requireAuthPlayer(req, res, state);
      if (!player) return;

      const destination = req.body.destination === 'wild' ? 'wild' : 'deck';
      const isWild = destination === 'wild';
      const shareToFeed = req.body.shareToFeed !== 'false';
      const equipSlot =
        !isWild && req.body.equipSlot !== undefined && req.body.equipSlot !== ''
          ? Number(req.body.equipSlot)
          : -1;

      let customTitles: Record<string, string> = {};
      if (req.body.titles) {
        try {
          customTitles = JSON.parse(req.body.titles);
        } catch {
          customTitles = {};
        }
      }

      let customCaptions: Record<string, string> = {};
      if (req.body.captions) {
        try {
          customCaptions = JSON.parse(req.body.captions);
        } catch {
          customCaptions = {};
        }
      }

      let clientDescriptions: Record<string, string> = {};
      if (req.body.descriptions) {
        try {
          clientDescriptions = JSON.parse(req.body.descriptions);
        } catch {
          clientDescriptions = {};
        }
      }

      let clientOriginalSizes: Record<string, number> = {};
      if (req.body.clientOriginalSizes) {
        try {
          clientOriginalSizes = JSON.parse(req.body.clientOriginalSizes);
        } catch {
          clientOriginalSizes = {};
        }
      }

      let clientExifMap: Record<
        string,
        Partial<{
          camera: string;
          lens: string;
          focalLength: string;
          aperture: string;
          shutterSpeed: string;
          iso: string;
          takenAt: string;
        }>
      > = {};
      if (req.body.clientExif) {
        try {
          clientExifMap = JSON.parse(req.body.clientExif);
        } catch {
          clientExifMap = {};
        }
      }

      const forgedCards: MmoCard[] = [];
      const rejectedNsfw: Array<{
        fileName: string;
        deleted: boolean;
        reason: string;
        score: number;
      }> = [];

      for (const file of files) {
        // STEP 1: Analyze uploaded image FIRST to detect NSFW and immediately delete/purge if NSFW
        const step1 = await analyzeUploadedImageStep1(file.buffer, file.originalname);
        if (step1.isNsfw) {
          // Immediately wipe uploaded buffer and ensure nothing is saved on disk or in state
          file.buffer.fill(0);
          rejectedNsfw.push({
            fileName: file.originalname,
            deleted: true,
            reason: step1.nsfwReason || 'NSFW content detected and deleted.',
            score: step1.nsfwScore,
          });
          continue;
        }

        const cardId = createNewMmoCardId();
        let opt;
        try {
          opt = await optimizeUploadedPhoto(cardId, file.buffer, file.originalname, {
            webpQuality: 82,
            avifQuality: 68,
            keepOriginals: false,
          });
        } catch (optErr) {
          await deletePhotoFiles(cardId, '{}');
          throw optErr;
        }

        const cExif = clientExifMap[file.originalname] || {};
        const mergedExif = {
          camera: opt.exif.camera || cExif.camera || 'Optical Camera Sensor',
          lens: opt.exif.lens || cExif.lens || 'Prime Optical Glass',
          focalLength: opt.exif.focalLength || cExif.focalLength || '35mm',
          aperture: opt.exif.aperture || cExif.aperture || 'f/2.0',
          shutterSpeed: opt.exif.shutterSpeed || cExif.shutterSpeed || '1/500s',
          iso: opt.exif.iso || cExif.iso || 'ISO 400',
          takenAt: opt.exif.takenAt || cExif.takenAt || '',
        };

        const activeDescription = (
          clientDescriptions[file.originalname] ||
          step1.description ||
          ''
        ).trim();

        // STEP 2: Using JUST the image description, generate a short card name that relates to the image itself
        const step2 = await nameCardFromDescriptionStep2(activeDescription);

        const hintText = `${file.originalname} ${activeDescription} ${
          customTitles[file.originalname] || ''
        }`;

        const forged = await analyzeAndForgeCard(
          file.buffer,
          mergedExif,
          opt.width,
          opt.height,
          hintText
        );

        const reportedOrigSize = Number(clientOriginalSizes[file.originalname] || 0);
        const finalOrigBytes =
          reportedOrigSize > opt.originalSizeBytes
            ? reportedOrigSize
            : opt.originalSizeBytes;
        const savingsRatio =
          finalOrigBytes > 0 ? Math.max(0, 1 - opt.optimizedSizeBytes / finalOrigBytes) : 0;

        const rawCustomTitle = (customTitles[file.originalname] || '').trim();
        const isGenericCameraCode = /^(img|dsc|dscf|dscn|pxl|dcim|mvi|gopr|dji|screenshot|photo|image|untitled)[\s_-]*\d*$/i.test(
          rawCustomTitle
        );

        const cardTitle = (
          (!isGenericCameraCode && rawCustomTitle) ||
          step2.shortName ||
          (isWild ? 'Wild Rift Photo' : 'Photo Capture')
        ).trim();

        const defaultCaption = isWild
          ? `Released into the Wild Rift! ${activeDescription}`
          : activeDescription;

        const cardCaption = (
          customCaptions[file.originalname] || defaultCaption
        ).trim();

        const newCard: MmoCard = {
          id: cardId,
          ownerId: isWild ? 'wild-rift' : player.id,
          ownerName: isWild ? `Wild Rift (via ${player.displayName})` : player.displayName,
          ownerHandle: player.username,
          ownerFaction: player.faction,
          isWild,
          wildEncounters: 0,
          wildWins: 0,
          title: cardTitle,
          epithet: forged.epithet,
          caption: cardCaption,
          imageUrl: opt.variants.gallery_webp.url,
          avifUrl: opt.variants.gallery_avif.url,
          blurDataUrl: opt.blurDataUrl,
          dominantColor: opt.dominantColor,
          element: forged.element,
          category: forged.category,
          categoryConfidence: forged.categoryConfidence,
          categoryBonusLabel: forged.categoryBonusLabel,
          categoryReason: forged.categoryReason,
          vibeCounts: {
            cool: 0,
            cute: 0,
            scary: 0,
            funny: 0,
            chill: 0,
            epic: 0,
          },
          role: forged.role,
          rarity: forged.rarity,
          foil: forged.foil,
          opticalTrait: forged.opticalTrait,
          level: 1,
          ascensionTier: 0,
          hypeCount: 1,
          hp: forged.hp,
          atk: forged.atk,
          def: forged.def,
          spd: forged.spd,
          crit: forged.crit,
          powerRating: forged.powerRating,
          ability: forged.ability,
          exif: {
            camera: mergedExif.camera,
            lens: mergedExif.lens,
            focalLength: mergedExif.focalLength,
            aperture: mergedExif.aperture,
            shutterSpeed: mergedExif.shutterSpeed,
            iso: mergedExif.iso,
          },
          colorTelemetry: forged.colorTelemetry,
          originalSizeBytes: finalOrigBytes,
          optimizedSizeBytes: opt.optimizedSizeBytes,
          savingsPercent: Number((savingsRatio * 100).toFixed(1)),
          createdAt: 'Just now',
        };

        state.cards.unshift(newCard);
        forgedCards.push(newCard);

        // Only equip or store in Player's Deck if NOT sent to the Wild
        if (!isWild) {
          if (player.squadCardIds.length < 4) {
            if (!player.squadCardIds.includes(newCard.id)) {
              player.squadCardIds.push(newCard.id);
            }
          } else if (equipSlot >= 0 && equipSlot < 4) {
            player.squadCardIds[equipSlot] = newCard.id;
          }
        }

        if (shareToFeed) {
          state.posts.unshift({
            id: `post-${crypto.randomUUID().slice(0, 8)}`,
            cardId: newCard.id,
            authorId: player.id,
            authorName: player.displayName,
            authorHandle: player.username,
            authorFaction: player.faction,
            isWildPost: isWild,
            caption: cardCaption,
            hypeCount: 1,
            comments: [],
            createdAt: 'Just now',
          });
        }

        // Award forging / discovery currencies & XP
        player.lumenDust += isWild ? 90 : 120;
        player.chromaticShards += isWild ? 3 : 4;
        player.xp += isWild ? 65 : 85;
        if (player.xp >= player.level * 200) {
          player.level += 1;
        }
      }

      if (forgedCards.length === 0 && rejectedNsfw.length > 0) {
        res.status(422).json({
          ok: false,
          deleted: true,
          rejectedNsfw,
          error: `NSFW Content Detected & Deleted: ${rejectedNsfw[0].reason}`,
        });
        return;
      }

      saveMmoState(state);
      res.status(201).json({
        ok: true,
        destination,
        forgedCards,
        rejectedNsfw,
        state,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to forge photo card';
      res.status(500).json({ error: msg });
    }
  }
);

// Release an existing Deck Card into the Wild Rift so it can be fought later
api.post('/mmo/cards/:id/release-wild', (req: Request, res: Response) => {
  const { id } = req.params;
  const state = getMmoState();
  const player = requireAuthPlayer(req, res, state);
  if (!player) return;
  const card = state.cards.find((c) => c.id === id);

  if (!card) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }

  card.isWild = true;
  card.ownerId = 'wild-rift';
  card.ownerName = `Wild Rift (via ${player.displayName})`;
  card.wildEncounters = card.wildEncounters || 0;
  card.wildWins = card.wildWins || 0;

  // Remove from player's active squad if equipped
  player.squadCardIds = player.squadCardIds.filter((cid) => cid !== card.id);

  // Grant release bonus
  player.lumenDust += 60;
  player.chromaticShards += 2;

  saveMmoState(state);
  res.json({ ok: true, card, state });
});

// Judge a Photo Card with a Vibe Reaction (Cool, Cute, Scary, Funny, Chill, Epic) -> Saves Click & Directly Modifies Card Stats!
api.post('/mmo/cards/:id/judge', (req: Request, res: Response) => {
  const { id } = req.params;
  const { vibe } = (req.body || {}) as {
    vibe?: 'cool' | 'cute' | 'scary' | 'funny' | 'chill' | 'epic';
  };

  const validVibes = ['cool', 'cute', 'scary', 'funny', 'chill', 'epic'] as const;
  if (!vibe || !validVibes.includes(vibe)) {
    res.status(400).json({ error: 'Invalid photo judgment vibe.' });
    return;
  }

  const state = getMmoState();
  const card = state.cards.find((c) => c.id === id);
  if (!card) {
    res.status(404).json({ error: 'Photo card not found.' });
    return;
  }

  if (!card.vibeCounts) {
    card.vibeCounts = {
      cool: 0,
      cute: 0,
      scary: 0,
      funny: 0,
      chill: 0,
      epic: 0,
    };
  }

  card.vibeCounts[vibe] = (card.vibeCounts[vibe] || 0) + 1;
  card.hypeCount = (card.hypeCount || 0) + 1;

  // Apply Vibe-Specific Stat Boosts!
  let statDeltaLabel = '';
  switch (vibe) {
    case 'cool':
      card.spd += 4;
      card.atk += 10;
      statDeltaLabel = '😎 Cool! +4 SPD · +10 ATK';
      break;
    case 'cute':
      card.hp += 55;
      card.def += 12;
      statDeltaLabel = '🥺 Cute! +55 HP · +12 DEF';
      break;
    case 'scary':
      card.atk += 22;
      card.hp += 20;
      statDeltaLabel = '💀 Scary! +22 ATK · +20 HP';
      break;
    case 'funny': {
      const prevCrit = card.crit;
      card.crit = Math.min(85, card.crit + 3);
      const critGain = card.crit - prevCrit;
      if (critGain > 0) {
        card.atk += 8;
        statDeltaLabel = `😂 Funny! +${critGain}% CRIT · +8 ATK`;
      } else {
        card.atk += 20;
        statDeltaLabel = '😂 Funny! (MAX CRIT) +20 ATK';
      }
      break;
    }
    case 'chill':
      card.def += 18;
      card.hp += 40;
      statDeltaLabel = '🌊 Chill! +18 DEF · +40 HP';
      break;
    case 'epic':
      card.atk += 12;
      card.def += 8;
      card.spd += 2;
      card.crit = Math.min(85, card.crit + 1);
      statDeltaLabel = '🔥 Epic! +12 ATK · +8 DEF · +2 SPD · +1% CRIT';
      break;
  }

  // Recompute Dominant Vibe
  let topVibe: typeof vibe = vibe;
  let topCount = -1;
  for (const v of validVibes) {
    const cnt = card.vibeCounts[v] || 0;
    if (cnt > topCount) {
      topCount = cnt;
      topVibe = v;
    }
  }
  card.dominantVibe = topVibe;

  // Recalculate Power Rating
  card.powerRating = Math.round(
    card.hp * 0.25 + card.atk * 2.4 + card.def * 1.8 + card.spd * 1.6 + card.crit * 3.5
  );

  // Sync linked feed post hype count if present
  const linkedPost = state.posts.find((p) => p.cardId === card.id);
  if (linkedPost) {
    linkedPost.hypeCount += 1;
  }

  // Reward judging player
  const player = requireAuthPlayer(req, res, state);
  if (!player) return;
  player.lumenDust += 10;
  player.xp += 15;
  if (player.xp >= player.level * 200) {
    player.level += 1;
  }

  saveMmoState(state);
  res.json({
    ok: true,
    vibe,
    statDeltaLabel,
    card,
    state,
  });
});

// Hype / Boost a Social Feed Post (Directly buffs the Card's Combat Stats!)
api.post('/mmo/posts/:id/hype', (req: Request, res: Response) => {
  const { id } = req.params;
  const state = getMmoState();
  const post = state.posts.find((p) => p.id === id);
  if (!post) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }

  post.hypeCount += 1;
  const card = state.cards.find((c) => c.id === post.cardId);
  if (card) {
    card.hypeCount += 1;
    card.hp = Math.round(card.hp * 1.015);
    card.atk = Math.round(card.atk * 1.015);
    card.powerRating = Math.round(
      card.hp * 0.25 + card.atk * 2.4 + card.def * 1.8 + card.spd * 1.6 + card.crit * 3.5
    );
  }

  const player = requireAuthPlayer(req, res, state);
  if (!player) return;
  player.lumenDust += 15;

  saveMmoState(state);
  res.json({ ok: true, state });
});

// Comment on a Social Feed Post
api.post('/mmo/posts/:id/comment', (req: Request, res: Response) => {
  const { id } = req.params;
  const { text } = (req.body || {}) as { text?: string };
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Comment text is required' });
    return;
  }

  const state = getMmoState();
  const post = state.posts.find((p) => p.id === id);
  if (!post) {
    res.status(404).json({ error: 'Post not found' });
    return;
  }

  const player = requireAuthPlayer(req, res, state);
  if (!player) return;
  post.comments.push({
    id: `c-${crypto.randomUUID().slice(0, 6)}`,
    authorName: player.displayName,
    authorHandle: player.username,
    authorFaction: player.faction,
    text: text.trim(),
    createdAt: 'Just now',
  });

  saveMmoState(state);
  res.json({ ok: true, state });
});

// Update Player Squad Formation or Faction Allegiance
api.put('/mmo/player/squad', (req: Request, res: Response) => {
  const { squadCardIds, faction, displayName } = (req.body || {}) as {
    squadCardIds?: string[];
    faction?: FactionId;
    displayName?: string;
  };

  const state = getMmoState();
  const player = requireAuthPlayer(req, res, state);
  if (!player) return;

  if (Array.isArray(squadCardIds)) {
    // Only allow cards owned by the player (not wild cards)
    const validIds = squadCardIds.filter((cid) => {
      const c = state.cards.find((card) => card.id === cid);
      return c && !c.isWild && c.ownerId === player.id;
    });
    player.squadCardIds = validIds.slice(0, 4);
  }
  if (faction && ['Helios', 'Umbra', 'Prism'].includes(faction)) {
    player.faction = faction;
  }
  if (displayName && displayName.trim()) {
    player.displayName = displayName.trim();
  }

  saveMmoState(state);
  res.json({ ok: true, state });
});

// Upgrade / Foil-Ascend / Fuse a Photo-Card in the Sanctum
api.post('/mmo/cards/:id/upgrade', (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, sacrificeCardId } = (req.body || {}) as {
    action: 'levelup' | 'ascend' | 'fuse';
    sacrificeCardId?: string;
  };

  const state = getMmoState();
  const player = requireAuthPlayer(req, res, state);
  if (!player) return;
  const card = state.cards.find((c) => c.id === id);

  if (!card) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }

  if (action === 'levelup') {
    const cost = card.level * 100;
    if (player.lumenDust < cost) {
      res.status(400).json({ error: `Requires ${cost} Lumen Dust to level up.` });
      return;
    }
    player.lumenDust -= cost;
    card.level += 1;
    card.hp = Math.round(card.hp * 1.1);
    card.atk = Math.round(card.atk * 1.1);
    card.def = Math.round(card.def * 1.08);
    card.spd += 2;
  } else if (action === 'ascend') {
    const shardCost = 8;
    if (player.chromaticShards < shardCost) {
      res.status(400).json({ error: `Requires ${shardCost} Chromatic Shards to Foil-Ascend.` });
      return;
    }
    const foilOrder: FoilTier[] = ['Standard', 'Holo', 'Prismatic', 'MythicRelic'];
    const currentIdx = foilOrder.indexOf(card.foil);
    const nextFoil = foilOrder[Math.min(foilOrder.length - 1, currentIdx + 1)];
    player.chromaticShards -= shardCost;
    card.foil = nextFoil;
    card.ascensionTier += 1;
    card.hp = Math.round(card.hp * 1.14);
    card.atk = Math.round(card.atk * 1.14);
    card.def = Math.round(card.def * 1.12);
    card.crit = Math.min(65, card.crit + 4);
  } else if (action === 'fuse') {
    if (!sacrificeCardId || sacrificeCardId === card.id) {
      res.status(400).json({ error: 'Select a different card to Soul-Fuse.' });
      return;
    }
    const sacIdx = state.cards.findIndex((c) => c.id === sacrificeCardId);
    if (sacIdx === -1) {
      res.status(404).json({ error: 'Sacrifice card not found.' });
      return;
    }
    const sacCard = state.cards[sacIdx];
    card.secondaryTrait = sacCard.opticalTrait;
    card.hp += Math.round(sacCard.hp * 0.18);
    card.atk += Math.round(sacCard.atk * 0.18);
    card.def += Math.round(sacCard.def * 0.18);
    card.spd += Math.round(sacCard.spd * 0.08);
    card.level += 1;

    state.cards.splice(sacIdx, 1);
    player.squadCardIds = player.squadCardIds.filter((cid) => cid !== sacrificeCardId);
  }

  card.powerRating = Math.round(
    card.hp * 0.25 + card.atk * 2.4 + card.def * 1.8 + card.spd * 1.6 + card.crit * 3.5
  );

  saveMmoState(state);
  res.json({ ok: true, card, state });
});

// Delete a Card from the Player's Personal Deck
api.delete('/mmo/cards/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const state = getMmoState();
  const player = requireAuthPlayer(req, res, state);
  if (!player) return;
  const cardIdx = state.cards.findIndex((c) => c.id === id);

  if (cardIdx === -1) {
    res.status(404).json({ error: 'Card not found' });
    return;
  }

  const card = state.cards[cardIdx];
  if (card.ownerId !== player.id) {
    res.status(403).json({ error: 'You can only delete cards from your own personal deck.' });
    return;
  }

  state.cards.splice(cardIdx, 1);
  player.squadCardIds = player.squadCardIds.filter((cid) => cid !== id);
  state.posts = state.posts.filter((p) => p.cardId !== id);

  saveMmoState(state);
  res.json({ ok: true, state });
});

// Record Auto-Battle Outcome against Wild Photo Cards OR Another Player's Personal Deck
api.post('/mmo/battle/record', (req: Request, res: Response) => {
  const { won, wildCardIds, opponentPlayerId } = (req.body || {}) as {
    won: boolean;
    wildCardIds?: string[];
    opponentPlayerId?: string;
  };

  const state = getMmoState();
  const player = requireAuthPlayer(req, res, state);
  if (!player) return;

  if (Array.isArray(wildCardIds)) {
    for (const wid of wildCardIds) {
      const wCard = state.cards.find((c) => c.id === wid);
      if (wCard) {
        wCard.wildEncounters = (wCard.wildEncounters || 0) + 1;
        if (!won) {
          wCard.wildWins = (wCard.wildWins || 0) + 1;
        }
      }
    }
  }

  if (opponentPlayerId) {
    const opp = state.players.find((p) => p.id === opponentPlayerId);
    if (opp && opp.id !== player.id) {
      if (won) {
        opp.losses += 1;
        opp.eloRating = Math.max(800, opp.eloRating - 12);
      } else {
        opp.wins += 1;
        opp.eloRating += 18;
      }
    }
  }

  if (won) {
    player.wins += 1;
    player.eloRating += 24;
    player.lumenDust += 150;
    player.chromaticShards += 4;
    player.xp += 120;
  } else {
    player.losses += 1;
    player.eloRating = Math.max(800, player.eloRating - 12);
    player.lumenDust += 50;
    player.xp += 45;
  }

  if (player.xp >= player.level * 200) {
    player.level += 1;
  }

  saveMmoState(state);
  res.json({ ok: true, state });
});

app.use('/api', api);

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.use((_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CHROMARIFT Photo-Combat MMO server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;
