import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Swords,
  Sparkles,
  Trees,
  Trophy,
  UploadCloud,
  Zap,
  MessageSquare,
  Shield,
  ArrowUpCircle,
  Layers,
  CheckCircle2,
  Send,
  Camera,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Monitor,
  Plus,
  Compass,
  Crown,
  User,
  LogIn,
} from 'lucide-react';
import {
  formatBytes,
  VIBE_DEFINITIONS,
  type MmoState,
  type MmoCard,
  type MmoPlayer,
  type FactionId,
  type ElementType,
  type PhotoCategory,
  type VibeType,
  type SessionUser,
  type MmoUserAccount,
} from './types.ts';
import { CombatCardView } from './components/CombatCardView.tsx';
import { AutoBattleArenaModal } from './components/AutoBattleArenaModal.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import {
  evaluateSquadSynergies,
  simulateAutoBattle,
  type AutoBattleSimulation,
} from './utils/autoBattler.ts';
import { preparePhotoForUpload } from './utils/clientOptimizer.ts';
import {
  savePersistentMmoState,
  loadPersistentMmoState,
  getSavedActivePlayerId,
  setSavedActivePlayerId,
} from './utils/persistentStore.ts';

const REQUIRED_SQUAD_SIZE = 4;

const PHOTO_CATEGORIES: PhotoCategory[] = [
  'Portrait',
  'Architecture',
  'Nature',
  'Still Life',
  'Street & Action',
  'Macro & Wildlife',
  'Night & Astro',
  'Fine Art & Abstract',
];

