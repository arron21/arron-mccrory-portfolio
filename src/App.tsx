import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Swords,
  Sparkles,
  Flame,
  Globe,
  Trophy,
  UploadCloud,
  Zap,
  MessageSquare,
  Shield,
  Wand2,
  ArrowUpCircle,
  Layers,
  CheckCircle2,
  Send,
  Camera,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Monitor,
} from 'lucide-react';
import {
  formatBytes,
  type MmoState,
  type MmoCard,
  type MmoPlayer,
  type MmoWorldZone,
  type FactionId,
  type ElementType,
} from './types.ts';
import { CombatCardView, ElementIcon } from './components/CombatCardView.tsx';
import { AutoBattleArenaModal } from './components/AutoBattleArenaModal.tsx';
import {
  evaluateSquadSynergies,
  simulateAutoBattle,
  type AutoBattleSimulation,
} from './utils/autoBattler.ts';
import { preparePhotoForUpload } from './utils/clientOptimizer.ts';

const LOCAL_CACHE_KEY = 'chromarift_mmo_state_cache_v1';

export function App() {
  const [activeTab, setActiveTab] = useState<
    'feed' | 'forge' | 'sanctum' | 'world' | 'leaderboard'
  >('feed');

  // Mobile-first shell mode (true = 480px native mobile shell on desktop; false = expanded wide grid)
  const [mobileShellMode, setMobileShellMode] = useState(true);

  const [mmoState, setMmoState] = useState<MmoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Mobile Squad Drawer expanded state at top of Feed
  const [squadDrawerOpen, setSquadDrawerOpen] = useState(false);

  // Expanded comments per post on mobile feed
  const [expandedCommentPostIds, setExpandedCommentPostIds] = useState<
    Record<string, boolean>
  >({});

  // Sanctum element filter
  const [vaultFilter, setVaultFilter] = useState<'ALL' | 'EQUIPPED' | ElementType>('ALL');

  // Active Auto-Battle simulation modal state
  const [activeSimulation, setActiveSimulation] = useState<AutoBattleSimulation | null>(
    null
  );
  const [battleRewardSummary, setBattleRewardSummary] = useState<string>('');

  // Social Feed comment inputs
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // Soul-Lens Forge Upload state
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [forgeTitle, setForgeTitle] = useState('');
  const [forgeCaption, setForgeCaption] = useState('');
  const [forgeEquipSlot, setForgeEquipSlot] = useState<string>('0');
  const [forgeShareFeed, setForgeShareFeed] = useState(true);
  const [forging, setForging] = useState(false);
  const [forgeStatusText, setForgeStatusText] = useState('');
  const [lastForgedCard, setLastForgedCard] = useState<MmoCard | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Sanctum Soul-Fusion selection state
  const [fuseTargetCardId, setFuseTargetCardId] = useState<string | null>(null);
  const [fuseSacrificeId, setFuseSacrificeId] = useState<string>('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3800);
  };

  const syncState = (nextState: MmoState) => {
    setMmoState(nextState);
    try {
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(nextState));
    } catch {
      // Ignore storage quota errors
    }
  };

  const fetchMmoState = async () => {
    try {
      const res = await fetch('/api/mmo/state');
      if (res.ok) {
        const serverState = (await res.json()) as MmoState;
        try {
          const cachedRaw = localStorage.getItem(LOCAL_CACHE_KEY);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as MmoState;
            const serverCardIds = new Set(serverState.cards.map((c) => c.id));
            const missingCustomCards = (cached.cards || []).filter(
              (c) => !serverCardIds.has(c.id) && c.ownerId === 'player-arron21'
            );
            if (missingCustomCards.length > 0) {
              serverState.cards = [...missingCustomCards, ...serverState.cards];
            }
          }
        } catch {
          // Ignore cache parse issues
        }
        syncState(serverState);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMmoState();
  }, []);

  const player: MmoPlayer | null = useMemo(() => {
    if (!mmoState) return null;
    return (
      mmoState.players.find((p) => p.id === 'player-arron21') || mmoState.players[0] || null
    );
  }, [mmoState]);

  const playerCards: MmoCard[] = useMemo(() => {
    if (!mmoState || !player) return [];
    return mmoState.cards.filter((c) => c.ownerId === player.id);
  }, [mmoState, player]);

  const playerSquad: MmoCard[] = useMemo(() => {
    if (!mmoState || !player) return [];
    const squad = player.squadCardIds
      .map((id) => mmoState.cards.find((c) => c.id === id))
      .filter((c): c is MmoCard => Boolean(c));
    return squad.length > 0 ? squad : playerCards.slice(0, 4);
  }, [mmoState, player, playerCards]);

  const playerSynergies = useMemo(
    () => evaluateSquadSynergies(playerSquad),
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
    return playerCards.filter((c) => c.element === vaultFilter);
  }, [playerCards, player, vaultFilter]);

  // Trigger an Auto-Battle against another Player/Rival Squad
  const handleChallengePlayer = async (
    rival: MmoPlayer,
    mode: 'pvp' | 'territory' = 'pvp',
    zoneId?: string
  ) => {
    if (!mmoState || playerSquad.length === 0) return;

    const enemySquad = rival.squadCardIds
      .map((cid) => mmoState.cards.find((c) => c.id === cid))
      .filter((c): c is MmoCard => Boolean(c));

    const finalEnemySquad =
      enemySquad.length > 0 ? enemySquad : mmoState.cards.slice(0, 4);

    const sim = simulateAutoBattle(
      playerSquad,
      finalEnemySquad,
      rival.displayName,
      `${rival.title} · ${rival.faction} Faction`,
      false
    );

    setActiveSimulation(sim);
    setBattleRewardSummary(
      sim.won
        ? `Victory! +${mode === 'territory' ? 180 : 140} Lumen · +${
            mode === 'territory' ? 5 : 3
          } Shards · +24 ELO`
        : `Defeat · +45 Lumen · Upgrade or reorder your squad in the Sanctum.`
    );

    const res = await fetch('/api/mmo/battle/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        won: sim.won,
        mode,
        zoneId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
    }
  };

  // Trigger an Auto-Battle Raid Strike against a Colossal World Raid Boss
  const handleRaidBossStrike = async (zone: MmoWorldZone) => {
    if (!mmoState || playerSquad.length === 0) return;

    const boss = zone.raidBoss;
    const bossCard: MmoCard = {
      id: boss.id,
      ownerId: 'world-raid',
      ownerName: boss.name,
      ownerHandle: 'raid_boss',
      ownerFaction: 'Umbra',
      title: boss.name,
      epithet: boss.epithet,
      caption: boss.abilityDesc,
      imageUrl: boss.imageUrl,
      dominantColor: '#8f2929',
      element: boss.element,
      role: 'Vanguard',
      rarity: 'Mythic',
      foil: 'Prismatic',
      opticalTrait: 'Colossal Raid Armor',
      level: 10,
      ascensionTier: 3,
      hypeCount: 50,
      hp: Math.min(4500, boss.currentHp),
      atk: boss.atk,
      def: boss.def,
      spd: boss.spd,
      crit: boss.crit,
      powerRating: 3200,
      ability: {
        name: boss.abilityName,
        trigger: 'ON_ATTACK_2',
        triggerLabel: 'Every 2nd Action',
        description: boss.abilityDesc,
        powerScale: 1.5,
        effectType: 'aoe_burn',
      },
      exif: {
        camera: 'World Rift Anomaly',
        lens: 'Titan Aperture',
        focalLength: '24mm',
        aperture: 'f/1.4',
        shutterSpeed: '1/1000s',
        iso: 'ISO 6400',
      },
      colorTelemetry: { r: 180, g: 90, b: 70, luminance: 110, contrast: 85, saturation: 110 },
      originalSizeBytes: 0,
      optimizedSizeBytes: 0,
      savingsPercent: 99,
      createdAt: 'Active',
    };

    const sim = simulateAutoBattle(
      playerSquad,
      [bossCard],
      boss.name,
      boss.epithet,
      true
    );

    setActiveSimulation(sim);
    setBattleRewardSummary(
      `Raid Strike dealt ${sim.totalDamageDealt.toLocaleString()} DMG to ${
        boss.name
      }! +${boss.rewardLumen} Lumen & +${boss.rewardShards} Shards.`
    );

    const res = await fetch('/api/mmo/battle/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        won: true,
        mode: 'raid',
        zoneId: zone.id,
        bossDamageDealt: sim.totalDamageDealt,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
    }
  };

  // Social Feed Hype Boost
  const handleHypePost = async (postId: string) => {
    const res = await fetch(`/api/mmo/posts/${postId}/hype`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
      showToast('⚡ Hype Resonance! Card HP & ATK permanently buffed (+15 Lumen).');
    }
  };

  // Social Feed Comment
  const handleAddComment = async (e: React.FormEvent, postId: string) => {
    e.preventDefault();
    const text = commentInputs[postId] || '';
    if (!text.trim()) return;

    const res = await fetch(`/api/mmo/posts/${postId}/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    }
  };

  // Select a file for Soul-Lens Card Forging
  const handleSelectForgeFile = (file: File) => {
    if (stagedPreview) URL.revokeObjectURL(stagedPreview);
    setStagedFile(file);
    setStagedPreview(URL.createObjectURL(file));
    const cleanTitle = file.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    setForgeTitle(cleanTitle || 'Riftbound Sovereign');
  };

  // Synthesize a high-res procedural anomaly photo in-browser for 1-tap mobile forging
  const handleSynthesizeAnomaly = (
    preset: 'solar' | 'abyssal' | 'crimson' | 'verdant'
  ) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palettes = {
      solar: ['#1a1105', '#9a5b13', '#f5b041', 'Solaris Obelisk Anomaly'],
      abyssal: ['#040b1c', '#0f2c59', '#38bdf8', 'Pelagic Trench Anomaly'],
      crimson: ['#1c0408', '#7f1d1d', '#f43f5e', 'Crimson Blood-Spire Anomaly'],
      verdant: ['#051b11', '#14532d', '#4ade80', 'Bioluminescent Spore Anomaly'],
    };
    const [c0, c1, c2, label] = palettes[preset];

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, c0);
    grad.addColorStop(0.55, c1);
    grad.addColorStop(1, c0);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rad = ctx.createRadialGradient(900, 540, 30, 900, 540, 520);
    rad.addColorStop(0, c2);
    rad.addColorStop(0.45, c1);
    rad.addColorStop(1, 'transparent');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#07080c';
    ctx.beginPath();
    ctx.moveTo(760, 1350);
    ctx.lineTo(850, 290);
    ctx.lineTo(900, 210);
    ctx.lineTo(950, 290);
    ctx.lineTo(1040, 1350);
    ctx.closePath();
    ctx.fill();

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `${label.toLowerCase().replace(/\s+/g, '-')}.webp`, {
          type: 'image/webp',
        });
        handleSelectForgeFile(file);
        setForgeTitle(label);
        setForgeCaption(
          `Captured via Soul-Lens Anomaly Scanner (${preset.toUpperCase()} spectrum resonance).`
        );
      },
      'image/webp',
      0.9
    );
  };

  // Submit Photo to Soul-Lens Forge
  const handleForgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stagedFile) return;

    setForging(true);
    setLastForgedCard(null);
    setForgeStatusText('Extracting EXIF & pre-scaling (<2.8 MB)...');

    try {
      const prepared = await preparePhotoForUpload(stagedFile);
      const fname = prepared.uploadFile.name;

      setForgeStatusText('Analyzing RGB aura & minting Combat Card...');

      const formData = new FormData();
      formData.append('photos', prepared.uploadFile);
      formData.append('shareToFeed', String(forgeShareFeed));
      formData.append('equipSlot', forgeEquipSlot);
      formData.append(
        'titles',
        JSON.stringify({ [fname]: forgeTitle || 'Chromatic Relic' })
      );
      formData.append('captions', JSON.stringify({ [fname]: forgeCaption }));
      formData.append(
        'clientOriginalSizes',
        JSON.stringify({ [fname]: prepared.originalSizeBytes })
      );
      formData.append('clientExif', JSON.stringify({ [fname]: prepared.exif }));

      const res = await fetch('/api/mmo/forge', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Failed to forge card.');
      } else {
        const created = data.forgedCards?.[0] as MmoCard | undefined;
        if (created) setLastForgedCard(created);
        if (data.state) syncState(data.state);
        if (stagedPreview) URL.revokeObjectURL(stagedPreview);
        setStagedFile(null);
        setStagedPreview(null);
        showToast(
          `✦ Forged [${created?.rarity}] ${created?.title} (${created?.element} ${created?.role})!`
        );
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ squadCardIds: nextSquad.filter(Boolean) }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.state) syncState(data.state);
      showToast(`Equipped to Formation Slot ${slotIdx + 1}.`);
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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

  const rivals = mmoState.players.filter((p) => p.id !== player.id);

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
                Lv.{player.level} · {player.faction}
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
              <Shield size={14} /> Sanctum ({playerCards.length})
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'forge' ? 'active' : ''}`}
              onClick={() => setActiveTab('forge')}
            >
              <Camera size={14} /> Forge Photo
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'world' ? 'active' : ''}`}
              onClick={() => setActiveTab('world')}
            >
              <Globe size={14} /> Rift Atlas
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('leaderboard')}
            >
              <Trophy size={14} /> Ranks
            </button>
          </nav>

          {/* Compact Mobile Resource Chips + Shell Toggle */}
          <div className="hud-resources">
            <div className="resource-pill" title="Lumen Dust (Level Up Cards)">
              <Sparkles size={11} style={{ color: 'var(--gold-bright)' }} />
              <strong>{player.lumenDust}</strong>
            </div>
            <div className="resource-pill" title="Chromatic Shards (Foil Ascension)">
              <Flame size={11} style={{ color: 'var(--elem-astral)' }} />
              <strong style={{ color: 'var(--elem-astral)' }}>{player.chromaticShards}</strong>
            </div>
            <div className="resource-pill" title="Arena ELO Rating">
              <Trophy size={11} style={{ color: 'var(--gold-primary)' }} />
              <strong>{player.eloRating}</strong>
            </div>

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
            TAB 1: THE CHROMASTREAM (MOBILE-FIRST SOCIAL FEED)
           ========================================================= */}
        {activeTab === 'feed' && (
          <div className="feed-layout">
            <div className="feed-stream">
              {/* 1. Horizontal Story / Rival Quick-Duel & Raid Ribbon */}
              <div className="story-bounty-ribbon" aria-label="Quick Actions and Rival Bounties">
                {/* Node 1: Forge Photo Card */}
                <button
                  type="button"
                  className="story-node"
                  onClick={() => setActiveTab('forge')}
                  id="hero-forge-photo-cta"
                >
                  <div className="story-avatar-ring">
                    <div className="story-avatar-inner">
                      <Camera size={20} style={{ color: 'var(--gold-bright)' }} />
                    </div>
                    <span
                      className="story-tag-pill"
                      style={{ background: 'var(--gold-primary)', color: '#08090d' }}
                    >
                      +FORGE
                    </span>
                  </div>
                  <span className="story-node-name">Mint Photo</span>
                </button>

                {/* Node 2: Instant Quick Auto-Battle */}
                <button
                  type="button"
                  className="story-node"
                  onClick={() => {
                    if (rivals[0]) handleChallengePlayer(rivals[0], 'pvp');
                  }}
                  id="hero-quick-battle-cta"
                >
                  <div className="story-avatar-ring">
                    <div className="story-avatar-inner">
                      <Swords size={20} style={{ color: '#f87171' }} />
                    </div>
                    <span className="story-tag-pill">DUEL</span>
                  </div>
                  <span className="story-node-name">Quick Battle</span>
                </button>

                {/* Rival Lumenmancers (1-Tap Auto-Battle) */}
                {rivals.map((rival) => {
                  const leadCard = mmoState.cards.find(
                    (c) => c.id === rival.squadCardIds[0]
                  );
                  return (
                    <button
                      key={rival.id}
                      type="button"
                      className="story-node"
                      onClick={() => handleChallengePlayer(rival, 'pvp')}
                    >
                      <div className="story-avatar-ring">
                        <div className="story-avatar-inner">
                          {leadCard ? (
                            <img src={leadCard.imageUrl} alt={rival.displayName} />
                          ) : (
                            rival.displayName.slice(0, 2)
                          )}
                        </div>
                        <span className="story-tag-pill">VS</span>
                      </div>
                      <span className="story-node-name">@{rival.username}</span>
                    </button>
                  );
                })}

                {/* Active World Raid Boss Nodes (1-Tap Raid Strike) */}
                {mmoState.zones.slice(0, 2).map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    className="story-node"
                    onClick={() => handleRaidBossStrike(zone)}
                  >
                    <div className="story-avatar-ring raid">
                      <div className="story-avatar-inner">
                        <img src={zone.raidBoss.imageUrl} alt={zone.raidBoss.name} />
                      </div>
                      <span
                        className="story-tag-pill"
                        style={{ background: '#a855f7' }}
                      >
                        RAID
                      </span>
                    </div>
                    <span className="story-node-name">{zone.raidBoss.name}</span>
                  </button>
                ))}
              </div>

              {/* 2. Collapsible Mobile Active Squad Command Bar */}
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
                        color: 'var(--gold-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Active 4-Card Formation · {playerSynergies.length} Synergies
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.96rem',
                        fontWeight: 700,
                      }}
                    >
                      {player.displayName}&apos;s Squad
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

                {/* 4 Mini Portrait Slots (Tapping goes to Sanctum) */}
                <div className="mini-squad-slots">
                  {playerSquad.map((c, idx) => (
                    <div
                      key={c.id}
                      className="mini-slot"
                      onClick={() => setActiveTab('sanctum')}
                      title={`Slot ${idx + 1}: ${c.title}`}
                    >
                      <img src={c.imageUrl} alt={c.title} />
                      <div className="mini-slot-label">
                        S{idx + 1} · {c.element}
                      </div>
                    </div>
                  ))}
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
                          <strong style={{ color: 'var(--gold-bright)' }}>✦ {syn.name}:</strong>{' '}
                          <span style={{ color: 'var(--text-secondary)' }}>{syn.description}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                      <button
                        type="button"
                        className="btn btn-gold"
                        onClick={() => setActiveTab('sanctum')}
                      >
                        <Shield size={14} /> Edit Squad
                      </button>
                      <button
                        type="button"
                        className="btn btn-surface"
                        onClick={() => setActiveTab('world')}
                      >
                        <Globe size={14} /> Rift Atlas
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* 3. Mobile-First Vertical Social Feed Posts */}
              {mmoState.posts.map((post) => {
                const card = mmoState.cards.find((c) => c.id === post.cardId);
                const postAuthor =
                  mmoState.players.find((p) => p.id === post.authorId) || rivals[0];
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

                      <span className={`faction-tag faction-${post.authorFaction}`}>
                        {post.authorFaction}
                      </span>
                    </div>

                    {/* Caption */}
                    <p style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                      {post.caption}
                    </p>

                    {/* Full-Width Collectible Combat Card */}
                    <CombatCardView card={card} compact={false} />

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

                      {postAuthor && (
                        <button
                          type="button"
                          className="btn btn-crimson"
                          onClick={() => handleChallengePlayer(postAuthor, 'pvp')}
                          id={`challenge-post-${post.id}`}
                          style={{ padding: '0.5rem 0.65rem', fontSize: '0.76rem' }}
                        >
                          <Swords size={14} />
                          <span>Challenge Squad</span>
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
                          View all {post.comments.length} war-comms...
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
                          placeholder="Transmit war-comm..."
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
              })}
            </div>

            {/* Desktop Wide-Mode Sticky Sidebar */}
            {!mobileShellMode && (
              <aside
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.1rem',
                  position: 'sticky',
                  top: '4.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                    Active Formation
                  </h2>
                  <span className="card-power-badge">⚔ {totalSquadPower}</span>
                </div>
                <div className="mini-squad-slots">
                  {playerSquad.map((c, idx) => (
                    <div key={c.id} className="mini-slot" onClick={() => setActiveTab('sanctum')}>
                      <img src={c.imageUrl} alt={c.title} />
                      <div className="mini-slot-label">
                        S{idx + 1} · {c.element}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => setActiveTab('sanctum')}
                >
                  <Shield size={14} /> Manage Squad & Vault
                </button>
              </aside>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 2: SOUL-LENS FORGE (MOBILE CAMERA + PHOTO FORGING)
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
                Optical EXIF & RGB Spectrum Forge
              </span>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.55rem' }}>
                Soul-Lens Camera Forge
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                Snap a camera photo or pick from your gallery. RGB color channels and EXIF stats
                (Shutter = Speed, Aperture = Crit/DEF, Focal Length = Role) mint a Combat Card.
              </p>
            </div>

            {/* Dual Mobile Camera + Gallery Trigger Card */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) {
                  handleSelectForgeFile(e.dataTransfer.files[0]);
                }
              }}
              style={{
                border: '1.5px dashed var(--border-gold)',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.35rem 1rem',
                textAlign: 'center',
                cursor: 'pointer',
              }}
              id="soul-lens-dropzone"
            >
              {/* Standard Gallery Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/tiff"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleSelectForgeFile(e.target.files[0]);
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
                  if (e.target.files?.[0]) {
                    handleSelectForgeFile(e.target.files[0]);
                  }
                  e.target.value = '';
                }}
              />

              <UploadCloud
                size={30}
                style={{ color: 'var(--gold-bright)', marginBottom: '0.4rem' }}
              />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                Bind a Photograph into a Combat Card
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.64rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.2rem',
                  marginBottom: '0.85rem',
                }}
              >
                Auto WebP/AVIF Optimization (&lt;2.8 MB Vercel-Safe)
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
                  <UploadCloud size={15} /> Photo Gallery
                </button>
              </div>
            </div>

            {/* 1-Tap Touch Scrollable Anomaly Scanner Strip */}
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.64rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  marginBottom: '0.4rem',
                }}
              >
                Or 1-Tap Scan Procedural Anomaly:
              </div>
              <div className="h-scroll-strip">
                <button
                  type="button"
                  className="btn btn-surface"
                  onClick={() => handleSynthesizeAnomaly('solar')}
                  id="scan-anomaly-solar-btn"
                >
                  <Wand2 size={13} style={{ color: 'var(--elem-solar)' }} /> Solar Obelisk
                </button>
                <button
                  type="button"
                  className="btn btn-surface"
                  onClick={() => handleSynthesizeAnomaly('abyssal')}
                  id="scan-anomaly-abyssal-btn"
                >
                  <Wand2 size={13} style={{ color: 'var(--elem-abyssal)' }} /> Abyssal Trench
                </button>
                <button
                  type="button"
                  className="btn btn-surface"
                  onClick={() => handleSynthesizeAnomaly('crimson')}
                  id="scan-anomaly-crimson-btn"
                >
                  <Wand2 size={13} style={{ color: 'var(--elem-crimson)' }} /> Crimson Spire
                </button>
                <button
                  type="button"
                  className="btn btn-surface"
                  onClick={() => handleSynthesizeAnomaly('verdant')}
                  id="scan-anomaly-verdant-btn"
                >
                  <Wand2 size={13} style={{ color: 'var(--elem-verdant)' }} /> Verdant Spore
                </button>
              </div>
            </div>

            {/* Mobile Single-Column Staged Photo Sheet */}
            {stagedFile && (
              <form
                onSubmit={handleForgeSubmit}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-gold)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                {stagedPreview && (
                  <div style={{ position: 'relative' }}>
                    <img
                      src={stagedPreview}
                      alt="Staged preview"
                      style={{
                        width: '100%',
                        aspectRatio: '16 / 10',
                        objectFit: 'cover',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    />
                    <span
                      className="card-pill"
                      style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem' }}
                    >
                      {formatBytes(stagedFile.size)}
                    </span>
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
                    Combat Card Name
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
                    Chromastream Battle Cry / Caption
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Challenge rival Lumenmancers..."
                    value={forgeCaption}
                    onChange={(e) => setForgeCaption(e.target.value)}
                  />
                </div>

                {/* Touch-Friendly Segmented Squad Slot Picker */}
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
                    Equip Directly to Squad Slot
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 1fr)',
                      gap: '0.35rem',
                    }}
                  >
                    {[
                      { val: '0', label: 'Slot 1' },
                      { val: '1', label: 'Slot 2' },
                      { val: '2', label: 'Slot 3' },
                      { val: '3', label: 'Slot 4' },
                      { val: '', label: 'Vault' },
                    ].map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        className="btn btn-surface"
                        style={{
                          padding: '0.4rem 0.2rem',
                          fontSize: '0.72rem',
                          borderColor:
                            forgeEquipSlot === opt.val ? 'var(--gold-bright)' : undefined,
                          color: forgeEquipSlot === opt.val ? 'var(--gold-bright)' : undefined,
                        }}
                        onClick={() => setForgeEquipSlot(opt.val)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={forgeShareFeed}
                    onChange={(e) => setForgeShareFeed(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span>Share newly forged card to Chromastream Feed</span>
                </label>

                <button
                  type="submit"
                  className="btn btn-gold"
                  disabled={forging}
                  id="submit-forge-card-btn"
                  style={{ width: '100%', padding: '0.8rem' }}
                >
                  <Sparkles size={16} />
                  <span>
                    {forging
                      ? forgeStatusText || 'Forging Card...'
                      : 'Forge Combat Card (+120 Lumen, +4 Shards)'}
                  </span>
                </button>
              </form>
            )}

            {/* Newly Forged Card Showcase */}
            {lastForgedCard && (
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--gold-bright)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
                id="forged-card-result"
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: 'var(--gold-bright)',
                    textTransform: 'uppercase',
                  }}
                >
                  ✦ Soul-Lens Forging Complete · -{lastForgedCard.savingsPercent}% Web Optimized
                </div>

                <CombatCardView card={lastForgedCard} />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-crimson"
                    onClick={() => {
                      if (rivals[0]) handleChallengePlayer(rivals[0], 'pvp');
                    }}
                  >
                    <Swords size={14} /> Battle Test
                  </button>
                  <button
                    type="button"
                    className="btn btn-surface"
                    onClick={() => setActiveTab('feed')}
                  >
                    View in Stream
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            TAB 3: SQUAD & SANCTUM (2x2 MOBILE FORMATION + VAULT)
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
                      color: 'var(--gold-primary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Active 4-Card Formation
                  </span>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
                    Battle Squad
                  </h1>
                </div>
                <span className="card-power-badge">⚔ {totalSquadPower}</span>
              </div>

              {/* Horizontally Scrollable Synergy Pills */}
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

              <div className="sanctum-squad-grid">
                {playerSquad.map((card, idx) => (
                  <CombatCardView
                    key={card.id}
                    card={card}
                    compact={true}
                    slotBadge={`S${idx + 1} ${idx === 0 ? 'FRONT' : idx === 3 ? 'BACK' : 'MID'}`}
                  />
                ))}
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
                  Sanctum Vault ({filteredVaultCards.length})
                </h2>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Tap Slot 1–4 to equip
                </span>
              </div>

              {/* Touch Filter Pills */}
              <div className="h-scroll-strip" style={{ marginBottom: '0.85rem' }}>
                {(
                  [
                    'ALL',
                    'EQUIPPED',
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

              <div className="sanctum-vault-grid">
                {filteredVaultCards.map((card) => {
                  const inSquadIdx = player.squadCardIds.indexOf(card.id);
                  const levelCost = card.level * 100;

                  return (
                    <CombatCardView
                      key={card.id}
                      card={card}
                      slotBadge={inSquadIdx !== -1 ? `EQUIPPED S${inSquadIdx + 1}` : undefined}
                      footerActions={
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
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
                                  color: inSquadIdx === slot ? 'var(--gold-bright)' : undefined,
                                }}
                                onClick={() => handleAssignToSlot(card.id, slot)}
                              >
                                Slot {slot + 1}
                              </button>
                            ))}
                          </div>

                          {/* Level Up / Foil Ascend / Soul Fuse Buttons */}
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn btn-gold"
                              style={{ flex: 1, padding: '0.45rem', fontSize: '0.74rem' }}
                              onClick={() => handleUpgradeCard(card.id, 'levelup')}
                            >
                              <ArrowUpCircle size={14} /> Lv.Up ({levelCost})
                            </button>
                            <button
                              type="button"
                              className="btn btn-surface"
                              style={{ flex: 1, padding: '0.45rem', fontSize: '0.74rem' }}
                              onClick={() => handleUpgradeCard(card.id, 'ascend')}
                            >
                              <Sparkles size={14} /> Foil (8)
                            </button>
                            {playerCards.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-surface"
                                style={{ padding: '0.45rem 0.65rem', fontSize: '0.74rem' }}
                                onClick={() =>
                                  setFuseTargetCardId((prev) =>
                                    prev === card.id ? null : card.id
                                  )
                                }
                                title="Soul-Fuse another card into this card"
                              >
                                <Layers size={14} />
                              </button>
                            )}
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
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 4: THE RIFT ATLAS (TERRITORY WAR & WORLD RAID BOSSES)
           ========================================================= */}
        {activeTab === 'world' && (
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
                3-Faction Territory War & Co-Op World Bosses
              </span>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.55rem' }}>
                The Rift Atlas
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                Conquer Sector Guardians for the{' '}
                <strong style={{ color: 'var(--gold-bright)' }}>Order of {player.faction}</strong>{' '}
                or launch Raid Strikes against Colossal Bosses.
              </p>
            </div>

            <div className="zones-grid">
              {mmoState.zones.map((zone) => {
                const guardian =
                  mmoState.players.find((p) => p.id === zone.guardianPlayerId) || rivals[0];
                const bossPct = Math.max(
                  0,
                  Math.min(100, Math.round((zone.raidBoss.currentHp / zone.raidBoss.maxHp) * 100))
                );

                return (
                  <article key={zone.id} className="zone-card">
                    <div className="zone-banner">
                      <img src={zone.bannerUrl} alt={zone.name} />
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background:
                            'linear-gradient(to top, rgba(8,9,13,0.95) 12%, rgba(8,9,13,0.25) 100%)',
                          padding: '0.85rem 1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.62rem',
                            color: 'var(--gold-bright)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {zone.subtitle}
                        </div>
                        <h2
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                          }}
                        >
                          <ElementIcon element={zone.element} size={16} />
                          {zone.name}
                        </h2>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '0.9rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        flex: 1,
                      }}
                    >
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {zone.description}
                      </p>

                      {/* Faction Territory Control Bar */}
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.64rem',
                          }}
                        >
                          <span style={{ color: 'var(--elem-solar)' }}>
                            Helios {zone.heliosControl}%
                          </span>
                          <span style={{ color: 'var(--elem-abyssal)' }}>
                            Umbra {zone.umbraControl}%
                          </span>
                          <span style={{ color: 'var(--elem-verdant)' }}>
                            Prism {zone.prismControl}%
                          </span>
                        </div>
                        <div className="faction-control-bar">
                          <div
                            style={{
                              width: `${zone.heliosControl}%`,
                              background: 'var(--elem-solar)',
                            }}
                          />
                          <div
                            style={{
                              width: `${zone.umbraControl}%`,
                              background: 'var(--elem-abyssal)',
                            }}
                          />
                          <div
                            style={{
                              width: `${zone.prismControl}%`,
                              background: 'var(--elem-verdant)',
                            }}
                          />
                        </div>
                      </div>

                      {/* Colossal World Raid Boss Box */}
                      <div
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.7rem',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.2rem',
                          }}
                        >
                          <strong style={{ color: '#f87171', fontSize: '0.82rem' }}>
                            ☠ {zone.raidBoss.name}
                          </strong>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.65rem',
                              color: 'var(--gold-bright)',
                            }}
                          >
                            {zone.raidBoss.currentHp.toLocaleString()} HP
                          </span>
                        </div>
                        <div className="hp-bar-track" style={{ marginBottom: '0.4rem' }}>
                          <div
                            className="hp-bar-fill enemy"
                            style={{ width: `${bossPct}%` }}
                          />
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          <strong>{zone.raidBoss.abilityName}:</strong> {zone.raidBoss.abilityDesc}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        {guardian && (
                          <button
                            type="button"
                            className="btn btn-surface"
                            style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                            onClick={() =>
                              handleChallengePlayer(guardian, 'territory', zone.id)
                            }
                          >
                            <Swords size={14} /> Conquer (+6%)
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-crimson"
                          style={{ fontSize: '0.75rem', padding: '0.5rem' }}
                          onClick={() => handleRaidBossStrike(zone)}
                        >
                          <Flame size={14} /> Raid (+{zone.raidBoss.rewardLumen})
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 5: ARENA RANKS & MOBILE PANTHEON LEADERBOARD
           ========================================================= */}
        {activeTab === 'leaderboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
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
                Grand Auto-Arena Standings
              </span>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.55rem' }}>
                Pantheon Leaderboard
              </h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {[...mmoState.players]
                .sort((a, b) => b.eloRating - a.eloRating)
                .map((p, idx) => {
                  const pSquad = p.squadCardIds
                    .map((cid) => mmoState.cards.find((c) => c.id === cid))
                    .filter((c): c is MmoCard => Boolean(c));
                  const pPower = pSquad.reduce((s, c) => s + c.powerRating, 0);

                  return (
                    <div
                      key={p.id}
                      style={{
                        background: 'var(--bg-elevated)',
                        border: `1px solid ${
                          p.id === player.id ? 'var(--gold-bright)' : 'var(--border-subtle)'
                        }`,
                        borderRadius: 'var(--radius-md)',
                        padding: '0.85rem 0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.65rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.7rem',
                          minWidth: 0,
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.15rem',
                            fontWeight: 800,
                            color: idx === 0 ? 'var(--gold-bright)' : 'var(--text-muted)',
                            width: '26px',
                            flexShrink: 0,
                          }}
                        >
                          #{idx + 1}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              flexWrap: 'wrap',
                            }}
                          >
                            <strong style={{ fontSize: '0.92rem' }}>{p.displayName}</strong>
                            <span className={`faction-tag faction-${p.faction}`}>
                              {p.faction}
                            </span>
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.64rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            @{p.username} · ⚔ {pPower} · {p.wins}W/{p.losses}L
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          flexShrink: 0,
                        }}
                      >
                        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          <div
                            style={{
                              color: 'var(--gold-bright)',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                            }}
                          >
                            {p.eloRating}
                          </div>
                          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>
                            ELO
                          </div>
                        </div>

                        {p.id !== player.id && (
                          <button
                            type="button"
                            className="btn btn-crimson"
                            style={{ minHeight: '36px', padding: '0.4rem 0.65rem', fontSize: '0.74rem' }}
                            onClick={() => handleChallengePlayer(p, 'pvp')}
                          >
                            <Swords size={13} /> Duel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
            <span>Sanctum</span>
            <span className="nav-badge-count">{playerCards.length}</span>
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
            <Globe size={19} />
            <span>Atlas</span>
          </button>

          <button
            type="button"
            className={`bottom-nav-item ${activeTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboard')}
            id="nav-tab-leaderboard"
          >
            <Trophy size={19} />
            <span>Ranks</span>
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
    </div>
  );
}

export default App;
