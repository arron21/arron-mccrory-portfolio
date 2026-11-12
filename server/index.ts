import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { UPLOADS_DIR } from './db.ts';
import { optimizeUploadedPhoto } from './optimizer.ts';
import {
  registerAuthRoutes,
  getSessionUser,
  createSession,
  type SessionUser,
} from './auth.ts';
import { analyzeAndForgeCard } from './cardForge.ts';
import {
  getMmoState,
  saveMmoState,
  resetMmoState,
  createNewMmoCardId,
  registerMmoAccount,
  loginMmoAccount,
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

function resolveRequestPlayer(req: Request, state: MmoState): MmoPlayer {
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

  const headerPlayerId =
    (req.headers['x-player-id'] as string | undefined) ||
    (req.body?.playerId as string | undefined);
  if (headerPlayerId) {
    const found = state.players.find((p) => p.id === headerPlayerId);
    if (found) return found;
  }

  return state.players.find((p) => p.id === 'player-arron21') || state.players[0];
}

// Get Full CHROMARIFT MMO State
api.get('/mmo/state', (req: Request, res: Response) => {
  const state = getMmoState();
  const sessionUser = getSessionUser(req);
  const activePlayer = resolveRequestPlayer(req, state);
  saveMmoState(state);
  res.json({
    ...state,
    sessionUser,
    activePlayerId: activePlayer.id,
    accounts: listRegisteredAccounts(),
  });
});

// Sync Client IndexedDB / LocalStorage State into Server DB (Prevents upload loss across serverless cold starts!)
api.post('/mmo/sync', (req: Request, res: Response) => {
  const incoming = (req.body?.state || req.body || {}) as Partial<MmoState>;
  const state = mergeClientStateIntoServer(incoming);
  const sessionUser = getSessionUser(req);
  const activePlayer = resolveRequestPlayer(req, state);
  saveMmoState(state);
  res.json({
    ok: true,
    state,
    sessionUser,
    activePlayerId: activePlayer.id,
    accounts: listRegisteredAccounts(),
  });
});

// Register a New MMO Player Account
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

// Log In to an Existing MMO Player Account
api.post('/mmo/auth/login', (req: Request, res: Response) => {
  const { username, password, quickLogin } = (req.body || {}) as {
    username?: string;
    password?: string;
    quickLogin?: boolean;
  };

  const result = loginMmoAccount(username || '', password, Boolean(quickLogin));
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
    state,
    accounts: listRegisteredAccounts(),
  });
});

// Reset MMO State (Clean Slate)
api.post('/mmo/reset', (_req: Request, res: Response) => {
  const state = resetMmoState();
  res.json({ ok: true, state });
});

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
      const player = resolveRequestPlayer(req, state);

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

      for (const file of files) {
        const cardId = createNewMmoCardId();
        const opt = await optimizeUploadedPhoto(cardId, file.buffer, file.originalname, {
          webpQuality: 82,
          avifQuality: 68,
          keepOriginals: false,
        });

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

        const hintText = `${file.originalname} ${customTitles[file.originalname] || ''} ${
          customCaptions[file.originalname] || ''
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

        const baseTitle = file.originalname
          .replace(/\.[^/.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());

        const cardTitle = (
          customTitles[file.originalname] ||
          baseTitle ||
          (isWild ? 'Wild Rift Anomaly' : 'Chromatic Relic')
        ).trim();

        const defaultCaption = isWild
          ? `Released into the Wild Rift! [${forged.category} Photography · ${forged.categoryBonusLabel}] (${forged.rarity} ${forged.element} ${forged.role})`
          : `Classified as ${forged.category} Photography (${forged.categoryBonusLabel}) · ${opt.width}×${opt.height} frame (${mergedExif.focalLength} · ${mergedExif.aperture}).`;

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

      saveMmoState(state);
      res.status(201).json({
        ok: true,
        destination,
        forgedCards,
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
  const player = resolveRequestPlayer(req, state);
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
  const player = resolveRequestPlayer(req, state);
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

  const player = resolveRequestPlayer(req, state);
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

  const player = resolveRequestPlayer(req, state);
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
  const player = resolveRequestPlayer(req, state);

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
  const player = resolveRequestPlayer(req, state);
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

// Record Auto-Battle Outcome against Wild Photo Cards
api.post('/mmo/battle/record', (req: Request, res: Response) => {
  const { won, wildCardIds } = (req.body || {}) as {
    won: boolean;
    wildCardIds?: string[];
  };

  const state = getMmoState();
  const player = resolveRequestPlayer(req, state);

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