export function App() {
  const [activeTab, setActiveTab] = useState<
    'feed' | 'forge' | 'sanctum' | 'world' | 'leaderboard'
  >('feed');

  // Mobile-first shell mode (true = 480px native mobile shell on desktop; false = expanded wide grid)
  const [mobileShellMode, setMobileShellMode] = useState(true);

  const [mmoState, setMmoState] = useState<MmoState | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string>(
    () => getSavedActivePlayerId() || 'player-arron21'
  );
  const [accounts, setAccounts] = useState<MmoUserAccount[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Mobile Squad Drawer expanded state at top of Feed
  const [squadDrawerOpen, setSquadDrawerOpen] = useState(false);

  // Expanded comments per post on mobile feed
  const [expandedCommentPostIds, setExpandedCommentPostIds] = useState<
    Record<string, boolean>
  >({});

  // Sanctum & Wilds element / photography category filters
  const [vaultFilter, setVaultFilter] = useState<
    'ALL' | 'EQUIPPED' | ElementType | PhotoCategory
  >('ALL');
  const [wildFilter, setWildFilter] = useState<'ALL' | ElementType | PhotoCategory>('ALL');

  // Active Auto-Battle simulation modal state
  const [activeSimulation, setActiveSimulation] = useState<AutoBattleSimulation | null>(
    null
  );
  const [battleRewardSummary, setBattleRewardSummary] = useState<string>('');

  // Social Feed comment inputs
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Soul-Lens Forge Upload state (Supports 1 or multiple photos + Deck vs Wild destination)
  const [forgeDestination, setForgeDestination] = useState<'deck' | 'wild'>('deck');
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [stagedPreviews, setStagedPreviews] = useState<string[]>([]);
  const [forgeTitle, setForgeTitle] = useState('');
  const [forgeCaption, setForgeCaption] = useState('');
  const [forgeEquipSlot, setForgeEquipSlot] = useState<string>('auto');
  const [forgeShareFeed, setForgeShareFeed] = useState(true);
  const [forging, setForging] = useState(false);
  const [forgeStatusText, setForgeStatusText] = useState('');
  const [lastForgedCards, setLastForgedCards] = useState<MmoCard[]>([]);
  const [lastForgedMode, setLastForgedMode] = useState<'deck' | 'wild'>('deck');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Sanctum Soul-Fusion selection state
  const [fuseTargetCardId, setFuseTargetCardId] = useState<string | null>(null);
  const [fuseSacrificeId, setFuseSacrificeId] = useState<string>('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4200);
  };

  const syncState = (nextState: MmoState) => {
    setMmoState(nextState);
    if (nextState.sessionUser !== undefined) {
      setSessionUser(nextState.sessionUser || null);
    }
    if (nextState.activePlayerId) {
      setActivePlayerId(nextState.activePlayerId);
      setSavedActivePlayerId(nextState.activePlayerId);
    }
    if (Array.isArray(nextState.accounts)) {
      setAccounts(nextState.accounts);
    }
    void savePersistentMmoState(nextState);
  };

  const fetchMmoState = async () => {
    try {
      try {
        localStorage.removeItem('chromarift_mmo_state_cache_v1');
      } catch {
        // Ignore
      }

      const savedPid = getSavedActivePlayerId() || 'player-arron21';
      const [localPersisted, res] = await Promise.all([
        loadPersistentMmoState(),
        fetch('/api/mmo/state', {
          headers: { 'x-player-id': savedPid },
        }),
      ]);

      if (res.ok) {
        const serverState = (await res.json()) as MmoState;

        // Check if local IndexedDB has uploaded cards, posts, or player squad data missing on the server
        if (localPersisted) {
          const serverCardIds = new Set((serverState.cards || []).map((c) => c.id));
          const hasMissingCards = (localPersisted.cards || []).some(
            (c) => !serverCardIds.has(c.id)
          );
          const serverPostIds = new Set((serverState.posts || []).map((p) => p.id));
          const hasMissingPosts = (localPersisted.posts || []).some(
            (p) => !serverPostIds.has(p.id)
          );
          const hasMissingSquad = (localPersisted.players || []).some((lp) => {
            const sp = (serverState.players || []).find((p) => p.id === lp.id);
            return (
              !sp ||
              (lp.squadCardIds?.length > 0 && (sp.squadCardIds?.length || 0) === 0) ||
              (lp.xp || 0) > (sp.xp || 0)
            );
          });

          if (hasMissingCards || hasMissingPosts || hasMissingSquad) {
            const syncRes = await fetch('/api/mmo/sync', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-player-id': savedPid,
              },
              body: JSON.stringify({ state: localPersisted }),
            });
            if (syncRes.ok) {
              const syncData = await syncRes.json();
              if (syncData.state) {
                syncState({
                  ...syncData.state,
                  sessionUser: syncData.sessionUser,
                  activePlayerId: syncData.activePlayerId,
                  accounts: syncData.accounts,
                });
                return;
              }
            }
          }
        }

        syncState(serverState);
      } else if (localPersisted) {
        syncState(localPersisted);
      }
    } catch {
      const fallback = await loadPersistentMmoState();
      if (fallback) syncState(fallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMmoState();
  }, []);

  const player: MmoPlayer | null = useMemo(() => {
    if (!mmoState) return null;
    return (
      mmoState.players.find((p) => p.id === activePlayerId) ||
      (sessionUser
        ? mmoState.players.find(
            (p) => p.username.toLowerCase() === sessionUser.username.toLowerCase()
          )
        : undefined) ||
      mmoState.players.find((p) => p.id === 'player-arron21') ||
      mmoState.players[0] ||
      null
    );
  }, [mmoState, activePlayerId, sessionUser]);

  // Cards owned by the player in their personal Deck/Sanctum (excludes Wild cards)
  const playerCards: MmoCard[] = useMemo(() => {
    if (!mmoState || !player) return [];
    return mmoState.cards.filter((c) => !c.isWild && c.ownerId === player.id);
  }, [mmoState, player]);

  // Cards released into the Wild Rift (not in player's deck, fightable anytime)
  const wildCards: MmoCard[] = useMemo(() => {
    if (!mmoState) return [];
    return mmoState.cards.filter((c) => Boolean(c.isWild));
  }, [mmoState]);

  // Player's active 4-card squad (must be built from uploaded Deck cards)
  const playerSquad: MmoCard[] = useMemo(() => {
    if (!mmoState || !player) return [];
    const squad = player.squadCardIds
      .map((id) => playerCards.find((c) => c.id === id))
      .filter((c): c is MmoCard => Boolean(c));
    return squad.slice(0, REQUIRED_SQUAD_SIZE);
  }, [mmoState, player, playerCards]);

  const isSquadReady = playerSquad.length >= REQUIRED_SQUAD_SIZE;
  const missingSquadCount = Math.max(0, REQUIRED_SQUAD_SIZE - playerSquad.length);

  const playerSynergies = useMemo(
    () => (playerSquad.length > 0 ? evaluateSquadSynergies(playerSquad) : []),
    [playerSquad]
  );

  const totalSquadPower = useMemo(
    () => playerSquad.reduce((sum, c) => sum + c.powerRating, 0),
    [playerSquad]
  );

  const filteredVaultCards = useMemo(() => {
    if (!player) return playerCards;
    if (vaultFilter === 'ALL') return playerCards;
    if (vaultFilter === 'EQUIPPED') {
      return playerCards.filter((c) => player.squadCardIds.includes(c.id));
    }
    return playerCards.filter(
      (c) => c.element === vaultFilter || c.category === vaultFilter
    );
  }, [playerCards, player, vaultFilter]);

  const filteredWildCards = useMemo(() => {
    if (wildFilter === 'ALL') return wildCards;
    return wildCards.filter(
      (c) => c.element === wildFilter || c.category === wildFilter
    );
  }, [wildCards, wildFilter]);

  const openForgeWithMode = (mode: 'deck' | 'wild') => {
    setForgeDestination(mode);
    setActiveTab('forge');
  };

  // Fight a specific Wild Photo Card (or a Wild Pack led by it, or Apex Raid Boss version)
  const handleFightWildCard = async (
    targetWild: MmoCard,
    battleStyle: 'solo' | 'pack' | 'apex' = 'pack'
  ) => {
    if (!isSquadReady) {
      showToast(
        `Squad incomplete (${playerSquad.length}/${REQUIRED_SQUAD_SIZE})! Upload ${missingSquadCount} more photo(s) to your Deck to unlock combat.`
      );
      openForgeWithMode('deck');
      return;
    }

    let enemyUnits: MmoCard[] = [targetWild];
    let opponentTitle = `${targetWild.rarity} ${targetWild.element} ${targetWild.role}`;
    let isBoss = false;

    if (battleStyle === 'pack') {
      const otherWilds = wildCards.filter((c) => c.id !== targetWild.id).slice(0, 3);
      enemyUnits = [targetWild, ...otherWilds];
      opponentTitle =
        enemyUnits.length > 1
          ? `Wild Pack (${enemyUnits.length} Wild Photos)`
          : `Wild Specimen · ⚔ ${targetWild.powerRating}`;
    } else if (battleStyle === 'apex') {
      isBoss = true;
      const apexBossCard: MmoCard = {
        ...targetWild,
        title: `APEX ${targetWild.title.toUpperCase()}`,
        epithet: `Apex Wild Titan · ${targetWild.element}`,
        hp: Math.round(targetWild.hp * 4.2),
        atk: Math.round(targetWild.atk * 1.25),
        def: Math.round(targetWild.def * 1.15),
        powerRating: Math.round(targetWild.powerRating * 3.2),
      };
      enemyUnits = [apexBossCard];
      opponentTitle = 'Apex Wild Rift Boss';
    }

    const sim = simulateAutoBattle(
      playerSquad,
      enemyUnits,
      targetWild.title,
      opponentTitle,
      isBoss
    );

    setActiveSimulation(sim);
    setBattleRewardSummary(
      sim.won
        ? `Victory over Wild ${targetWild.title}! +150 Lumen Dust · +4 Chromatic Shards · +24 ELO`
        : `Defeated by Wild ${targetWild.title} · +50 Lumen Dust · Upgrade your squad in the Sanctum!`
    );

    const res = await fetch('/api/mmo/battle/record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-player-id': player?.id || activePlayerId,
      },
      body: JSON.stringify({
        won: sim.won,
        wildCardIds: enemyUnits.map((u) => u.id),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
    }
  };

  // Fight a random 4-card pack of Wild Photos
  const handleFightRandomWildPack = async () => {
    if (!isSquadReady) {
      showToast(
        `Squad incomplete (${playerSquad.length}/${REQUIRED_SQUAD_SIZE})! Upload ${missingSquadCount} more photo(s) to your Deck first.`
      );
      openForgeWithMode('deck');
      return;
    }
    if (wildCards.length === 0) {
      showToast(
        'No Wild Photos are roaming yet! Upload a photo with "Send to the Wild" to spawn wild opponents.'
      );
      openForgeWithMode('wild');
      return;
    }

    const shuffled = [...wildCards].sort(() => Math.random() - 0.5).slice(0, 4);
    const lead = shuffled[0];
    await handleFightWildCard(lead, shuffled.length > 1 ? 'pack' : 'solo');
  };

  // Social Feed Hype Boost
  const handleHypePost = async (postId: string) => {
    const res = await fetch(`/api/mmo/posts/${postId}/hype`, {
      method: 'POST',
      headers: { 'x-player-id': player?.id || activePlayerId },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
      showToast('⚡ Hype Resonance! Card HP & ATK permanently buffed (+15 Lumen).');
    }
  };

  // Judge a Photo Card with a Vibe Reaction (Cool, Cute, Scary, Funny, Chill, Epic)
  const handleJudgePhotoVibe = async (cardId: string, vibe: VibeType) => {
    try {
      const res = await fetch(`/api/mmo/cards/${cardId}/judge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-player-id': player?.id || activePlayerId,
        },
        body: JSON.stringify({ vibe }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          syncState(data.state);
        }
        if (data.card) {
          setLastForgedCards((prev) =>
            prev.map((c) => (c.id === cardId ? data.card : c))
          );
        }
        if (data.statDeltaLabel) {
          showToast(`${data.statDeltaLabel} (+10 Lumen Dust)`);
        }
      }
    } catch {
      showToast('Could not save photo vibe judgment.');
    }
  };

  // Social Feed Comment
  const handleAddComment = async (e: React.FormEvent, postId: string) => {
    e.preventDefault();
    const text = commentInputs[postId] || '';
    if (!text.trim()) return;

    const res = await fetch(`/api/mmo/posts/${postId}/comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-player-id': player?.id || activePlayerId,
      },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    }
  };

  // Select 1 or multiple files for Soul-Lens Card Forging
  const handleSelectForgeFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).slice(0, 10);
    if (incoming.length === 0) return;

    stagedPreviews.forEach((url) => URL.revokeObjectURL(url));
    setStagedFiles(incoming);
    setStagedPreviews(incoming.map((f) => URL.createObjectURL(f)));

    if (incoming.length === 1) {
      const cleanTitle = incoming[0].name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setForgeTitle(cleanTitle || 'Chromatic Relic');
    } else {
      setForgeTitle('');
    }
  };

  // Submit Photo(s) to Soul-Lens Forge (Either to My Deck OR Sent to the Wild)
  const handleForgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stagedFiles.length === 0) return;

    setForging(true);
    setLastForgedCards([]);
    setLastForgedMode(forgeDestination);

    const allCreatedCards: MmoCard[] = [];
    let latestState: MmoState | null = null;

    try {
      for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        setForgeStatusText(
          `[${i + 1}/${stagedFiles.length}] Extracting EXIF & optimizing ${file.name} (<2.8 MB)...`
        );

        const prepared = await preparePhotoForUpload(file);
        const fname = prepared.uploadFile.name;

        setForgeStatusText(
          `[${i + 1}/${stagedFiles.length}] Analyzing RGB spectrum & forging ${
            forgeDestination === 'wild' ? 'Wild Specimen' : 'Deck Card'
          }...`
        );

        const formData = new FormData();
        formData.append('photos', prepared.uploadFile);
        formData.append('destination', forgeDestination);
        formData.append('shareToFeed', String(forgeShareFeed));
        formData.append('playerId', player?.id || activePlayerId);
        if (
          forgeDestination === 'deck' &&
          forgeEquipSlot !== 'auto' &&
          forgeEquipSlot !== ''
        ) {
          formData.append('equipSlot', forgeEquipSlot);
        }

        const singleTitle =
          stagedFiles.length === 1 && forgeTitle.trim()
            ? forgeTitle.trim()
            : file.name
                .replace(/\.[^/.]+$/, '')
                .replace(/[-_]+/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());

        formData.append('titles', JSON.stringify({ [fname]: singleTitle }));
        if (forgeCaption.trim()) {
          formData.append('captions', JSON.stringify({ [fname]: forgeCaption.trim() }));
        }
        formData.append(
          'clientOriginalSizes',
          JSON.stringify({ [fname]: prepared.originalSizeBytes })
        );
        formData.append('clientExif', JSON.stringify({ [fname]: prepared.exif }));

        const res = await fetch('/api/mmo/forge', {
          method: 'POST',
          headers: { 'x-player-id': player?.id || activePlayerId },
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          showToast(data.error || `Failed to forge ${file.name}.`);
        } else {
          if (Array.isArray(data.forgedCards)) {
            allCreatedCards.push(...data.forgedCards);
          }
          if (data.state) {
            latestState = data.state;
          }
        }
      }

      if (latestState) {
        syncState(latestState);
      }

      if (allCreatedCards.length > 0) {
        setLastForgedCards(allCreatedCards);
        stagedPreviews.forEach((url) => URL.revokeObjectURL(url));
        setStagedFiles([]);
        setStagedPreviews([]);
        setForgeCaption('');

        const first = allCreatedCards[0];
        if (forgeDestination === 'wild') {
          showToast(
            allCreatedCards.length === 1
              ? `🐾 [${first.category}] ${first.title} (${first.categoryBonusLabel}) sent to the Wild Rift!`
              : `🐾 Classified & released ${allCreatedCards.length} Photo-Cards into the Wild Rift!`
          );
        } else {
          showToast(
            allCreatedCards.length === 1
              ? `🛡️ [${first.category}] ${first.title} (${first.categoryBonusLabel}) bound to your Deck!`
              : `🛡️ Classified & bound ${allCreatedCards.length} Photo-Cards to your Deck & Squad!`
          );
        }
      }
    } catch {
      showToast('Network error during Soul-Lens Forging.');
    } finally {
      setForging(false);
      setForgeStatusText('');
    }
  };

  // Assign card to Squad Slot 1–4
  const handleAssignToSlot = async (cardId: string, slotIdx: number) => {
    if (!player) return;
    const nextSquad = [...player.squadCardIds];
    const existingIdx = nextSquad.indexOf(cardId);
    if (existingIdx !== -1 && nextSquad[slotIdx]) {
      nextSquad[existingIdx] = nextSquad[slotIdx];
    }
    nextSquad[slotIdx] = cardId;

    const res = await fetch('/api/mmo/player/squad', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-player-id': player.id,
      },
      body: JSON.stringify({ squadCardIds: nextSquad.filter(Boolean) }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
      showToast(`Equipped to Formation Slot ${slotIdx + 1}.`);
    }
  };

  // Release an existing Deck card to the Wild Rift
  const handleReleaseCardToWild = async (card: MmoCard) => {
    const res = await fetch(`/api/mmo/cards/${card.id}/release-wild`, {
      method: 'POST',
      headers: { 'x-player-id': player?.id || activePlayerId },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
      showToast(
        `🐾 Released ${card.title} into the Wild Rift (+60 Lumen, +2 Shards)! You can now fight it in The Wilds.`
      );
    }
  };

  // Upgrade / Foil-Ascend / Fuse Card
  const handleUpgradeCard = async (
    cardId: string,
    action: 'levelup' | 'ascend' | 'fuse',
    sacrificeCardId?: string
  ) => {
    const res = await fetch(`/api/mmo/cards/${cardId}/upgrade`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-player-id': player?.id || activePlayerId,
      },
      body: JSON.stringify({ action, sacrificeCardId }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Upgrade failed.');
    } else {
      if (data.state) syncState(data.state);
      setFuseTargetCardId(null);
      setFuseSacrificeId('');
      showToast(
        action === 'levelup'
          ? `✦ Level Up! ${data.card.title} reached Lv.${data.card.level} (⚔ ${data.card.powerRating}).`
          : action === 'ascend'
          ? `✦ Foil Ascension! ${data.card.title} ascended to ${data.card.foil}!`
          : `✦ Soul Fusion! Imprinted trait onto ${data.card.title}!`
      );
    }
  };

  const handleSwitchFaction = async (faction: FactionId) => {
    const res = await fetch('/api/mmo/player/squad', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-player-id': player?.id || activePlayerId,
      },
      body: JSON.stringify({ faction }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
      showToast(`Pledged allegiance to Order of ${faction}!`);
    }
  };

  if (loading || !mmoState || !player) {
    return (
      <div className="app-shell mobile-shell-frame">
        <div className="mmo-container">
          <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            Initializing CHROMARIFT Mobile Photo-Combat MMO...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app-shell ${
        mobileShellMode ? 'mobile-shell-frame' : 'wide-shell-frame'
      }`}
    >
      {/* Mobile-Friendly Floating Toast Notification above Bottom Nav */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom) + 0.75rem)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 1.5rem)',
            maxWidth: '440px',
            zIndex: 1100,
            background: 'var(--bg-surface)',
            border: '1px solid var(--gold-bright)',
            color: 'var(--text-primary)',
            padding: '0.7rem 0.95rem',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            fontSize: '0.78rem',
          }}
        >
          <CheckCircle2 size={16} style={{ color: 'var(--gold-bright)', flexShrink: 0 }} />
          <span>{toast}</span>
        </div>
      )}

      {/* STICKY TOP MOBILE STATUS HUD */}
      <header className="mmo-hud-header">
        <div className="hud-inner">
          <div
            className="brand-crest"
            onClick={() => setActiveTab('feed')}
            id="chromarift-home-brand"
          >
            <div className="brand-emblem">
              <Swords size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="brand-title">CHROMARIFT</div>
              <div className="brand-subtitle">
                @{player.username} · Squad {playerSquad.length}/{REQUIRED_SQUAD_SIZE}
              </div>
            </div>
          </div>

          {/* Inline nav only shown when user toggles Wide Desktop Mode on large screens */}
          <nav className="hud-nav-desktop" aria-label="Desktop Navigation">
            <button
              type="button"
              className={`hud-tab ${activeTab === 'feed' ? 'active' : ''}`}
              onClick={() => setActiveTab('feed')}
            >
              <Zap size={14} /> Stream
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'sanctum' ? 'active' : ''}`}
              onClick={() => setActiveTab('sanctum')}
            >
              <Shield size={14} /> My Deck ({playerCards.length})
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'forge' ? 'active' : ''}`}
              onClick={() => setActiveTab('forge')}
            >
              <Camera size={14} /> Forge Photos
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'world' ? 'active' : ''}`}
              onClick={() => setActiveTab('world')}
            >
              <Trees size={14} /> The Wilds ({wildCards.length})
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('leaderboard')}
            >
              <Trophy size={14} /> Codex
            </button>
          </nav>

          {/* Compact Mobile Resource Chips + Login/Account Button + Shell Toggle */}
          <div className="hud-resources">
            <div className="resource-pill" title="Lumen Dust (Level Up Cards)">
              <Sparkles size={11} style={{ color: 'var(--gold-bright)' }} />
              <strong>{player.lumenDust}</strong>
            </div>
            <div className="resource-pill" title="Arena ELO Rating">
              <Trophy size={11} style={{ color: 'var(--gold-primary)' }} />
              <strong>{player.eloRating}</strong>
            </div>

            <button
              type="button"
              className="viewport-mode-btn"
              onClick={() => setAuthModalOpen(true)}
              title="Log In, Create Account, or Switch Commander Profile"
              id="hud-auth-account-btn"
              style={{
                borderColor: sessionUser ? '#4ade80' : 'var(--gold-bright)',
                color: sessionUser ? '#4ade80' : 'var(--gold-bright)',
                fontWeight: 700,
              }}
            >
              {sessionUser ? <User size={12} /> : <LogIn size={12} />}
              <span>{sessionUser ? `@${player.username}` : 'Log In'}</span>
            </button>

            <button
              type="button"
              className="viewport-mode-btn"
              onClick={() => setMobileShellMode((prev) => !prev)}
              title="Switch between Mobile Phone Viewport and Wide Responsive Layout"
              id="viewport-shell-toggle-btn"
            >
              {mobileShellMode ? <Monitor size={12} /> : <Smartphone size={12} />}
              <span>{mobileShellMode ? 'Wide' : 'Mobile'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mmo-container">
        {/* =========================================================
            TAB 1: THE CHROMASTREAM (FEED + SQUAD PROGRESS + WILD HUNTS)
           ========================================================= */}
        {activeTab === 'feed' && (
          <div className="feed-layout">
            <div className="feed-stream">
              {/* 1. Horizontal Quick-Action & Wild Specimen Ribbon */}
              <div className="story-bounty-ribbon" aria-label="Forge and Wild Encounters">
                {/* Node 1: Upload Photo to My Deck */}
                <button
                  type="button"
                  className="story-node"
                  onClick={() => openForgeWithMode('deck')}
                  id="hero-forge-photo-cta"
                >
                  <div className="story-avatar-ring">
                    <div className="story-avatar-inner">
                      <Shield size={20} style={{ color: 'var(--gold-bright)' }} />
                    </div>
                    <span
                      className="story-tag-pill"
                      style={{ background: 'var(--gold-primary)', color: '#08090d' }}
                    >
                      +DECK
                    </span>
                  </div>
                  <span className="story-node-name">
                    Build Squad ({playerSquad.length}/4)
                  </span>
                </button>

                {/* Node 2: Upload Photo to the Wild (Stat Discovery!) */}
                <button
                  type="button"
                  className="story-node"
                  onClick={() => openForgeWithMode('wild')}
                  id="hero-forge-wild-cta"
                >
                  <div className="story-avatar-ring raid">
                    <div className="story-avatar-inner">
                      <Trees size={20} style={{ color: '#4ade80' }} />
                    </div>
                    <span
                      className="story-tag-pill"
                      style={{ background: '#16a34a', color: '#fff' }}
                    >
                      +WILD
                    </span>
                  </div>
                  <span className="story-node-name">Send to Wild</span>
                </button>

                {/* Node 3: Hunt Random Wild Pack */}
                <button
                  type="button"
                  className="story-node"
                  onClick={handleFightRandomWildPack}
                  id="hero-quick-battle-cta"
                >
                  <div className="story-avatar-ring">
                    <div className="story-avatar-inner">
                      <Swords size={20} style={{ color: '#f87171' }} />
                    </div>
                    <span className="story-tag-pill">HUNT</span>
                  </div>
                  <span className="story-node-name">Fight Wilds</span>
                </button>

                {/* Dynamic Nodes for Every Photo Released into the Wild */}
                {wildCards.map((wCard) => (
                  <button
                    key={wCard.id}
                    type="button"
                    className="story-node"
                    onClick={() => handleFightWildCard(wCard, 'pack')}
                    title={`Fight Wild ${wCard.title} (⚔ ${wCard.powerRating})`}
                  >
                    <div className="story-avatar-ring raid">
                      <div className="story-avatar-inner">
                        <img src={wCard.imageUrl} alt={wCard.title} />
                      </div>
                      <span className="story-tag-pill">⚔{wCard.powerRating}</span>
                    </div>
                    <span className="story-node-name">{wCard.title}</span>
                  </button>
                ))}
              </div>

              {/* 2. Squad Readiness & Active Formation Bar */}
              <section className="mobile-squad-bar" aria-label="Your Active Auto-Battle Squad">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.6rem',
                        color: isSquadReady ? '#4ade80' : 'var(--gold-bright)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {isSquadReady
                        ? `✓ 4/4 Squad Ready · ${playerSynergies.length} Synergies`
                        : `⚠ Squad Incomplete (${playerSquad.length}/4) · Upload ${missingSquadCount} More to Deck`}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.96rem',
                        fontWeight: 700,
                      }}
                    >
                      Your 4-Card Combat Formation
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="card-power-badge">⚔ {totalSquadPower}</span>
                    <button
                      type="button"
                      className="btn btn-surface"
                      style={{ minHeight: '34px', padding: '0.3rem 0.55rem', fontSize: '0.7rem' }}
                      onClick={() => setSquadDrawerOpen((prev) => !prev)}
                    >
                      {squadDrawerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* 4 Formation Slots (Filled or Interactive Empty Upload Prompts) */}
                <div className="mini-squad-slots">
                  {[0, 1, 2, 3].map((slotIdx) => {
                    const c = playerSquad[slotIdx];
                    if (c) {
                      return (
                        <div
                          key={c.id}
                          className="mini-slot"
                          onClick={() => setActiveTab('sanctum')}
                          title={`Slot ${slotIdx + 1}: ${c.title}`}
                        >
                          <img src={c.imageUrl} alt={c.title} />
                          <div className="mini-slot-label">
                            S{slotIdx + 1} · {c.element}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={`empty-slot-${slotIdx}`}
                        type="button"
                        className="mini-slot"
                        onClick={() => openForgeWithMode('deck')}
                        style={{
                          borderStyle: 'dashed',
                          borderColor: 'var(--border-gold)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.2rem',
                          padding: '0.3rem',
                          color: 'var(--gold-bright)',
                        }}
                      >
                        <Plus size={16} />
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.54rem',
                            textTransform: 'uppercase',
                          }}
                        >
                          Slot {slotIdx + 1}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Expandable Synergies & Faction Drawer */}
                {squadDrawerOpen && (
                  <div
                    style={{
                      marginTop: '0.7rem',
                      paddingTop: '0.65rem',
                      borderTop: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {(['Helios', 'Umbra', 'Prism'] as FactionId[]).map((fac) => (
                        <button
                          key={fac}
                          type="button"
                          onClick={() => handleSwitchFaction(fac)}
                          className={`faction-tag faction-${fac}`}
                          style={{
                            flex: 1,
                            textAlign: 'center',
                            padding: '0.35rem',
                            opacity: player.faction === fac ? 1 : 0.45,
                            fontWeight: player.faction === fac ? 700 : 400,
                          }}
                        >
                          {fac}
                        </button>
                      ))}
                    </div>

                    {playerSynergies.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {playerSynergies.map((syn) => (
                          <div
                            key={syn.id}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.4rem 0.6rem',
                              fontSize: '0.72rem',
                            }}
                          >
                            <strong style={{ color: 'var(--gold-bright)' }}>
                              ✦ {syn.name}:
                            </strong>{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>
                              {syn.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Upload photos to your Deck to activate elemental & role synergies.
                      </p>
                    )}

                    <div
                      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}
                    >
                      <button
                        type="button"
                        className="btn btn-gold"
                        onClick={() => openForgeWithMode('deck')}
                      >
                        <Camera size={14} /> Upload to Deck
                      </button>
                      <button
                        type="button"
                        className="btn btn-surface"
                        onClick={() => openForgeWithMode('wild')}
                      >
                        <Trees size={14} /> Send to Wild
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* 3. Empty Feed Onboarding OR Uploaded Photo Stream */}
              {mmoState.posts.length === 0 ? (
                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-gold)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.35rem 1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.9rem',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      margin: '0 auto',
                      background: 'var(--gold-subtle)',
                      border: '1px solid var(--border-gold)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--gold-bright)',
                    }}
                  >
                    <Camera size={22} />
                  </div>

                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.64rem',
                        color: 'var(--gold-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Zero Demo Content · Pure Player-Forged World
                    </div>
                    <h2
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.3rem',
                        marginTop: '0.2rem',
                      }}
                    >
                      Forge Your 4-Card Squad & Populate The Wilds
                    </h2>
                    <p
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.82rem',
                        marginTop: '0.35rem',
                      }}
                    >
                      Every card and opponent in CHROMARIFT comes from real photographs you upload:
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                      textAlign: 'left',
                      background: 'var(--bg-surface)',
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--gold-bright)' }}>
                        1. Build Your 4-Card Squad ({playerSquad.length}/4):
                      </strong>{' '}
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Upload at least 4 photos with <strong>Save to My Deck</strong> to assemble
                        your combat formation.
                      </span>
                    </div>
                    <div>
                      <strong style={{ color: '#4ade80' }}>
                        2. Send Unlimited Photos to the Wild ({wildCards.length} active):
                      </strong>{' '}
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Curious what stats a photo will get without saving it to your deck? Upload
                        photos with <strong>Send to the Wild</strong> to inspect their forged stats
                        and fight against them later in <strong>The Wilds</strong>!
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
                    <button
                      type="button"
                      className="btn btn-gold"
                      onClick={() => openForgeWithMode('deck')}
                    >
                      <Shield size={15} /> Upload to My Deck
                    </button>
                    <button
                      type="button"
                      className="btn btn-crimson"
                      onClick={() => openForgeWithMode('wild')}
                    >
                      <Trees size={15} /> Send Photo to Wild
                    </button>
                  </div>
                </div>
              ) : (
                mmoState.posts.map((post) => {
                  const card = mmoState.cards.find((c) => c.id === post.cardId);
                  if (!card) return null;

                  const commentsOpen = Boolean(expandedCommentPostIds[post.id]);
                  const visibleComments = commentsOpen
                    ? post.comments
                    : post.comments.slice(-1);

                  return (
                    <article key={post.id} className="feed-post-card">
                      {/* Post Author Top Row */}
                      <div className="post-author-row">
                        <div className="author-badge">
                          <div className="author-avatar">
                            {post.authorName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: '0.88rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {post.authorName}
                            </div>
                            <div
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.64rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              @{post.authorHandle} · {post.createdAt}
                            </div>
                          </div>
                        </div>

                        <span
                          className="card-pill"
                          style={{
                            borderColor: card.isWild
                              ? 'rgba(248,113,113,0.45)'
                              : 'var(--border-gold)',
                            color: card.isWild ? '#f87171' : 'var(--gold-bright)',
                          }}
                        >
                          {card.isWild ? '🐾 Wild Specimen' : '🛡️ Deck Card'}
                        </span>
                      </div>

                      <p style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                        {post.caption}
                      </p>

                      {/* Collectible Combat Card */}
                      <CombatCardView
                        card={card}
                        compact={false}
                        onJudgeVibe={handleJudgePhotoVibe}
                      />

                      {/* Thumb-Friendly 3-Button Social + Combat Bar */}
                      <div className="post-actions-bar">
                        <button
                          type="button"
                          className="btn btn-surface"
                          onClick={() => handleHypePost(post.id)}
                          id={`hype-post-${post.id}`}
                          style={{ padding: '0.5rem 0.65rem', fontSize: '0.76rem' }}
                        >
                          <Zap size={14} style={{ color: 'var(--gold-bright)' }} />
                          <span>Hype ({post.hypeCount})</span>
                        </button>

                        {card.isWild ? (
                          <button
                            type="button"
                            className="btn btn-crimson"
                            onClick={() => handleFightWildCard(card, 'pack')}
                            id={`challenge-post-${post.id}`}
                            style={{ padding: '0.5rem 0.65rem', fontSize: '0.76rem' }}
                          >
                            <Swords size={14} />
                            <span>Fight Wild Card</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-surface"
                            onClick={() => handleReleaseCardToWild(card)}
                            style={{ padding: '0.5rem 0.65rem', fontSize: '0.74rem' }}
                          >
                            <Trees size={14} style={{ color: '#4ade80' }} />
                            <span>Send to Wild</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn btn-surface"
                          onClick={() =>
                            setExpandedCommentPostIds((prev) => ({
                              ...prev,
                              [post.id]: !prev[post.id],
                            }))
                          }
                          style={{ padding: '0.5rem 0.65rem', fontSize: '0.75rem' }}
                          aria-label="Toggle Comments"
                        >
                          <MessageSquare size={14} />
                          <span>{post.comments.length}</span>
                        </button>
                      </div>

                      {/* Compact War-Comms / Comments Box */}
                      <div className="comments-box">
                        {post.comments.length > 1 && !commentsOpen && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCommentPostIds((prev) => ({
                                ...prev,
                                [post.id]: true,
                              }))
                            }
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.64rem',
                              color: 'var(--text-muted)',
                              textAlign: 'left',
                            }}
                          >
                            View all {post.comments.length} comments...
                          </button>
                        )}

                        {visibleComments.map((c) => (
                          <div key={c.id} style={{ fontSize: '0.76rem' }}>
                            <strong style={{ color: 'var(--gold-bright)' }}>
                              @{c.authorHandle}:
                            </strong>{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>{c.text}</span>
                          </div>
                        ))}

                        <form
                          onSubmit={(e) => handleAddComment(e, post.id)}
                          style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}
                        >
                          <input
                            type="text"
                            className="form-input"
                            style={{ padding: '0.42rem 0.65rem', fontSize: '16px' }}
                            placeholder="Add comment..."
                            value={commentInputs[post.id] || ''}
                            onChange={(e) =>
                              setCommentInputs((prev) => ({
                                ...prev,
                                [post.id]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="submit"
                            className="btn btn-surface"
                            style={{ minHeight: '38px', padding: '0.4rem 0.7rem' }}
                          >
                            <Send size={13} />
                          </button>
                        </form>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 2: SOUL-LENS FORGE (BUILD DECK OR SEND TO THE WILD)
           ========================================================= */}
        {activeTab === 'forge' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  color: 'var(--gold-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Optical EXIF & RGB Spectrum Stat Lab
              </span>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                Soul-Lens Photo Forge
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                Upload any number of photos to see what stats, element, role, and ability their
                colors and EXIF telemetry generate. Save them to your <strong>Deck</strong> to
                build your 4-card squad, or send them to <strong>The Wild</strong> to fight later!
              </p>
            </div>

            {/* Forge Destination Selector: Save to My Deck vs Send to the Wild */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.55rem',
              }}
            >
              <button
                type="button"
                onClick={() => setForgeDestination('deck')}
                id="forge-mode-deck-btn"
                style={{
                  background:
                    forgeDestination === 'deck'
                      ? 'linear-gradient(135deg, hsla(38, 68%, 54%, 0.24), hsla(38, 68%, 40%, 0.12))'
                      : 'var(--bg-elevated)',
                  border: `1.5px solid ${
                    forgeDestination === 'deck' ? 'var(--gold-bright)' : 'var(--border-subtle)'
                  }`,
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    color:
                      forgeDestination === 'deck'
                        ? 'var(--gold-bright)'
                        : 'var(--text-primary)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Shield size={15} /> Save to My Deck
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.62rem',
                    }}
                  >
                    {playerSquad.length}/4 Squad
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Keeps card in your Sanctum & fills empty Squad slots.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setForgeDestination('wild')}
                id="forge-mode-wild-btn"
                style={{
                  background:
                    forgeDestination === 'wild'
                      ? 'linear-gradient(135deg, hsla(146, 68%, 45%, 0.22), hsla(354, 70%, 50%, 0.14))'
                      : 'var(--bg-elevated)',
                  border: `1.5px solid ${
                    forgeDestination === 'wild' ? '#4ade80' : 'var(--border-subtle)'
                  }`,
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    color: forgeDestination === 'wild' ? '#4ade80' : 'var(--text-primary)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Trees size={15} /> Send to the Wild
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.62rem',
                    }}
                  >
                    {wildCards.length} Wild
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  Not saved to deck — reveals photo stats & roams the Wilds to fight later!
                </span>
              </button>
            </div>

            {/* Dual Mobile Camera + Multi-Photo Gallery Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) {
                  handleSelectForgeFiles(e.dataTransfer.files);
                }
              }}
              style={{
                border: `1.5px dashed ${
                  forgeDestination === 'wild' ? '#4ade80' : 'var(--border-gold)'
                }`,
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.35rem 1rem',
                textAlign: 'center',
                cursor: 'pointer',
              }}
              id="soul-lens-dropzone"
            >
              {/* Multi-Photo Gallery Input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/avif,image/tiff"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleSelectForgeFiles(e.target.files);
                  }
                  e.target.value = '';
                }}
                id="forge-photo-input"
              />
              {/* Direct Mobile Camera Capture Input */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleSelectForgeFiles(e.target.files);
                  }
                  e.target.value = '';
                }}
              />

              <UploadCloud
                size={30}
                style={{
                  color: forgeDestination === 'wild' ? '#4ade80' : 'var(--gold-bright)',
                  marginBottom: '0.35rem',
                }}
              />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.08rem' }}>
                {forgeDestination === 'wild'
                  ? 'Select Photo(s) to Analyze Stats & Release to the Wild'
                  : `Select Photo(s) to Forge into Your Deck (${playerSquad.length}/4 Squad)`}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.2rem',
                  marginBottom: '0.85rem',
                }}
              >
                Supports 1 or multiple photos at once · Auto WebP/AVIF Optimization
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.5rem',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera size={15} /> Snap Camera
                </button>
                <button
                  type="button"
                  className="btn btn-surface"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud size={15} /> Choose Photo(s)
                </button>
              </div>
            </div>

            {/* Staged Photo(s) Configuration Form */}
            {stagedFiles.length > 0 && (
              <form
                onSubmit={handleForgeSubmit}
                style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${
                    forgeDestination === 'wild' ? '#4ade80' : 'var(--border-gold)'
                  }`,
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.66rem',
                    color: forgeDestination === 'wild' ? '#4ade80' : 'var(--gold-bright)',
                    textTransform: 'uppercase',
                  }}
                >
                  {stagedFiles.length} Photo{stagedFiles.length > 1 ? 's' : ''} Staged →{' '}
                  {forgeDestination === 'wild'
                    ? '🐾 Release to the Wild (Not Saved to Deck)'
                    : '🛡️ Bind to My Deck & Squad'}
                </div>

                {/* Preview Strip */}
                <div className="h-scroll-strip">
                  {stagedPreviews.map((src, idx) => (
                    <div
                      key={src}
                      style={{
                        position: 'relative',
                        flex: '0 0 auto',
                        width: stagedPreviews.length === 1 ? '100%' : '135px',
                      }}
                    >
                      <img
                        src={src}
                        alt={`Staged ${idx + 1}`}
                        style={{
                          width: '100%',
                          aspectRatio: '4 / 3',
                          objectFit: 'cover',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      />
                      <span
                        className="card-pill"
                        style={{
                          position: 'absolute',
                          bottom: '0.35rem',
                          right: '0.35rem',
                          fontSize: '0.56rem',
                        }}
                      >
                        {formatBytes(stagedFiles[idx]?.size || 0)}
                      </span>
                    </div>
                  ))}
                </div>

                {stagedFiles.length === 1 && (
                  <div>
                    <label
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        display: 'block',
                        marginBottom: '0.25rem',
                      }}
                    >
                      Card Name
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={forgeTitle}
                      onChange={(e) => setForgeTitle(e.target.value)}
                      required
                      id="forge-card-title-input"
                    />
                  </div>
                )}

                <div>
                  <label
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                      display: 'block',
                      marginBottom: '0.25rem',
                    }}
                  >
                    Caption / Field Note (Optional)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={
                      forgeDestination === 'wild'
                        ? 'Notes on this wild photo specimen...'
                        : 'Describe your shot or squad role...'
                    }
                    value={forgeCaption}
                    onChange={(e) => setForgeCaption(e.target.value)}
                  />
                </div>

                {/* Squad Slot Picker (Only when saving to Deck) */}
                {forgeDestination === 'deck' && (
                  <div>
                    <label
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        display: 'block',
                        marginBottom: '0.3rem',
                      }}
                    >
                      Squad Formation Assignment
                    </label>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5, 1fr)',
                        gap: '0.35rem',
                      }}
                    >
                      {[
                        { val: 'auto', label: 'Auto-Fill' },
                        { val: '0', label: 'Slot 1' },
                        { val: '1', label: 'Slot 2' },
                        { val: '2', label: 'Slot 3' },
                        { val: '3', label: 'Slot 4' },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          className="btn btn-surface"
                          style={{
                            padding: '0.4rem 0.2rem',
                            fontSize: '0.7rem',
                            borderColor:
                              forgeEquipSlot === opt.val ? 'var(--gold-bright)' : undefined,
                            color:
                              forgeEquipSlot === opt.val ? 'var(--gold-bright)' : undefined,
                          }}
                          onClick={() => setForgeEquipSlot(opt.val)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    cursor: 'pointer',
                    fontSize: '0.82rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={forgeShareFeed}
                    onChange={(e) => setForgeShareFeed(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span>Post to Chromastream Feed</span>
                </label>

                <button
                  type="submit"
                  className={forgeDestination === 'wild' ? 'btn btn-crimson' : 'btn btn-gold'}
                  disabled={forging}
                  id="submit-forge-card-btn"
                  style={{ width: '100%', padding: '0.8rem' }}
                >
                  <Sparkles size={16} />
                  <span>
                    {forging
                      ? forgeStatusText || 'Forging Photo Stats...'
                      : forgeDestination === 'wild'
                      ? `Analyze Stats & Send ${stagedFiles.length} Photo${
                          stagedFiles.length > 1 ? 's' : ''
                        } to the Wild`
                      : `Forge ${stagedFiles.length} Photo${
                          stagedFiles.length > 1 ? 's' : ''
                        } to My Deck`}
                  </span>
                </button>
              </form>
            )}

            {/* Newly Forged Card(s) Stat Reveal Showcase */}
            {lastForgedCards.length > 0 && (
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${
                    lastForgedMode === 'wild' ? '#4ade80' : 'var(--gold-bright)'
                  }`,
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.9rem',
                }}
                id="forged-card-result"
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      color: lastForgedMode === 'wild' ? '#4ade80' : 'var(--gold-bright)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {lastForgedMode === 'wild'
                      ? `🐾 Released ${lastForgedCards.length} Photo(s) to the Wild Rift · Stat Reveal`
                      : `🛡️ Bound ${lastForgedCards.length} Photo(s) to Your Deck · Squad (${playerSquad.length}/4)`}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {lastForgedMode === 'wild'
                      ? 'These photos were NOT saved to your deck. Their generated stats are shown below, and they now roam The Wilds where you can fight them anytime!'
                      : isSquadReady
                      ? 'Your 4-card Squad is complete! You can now fight Wild Photos in The Wilds.'
                      : `Upload ${missingSquadCount} more photo(s) to your Deck to complete your 4-card Squad.`}
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {lastForgedCards.map((fc) => (
                    <div
                      key={fc.id}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}
                    >
                      {fc.category && (
                        <div
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-gold)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.55rem 0.7rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.2rem',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '0.35rem',
                            }}
                          >
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                color: 'var(--gold-bright)',
                                textTransform: 'uppercase',
                              }}
                            >
                              📸 Classified Category: {fc.category} ({fc.categoryConfidence ?? 90}% Match)
                            </span>
                            {fc.categoryBonusLabel && (
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '0.64rem',
                                  color: '#4ade80',
                                  fontWeight: 700,
                                }}
                              >
                                {fc.categoryBonusLabel}
                              </span>
                            )}
                          </div>
                          {fc.categoryReason && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {fc.categoryReason}
                            </span>
                          )}
                        </div>
                      )}
                      <CombatCardView
                        card={fc}
                        onJudgeVibe={handleJudgePhotoVibe}
                        footerActions={
                          fc.isWild ? (
                            <button
                              type="button"
                              className="btn btn-crimson"
                              style={{ width: '100%' }}
                              onClick={() => handleFightWildCard(fc, 'pack')}
                            >
                              <Swords size={14} />{' '}
                              {isSquadReady
                                ? `Fight Wild ${fc.title} Now`
                                : `Complete Squad (${playerSquad.length}/4) to Fight`}
                            </button>
                          ) : undefined
                        }
                      />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-gold"
                    onClick={() => setActiveTab('world')}
                  >
                    <Trees size={14} /> Explore The Wilds ({wildCards.length})
                  </button>
                  <button
                    type="button"
                    className="btn btn-surface"
                    onClick={() => setActiveTab('sanctum')}
                  >
                    <Shield size={14} /> View My Squad ({playerSquad.length}/4)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 3: SQUAD & SANCTUM (REQUIRE 4 DECK PHOTOS + VAULT)
           ========================================================= */}
        {activeTab === 'sanctum' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {/* Active 4-Card Formation Builder (2x2 Mobile Tactical Grid) */}
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-gold)',
                borderRadius: 'var(--radius-md)',
                padding: '0.9rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.6rem',
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.62rem',
                      color: isSquadReady ? '#4ade80' : 'var(--gold-primary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {isSquadReady
                      ? '✓ 4/4 Combat Formation Ready'
                      : `Requires 4 Uploaded Deck Photos (${playerSquad.length}/4)`}
                  </span>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
                    Active Battle Squad
                  </h1>
                </div>
                <span className="card-power-badge">⚔ {totalSquadPower}</span>
              </div>

              {/* Horizontally Scrollable Synergy Pills */}
              {playerSynergies.length > 0 && (
                <div className="h-scroll-strip" style={{ marginBottom: '0.75rem' }}>
                  {playerSynergies.map((syn) => (
                    <span
                      key={syn.id}
                      className="card-pill"
                      style={{ borderColor: 'var(--border-gold)', color: 'var(--gold-bright)' }}
                      title={syn.description}
                    >
                      ✦ {syn.name}
                    </span>
                  ))}
                </div>
              )}

              <div className="sanctum-squad-grid">
                {[0, 1, 2, 3].map((idx) => {
                  const card = playerSquad[idx];
                  if (card) {
                    return (
                      <CombatCardView
                        key={card.id}
                        card={card}
                        compact={true}
                        slotBadge={`S${idx + 1} ${
                          idx === 0 ? 'FRONT' : idx === 3 ? 'BACK' : 'MID'
                        }`}
                      />
                    );
                  }
                  return (
                    <button
                      key={`empty-sanctum-slot-${idx}`}
                      type="button"
                      onClick={() => openForgeWithMode('deck')}
                      style={{
                        border: '1.5px dashed var(--border-gold)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface)',
                        minHeight: '190px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem',
                        color: 'var(--gold-bright)',
                      }}
                    >
                      <Plus size={24} />
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.92rem',
                          fontWeight: 700,
                        }}
                      >
                        Slot {idx + 1} Empty
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        Tap to Upload Photo to Deck
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vault Filter Strip & Collection */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '0.5rem',
                }}
              >
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
                  My Deck Vault ({filteredVaultCards.length})
                </h2>
                <button
                  type="button"
                  onClick={() => openForgeWithMode('deck')}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: 'var(--gold-bright)',
                  }}
                >
                  + Upload More to Deck
                </button>
              </div>

              {/* Touch Filter Pills (Elements + Photography Categories) */}
              <div className="h-scroll-strip" style={{ marginBottom: '0.85rem' }}>
                {(
                  [
                    'ALL',
                    'EQUIPPED',
                    ...PHOTO_CATEGORIES,
                    'Solar',
                    'Abyssal',
                    'Crimson',
                    'Verdant',
                    'Astral',
                    'Monochrome',
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill}
                    type="button"
                    className="btn btn-surface"
                    style={{
                      minHeight: '34px',
                      padding: '0.3rem 0.7rem',
                      fontSize: '0.72rem',
                      borderRadius: '999px',
                      borderColor: vaultFilter === pill ? 'var(--gold-bright)' : undefined,
                      color: vaultFilter === pill ? 'var(--gold-bright)' : undefined,
                    }}
                    onClick={() => setVaultFilter(pill)}
                  >
                    {pill}
                  </button>
                ))}
              </div>

              {filteredVaultCards.length === 0 ? (
                <div
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.5rem 1rem',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
                    Your Deck Vault has no cards matching this filter yet. Upload photos to build
                    your 4-card squad!
                  </p>
                  <button
                    type="button"
                    className="btn btn-gold"
                    onClick={() => openForgeWithMode('deck')}
                  >
                    <Camera size={15} /> Upload Photos to My Deck
                  </button>
                </div>
              ) : (
                <div className="sanctum-vault-grid">
                  {filteredVaultCards.map((card) => {
                    const inSquadIdx = player.squadCardIds.indexOf(card.id);
                    const levelCost = card.level * 100;

                    return (
                      <CombatCardView
                        key={card.id}
                        card={card}
                        onJudgeVibe={handleJudgePhotoVibe}
                        slotBadge={
                          inSquadIdx !== -1 ? `EQUIPPED S${inSquadIdx + 1}` : undefined
                        }
                        footerActions={
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.45rem',
                            }}
                          >
                            {/* Equip Slot Selector */}
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '0.35rem',
                              }}
                            >
                              {[0, 1, 2, 3].map((slot) => (
                                <button
                                  key={slot}
                                  type="button"
                                  className="btn btn-surface"
                                  style={{
                                    minHeight: '38px',
                                    padding: '0.3rem',
                                    fontSize: '0.72rem',
                                    borderColor:
                                      inSquadIdx === slot ? 'var(--gold-bright)' : undefined,
                                    color:
                                      inSquadIdx === slot ? 'var(--gold-bright)' : undefined,
                                  }}
                                  onClick={() => handleAssignToSlot(card.id, slot)}
                                >
                                  Slot {slot + 1}
                                </button>
                              ))}
                            </div>

                            {/* Level Up / Foil Ascend / Soul Fuse / Send to Wild Buttons */}
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-gold"
                                style={{ flex: 1, padding: '0.45rem', fontSize: '0.72rem' }}
                                onClick={() => handleUpgradeCard(card.id, 'levelup')}
                              >
                                <ArrowUpCircle size={13} /> Lv.Up ({levelCost})
                              </button>
                              <button
                                type="button"
                                className="btn btn-surface"
                                style={{ flex: 1, padding: '0.45rem', fontSize: '0.72rem' }}
                                onClick={() => handleUpgradeCard(card.id, 'ascend')}
                              >
                                <Sparkles size={13} /> Foil (8)
                              </button>
                              {playerCards.length > 1 && (
                                <button
                                  type="button"
                                  className="btn btn-surface"
                                  style={{ padding: '0.45rem 0.6rem', fontSize: '0.72rem' }}
                                  onClick={() =>
                                    setFuseTargetCardId((prev) =>
                                      prev === card.id ? null : card.id
                                    )
                                  }
                                  title="Soul-Fuse another card into this card"
                                >
                                  <Layers size={13} />
                                </button>
                              )}
                              <button
                                type="button"
                                className="btn btn-surface"
                                style={{ padding: '0.45rem 0.6rem', fontSize: '0.72rem' }}
                                onClick={() => handleReleaseCardToWild(card)}
                                title="Release this card from your Deck into the Wild Rift to fight later"
                              >
                                <Trees size={13} style={{ color: '#4ade80' }} /> Wild
                              </button>
                            </div>

                            {fuseTargetCardId === card.id && (
                              <div
                                style={{
                                  background: 'var(--bg-void)',
                                  border: '1px solid var(--border-gold)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '0.65rem',
                                  marginTop: '0.2rem',
                                }}
                              >
                                <div
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.64rem',
                                    color: 'var(--gold-bright)',
                                    marginBottom: '0.35rem',
                                  }}
                                >
                                  Sacrifice Card (+18% Stats + Trait Imprint):
                                </div>
                                <select
                                  className="form-select"
                                  style={{ marginBottom: '0.45rem' }}
                                  value={fuseSacrificeId}
                                  onChange={(e) => setFuseSacrificeId(e.target.value)}
                                >
                                  <option value="">— Choose card —</option>
                                  {playerCards
                                    .filter((c) => c.id !== card.id)
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.title} ({c.opticalTrait})
                                      </option>
                                    ))}
                                </select>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <button
                                    type="button"
                                    className="btn btn-crimson"
                                    style={{ flex: 1 }}
                                    disabled={!fuseSacrificeId}
                                    onClick={() =>
                                      handleUpgradeCard(card.id, 'fuse', fuseSacrificeId)
                                    }
                                  >
                                    Confirm Fusion
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-surface"
                                    onClick={() => setFuseTargetCardId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 4: THE WILDS (ROAMING WILD PHOTO CARDS TO FIGHT)
           ========================================================= */}
        {activeTab === 'world' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Top Wild Rift Command Header */}
            <div
              style={{
                background:
                  'linear-gradient(135deg, hsla(146, 68%, 35%, 0.18), hsla(354, 70%, 45%, 0.14))',
                border: '1px solid var(--border-gold)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.64rem',
                    color: '#4ade80',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Wild Photo Ecosystem · {wildCards.length} Wild Specimens Roaming
                </span>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem' }}>
                  The Wild Rift
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  Photos uploaded with <strong>Send to the Wild</strong> are not saved to your
                  deck—they roam here as Wild Photo-Beasts! Upload as many photos as you want to
                  discover their stats and battle them with your 4-card Squad.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => openForgeWithMode('wild')}
                >
                  <Camera size={15} /> Upload Photo to Wild
                </button>
                <button
                  type="button"
                  className="btn btn-crimson"
                  onClick={handleFightRandomWildPack}
                >
                  <Swords size={15} /> Fight Random Pack
                </button>
              </div>
            </div>

            {/* Category & Element Filter Bar for Wild Specimens */}
            <div className="h-scroll-strip">
              {(
                [
                  'ALL',
                  ...PHOTO_CATEGORIES,
                  'Solar',
                  'Abyssal',
                  'Crimson',
                  'Verdant',
                  'Astral',
                  'Monochrome',
                ] as const
              ).map((pill) => (
                <button
                  key={pill}
                  type="button"
                  className="btn btn-surface"
                  style={{
                    minHeight: '34px',
                    padding: '0.3rem 0.7rem',
                    fontSize: '0.72rem',
                    borderRadius: '999px',
                    borderColor: wildFilter === pill ? '#4ade80' : undefined,
                    color: wildFilter === pill ? '#4ade80' : undefined,
                  }}
                  onClick={() => setWildFilter(pill)}
                >
                  {pill}
                </button>
              ))}
            </div>

            {filteredWildCards.length === 0 ? (
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.6rem 1rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  alignItems: 'center',
                }}
              >
                <Compass size={32} style={{ color: '#4ade80' }} />
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
                    No Wild Photos Roaming Yet
                  </h2>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.82rem',
                      maxWidth: '380px',
                      margin: '0.25rem auto 0',
                    }}
                  >
                    Upload any photo in the Forge with <strong>Send to the Wild</strong> to see
                    what combat stats it generates and release it here as a fightable opponent!
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => openForgeWithMode('wild')}
                >
                  <Trees size={15} /> Upload Photos to the Wild
                </button>
              </div>
            ) : (
              <div className="sanctum-vault-grid">
                {filteredWildCards.map((wCard) => (
                  <CombatCardView
                    key={wCard.id}
                    card={wCard}
                    onJudgeVibe={handleJudgePhotoVibe}
                    footerActions={
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.62rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span>Battles Fought: {wCard.wildEncounters || 0}</span>
                          <span>Wild Victories: {wCard.wildWins || 0}</span>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: '0.35rem',
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-surface"
                            style={{ padding: '0.45rem 0.3rem', fontSize: '0.7rem' }}
                            onClick={() => handleFightWildCard(wCard, 'solo')}
                            title="Fight this single Wild Card 1v4 with its exact stats"
                          >
                            <Swords size={13} /> Solo 1v4
                          </button>
                          <button
                            type="button"
                            className="btn btn-crimson"
                            style={{ padding: '0.45rem 0.3rem', fontSize: '0.7rem' }}
                            onClick={() => handleFightWildCard(wCard, 'pack')}
                            title="Fight a Wild Pack led by this Wild Card"
                          >
                            <Swords size={13} /> Pack 4v4
                          </button>
                          <button
                            type="button"
                            className="btn btn-gold"
                            style={{ padding: '0.45rem 0.3rem', fontSize: '0.7rem' }}
                            onClick={() => handleFightWildCard(wCard, 'apex')}
                            title="Fight an amplified Colossal Apex Raid Boss version of this photo"
                          >
                            <Crown size={13} /> Apex Boss
                          </button>
                        </div>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 5: LUMENMANCER RECORD & OPTICAL ALCHEMY CODEX
           ========================================================= */}
        {activeTab === 'leaderboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  color: 'var(--gold-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Lumenmancer Progression & Stat Lab Guide
              </span>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}>
                Commander Record & Codex
              </h1>
            </div>

            {/* Player Progression Card */}
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-gold)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <strong style={{ fontSize: '1.05rem' }}>{player.displayName}</strong>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    @{player.username} · Level {player.level} · Order of {player.faction}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="card-power-badge">{player.eloRating} ELO</span>
                  <button
                    type="button"
                    className="btn btn-gold"
                    onClick={() => setAuthModalOpen(true)}
                    style={{ minHeight: '34px', padding: '0.3rem 0.65rem', fontSize: '0.72rem' }}
                  >
                    <LogIn size={13} /> {sessionUser ? 'Switch / Account' : 'Log In / Sign Up'}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.4rem',
                  background: 'var(--bg-surface)',
                  padding: '0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div>
                  <span className="stat-box-label">SQUAD</span>
                  <span className="stat-box-val" style={{ color: 'var(--gold-bright)' }}>
                    {playerSquad.length}/4
                  </span>
                </div>
                <div>
                  <span className="stat-box-label">DECK</span>
                  <span className="stat-box-val">{playerCards.length}</span>
                </div>
                <div>
                  <span className="stat-box-label">WILD</span>
                  <span className="stat-box-val" style={{ color: '#4ade80' }}>
                    {wildCards.length}
                  </span>
                </div>
                <div>
                  <span className="stat-box-label">W / L</span>
                  <span className="stat-box-val">
                    {player.wins}/{player.losses}
                  </span>
                </div>
              </div>
            </div>

            {/* Photo Vibe Judgments & Stat Influence Guide */}
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-gold)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
                Photo Vibe Judgments &amp; Stat Boosts
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Judge any photo in the <strong>Stream</strong>, <strong>My Deck</strong>, or{' '}
                <strong>The Wilds</strong> by tapping its Vibe buttons. Every click is saved to the
                photo and permanently modifies its combat stats:
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.45rem',
                  fontSize: '0.74rem',
                }}
              >
                {VIBE_DEFINITIONS.map((vibe) => (
                  <div
                    key={vibe.id}
                    style={{
                      background: 'var(--bg-surface)',
                      padding: '0.5rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      borderLeft: `3px solid ${vibe.color}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.15rem',
                    }}
                  >
                    <strong style={{ color: vibe.color }}>
                      {vibe.emoji} {vibe.label}
                    </strong>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                      {vibe.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Photography Category Classifier & Stat Modifiers Guide */}
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-gold)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
                Photography Categories &amp; Stat Modifiers
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Every uploaded photo is analyzed across spatial composition, subject focus isolation,
                edge geometry, color distribution, and EXIF optics to classify its{' '}
                <strong>Photography Category</strong>—which directly shapes its combat stats and
                squad synergies:
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  fontSize: '0.75rem',
                }}
              >
                {[
                  {
                    title: '👤 Portrait',
                    bonus: '+8% CRIT · +14% ATK · +8% SPD (Striker)',
                    desc: 'Detected via center subject isolation, portrait aspect/focal length, or warm skin-tone harmonics. Excels at precision critical strikes.',
                  },
                  {
                    title: '🏛️ Architecture',
                    bonus: '+26% DEF · +18% HP · Starts w/ +16% HP Shield (Vanguard)',
                    desc: 'Detected via strong vertical/horizontal orthogonal edge alignment, deep depth-of-field, or wide geometry. Ultimate frontline fortress.',
                  },
                  {
                    title: '🌿 Nature',
                    bonus: '+22% HP · +12% DEF · +6% ATK (Bruiser)',
                    desc: 'Detected via organic foliage/earth palettes, top-frame sky horizons, and landscape framing. High-vitality sustained brawler.',
                  },
                  {
                    title: '🏺 Still Life',
                    bonus: '+16% ATK · +16% DEF · +4% CRIT (Arcanist)',
                    desc: 'Detected via controlled studio/tabletop perimeter lighting and sharp center object focus. Balanced tactical spell-weaver.',
                  },
                  {
                    title: '⚡ Street & Action',
                    bonus: '+20% SPD · +14% ATK · +5% CRIT (Striker)',
                    desc: 'Detected via fast shutter speed, high dynamic edge density, and kinetic contrast. Always strikes first in the timeline.',
                  },
                  {
                    title: '🦋 Macro & Wildlife',
                    bonus: '+20% ATK · +6% CRIT · +8% SPD (Striker)',
                    desc: 'Detected via extreme center-to-border bokeh ratio (>1.4x) or telephoto magnification. Lethal single-target burst.',
                  },
                  {
                    title: '🌙 Night & Astro',
                    bonus: '+22% ATK · +6% CRIT · +8% HP (Arcanist)',
                    desc: 'Detected via low-key shadow luminance with bright star/neon highlights or high ISO long exposures. Heavy arcane nuker.',
                  },
                  {
                    title: '🎨 Fine Art & Abstract',
                    bonus: '+16% ATK · +12% SPD · +5% CRIT (Arcanist)',
                    desc: 'Detected via extreme chromatic saturation, monochrome minimalism, or experimental tonal variance. Unpredictable tempo mage.',
                  },
                ].map((cat) => (
                  <div
                    key={cat.title}
                    style={{
                      background: 'var(--bg-surface)',
                      padding: '0.55rem 0.7rem',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.18rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.3rem',
                      }}
                    >
                      <strong style={{ color: 'var(--gold-bright)' }}>{cat.title}</strong>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.64rem',
                          color: '#4ade80',
                          fontWeight: 700,
                        }}
                      >
                        {cat.bonus}
                      </span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                      {cat.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Optical EXIF & RGB Stat Synthesis Guide */}
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
                How Photo Stats Are Calculated
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Upload different types of photographs to the <strong>Wild</strong> or your{' '}
                <strong>Deck</strong> to discover rare stat combinations:
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.45rem',
                  fontSize: '0.76rem',
                }}
              >
                <div
                  style={{
                    background: 'var(--bg-surface)',
                    padding: '0.55rem 0.7rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <strong style={{ color: 'var(--gold-bright)' }}>
                    🎨 RGB Color Spectrum → Element:
                  </strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Golden/warm light forges <strong>Solar</strong>; deep blue forges{' '}
                    <strong>Abyssal</strong>; intense red forges <strong>Crimson</strong>; lush
                    green forges <strong>Verdant</strong>; cyan/violet forges{' '}
                    <strong>Astral</strong>; black &amp; white / low saturation forges{' '}
                    <strong>Monochrome</strong> (True Damage).
                  </span>
                </div>

                <div
                  style={{
                    background: 'var(--bg-surface)',
                    padding: '0.55rem 0.7rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <strong style={{ color: 'var(--gold-bright)' }}>
                    🔭 Focal Length &amp; Category → Combat Role:
                  </strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Wide-angle (&lt;28mm) or Architecture = <strong>Vanguard</strong> (Tank);
                    Standard (28–58mm) or Nature = <strong>Bruiser</strong>; Still Life, Night, or
                    Fine Art = <strong>Arcanist</strong>; Telephoto, Portrait, Street, or Macro ={' '}
                    <strong>Striker</strong>.
                  </span>
                </div>

                <div
                  style={{
                    background: 'var(--bg-surface)',
                    padding: '0.55rem 0.7rem',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <strong style={{ color: 'var(--gold-bright)' }}>
                    ⚡ Shutter, Aperture &amp; Contrast → Stats:
                  </strong>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Fast shutter speed boosts <strong>SPD</strong>; wide aperture (f/1.4–f/2.8)
                    boosts <strong>CRIT %</strong>; narrow aperture (f/8+) boosts{' '}
                    <strong>DEF</strong>; high contrast &amp; ISO boost <strong>ATK</strong> &amp;{' '}
                    <strong>Rarity</strong>.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* =========================================================
          FIXED BOTTOM THUMB-ZONE NAVIGATION BAR
         ========================================================= */}
      <nav className="mmo-bottom-nav" aria-label="MMO Primary Bottom Navigation">
        <div className="bottom-nav-inner">
          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveTab('feed')}
            id="nav-tab-feed"
          >
            <Zap size={19} />
            <span>Stream</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'sanctum' ? 'active' : ''}`}
            onClick={() => setActiveTab('sanctum')}
            id="nav-tab-sanctum"
          >
            <Shield size={19} />
            <span>My Deck</span>
            <span className="nav-badge-count">{playerSquad.length}/4</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item forge-orb-btn ${
              activeTab === 'forge' ? 'active' : ''
            }`}
            onClick={() => setActiveTab('forge')}
            id="nav-tab-forge"
          >
            <div className="forge-orb-icon">
              <Camera size={21} />
            </div>
            <span style={{ color: 'var(--gold-bright)', fontWeight: 700 }}>Forge</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'world' ? 'active' : ''}`}
            onClick={() => setActiveTab('world')}
            id="nav-tab-world"
          >
            <Trees size={19} />
            <span>Wilds</span>
            {wildCards.length > 0 && (
              <span
                className="nav-badge-count"
                style={{ borderColor: '#4ade80', color: '#4ade80' }}
              >
                {wildCards.length}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboard')}
            id="nav-tab-leaderboard"
          >
            <Trophy size={19} />
            <span>Codex</span>
          </button>
        </div>
      </nav>

      {/* Auto-Battle Playback Arena Modal */}
      {activeSimulation && (
        <AutoBattleArenaModal
          simulation={activeSimulation}
          rewardSummary={battleRewardSummary}
          onClose={() => setActiveSimulation(null)}
        />
      )}

      {/* User Login, Registration & Account Switcher Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        sessionUser={sessionUser}
        currentPlayer={player}
        accounts={accounts}
        players={mmoState.players}
        onLoginSuccess={({
          sessionUser: nextUser,
          activePlayerId: nextPid,
          state: nextState,
          accounts: nextAccounts,
          message,
        }) => {
          setSessionUser(nextUser);
          if (nextPid) {
            setActivePlayerId(nextPid);
            setSavedActivePlayerId(nextPid);
          }
          if (Array.isArray(nextAccounts)) {
            setAccounts(nextAccounts);
          }
          if (nextState) {
            syncState({
              ...(nextState as MmoState),
              sessionUser: nextUser,
              activePlayerId: nextPid || activePlayerId,
              accounts: nextAccounts || accounts,
            });
          }
          showToast(message);
        }}
      />
    </div>
  );
}

export default App;
