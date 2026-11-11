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
} from 'lucide-react';
import {
  formatBytes,
  type MmoState,
  type MmoCard,
  type MmoPlayer,
  type MmoWorldZone,
  type FactionId,
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

  const [mmoState, setMmoState] = useState<MmoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

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
        // Merge any locally forged cards if serverless container cold-started
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
        ? `Victory! +${mode === 'territory' ? 180 : 140} Lumen Dust · +${
            mode === 'territory' ? 5 : 3
          } Chromatic Shards · +24 Arena Elo`
        : `Defeat · +45 Lumen Dust · Recalibrate your squad order or upgrade cards in the Sanctum.`
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
      `Raid Strike Inflicted ${sim.totalDamageDealt.toLocaleString()} Damage to ${
        boss.name
      }! Earned +${boss.rewardLumen} Lumen Dust & +${boss.rewardShards} Chromatic Shards.`
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
      showToast('⚡ Hype Resonance surging! Card HP & ATK permanently buffed (+15 Lumen Dust).');
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

  // Synthesize a high-res procedural anomaly photo in-browser for 1-click forging test
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

    // Radiant focal core
    const rad = ctx.createRadialGradient(900, 540, 30, 900, 540, 520);
    rad.addColorStop(0, c2);
    rad.addColorStop(0.45, c1);
    rad.addColorStop(1, 'transparent');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Geometric monolith silhouette
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
    setForgeStatusText(
      'Extracting optical EXIF & pre-optimizing master frame (< 2.8 MB Vercel-safe)...'
    );

    try {
      const prepared = await preparePhotoForUpload(stagedFile);
      const fname = prepared.uploadFile.name;

      setForgeStatusText(
        'Analyzing RGB color spectrum, generating AVIF/WebP plates & forging combat stats...'
      );

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
          `✦ Forged [${created?.rarity}] ${created?.title} (${created?.element} ${created?.role})! +120 Lumen Dust & +4 Shards`
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
    // Remove if already in another slot
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
      showToast(`Assigned plate to Formation Slot ${slotIdx + 1}.`);
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
          ? `✦ Level Up! ${data.card.title} reached Lv.${data.card.level} (Power ${data.card.powerRating}).`
          : action === 'ascend'
          ? `✦ Foil Ascension! ${data.card.title} ascended to ${data.card.foil} Foil!`
          : `✦ Soul Fusion Complete! Imprinted secondary trait onto ${data.card.title}!`
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
      showToast(`Pledged allegiance to the ${faction} Faction!`);
    }
  };

  if (loading || !mmoState || !player) {
    return (
      <div className="mmo-container">
        <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          Initializing CHROMARIFT Photo-Combat MMO...
        </p>
      </div>
    );
  }

  const rivals = mmoState.players.filter((p) => p.id !== player.id);

  return (
    <div>
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 1100,
            background: 'var(--bg-surface)',
            border: '1px solid var(--gold-bright)',
            color: 'var(--text-primary)',
            padding: '0.85rem 1.2rem',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.84rem',
          }}
        >
          <CheckCircle2 size={16} style={{ color: 'var(--gold-bright)' }} />
          <span>{toast}</span>
        </div>
      )}

      {/* Sticky Top MMO HUD Header */}
      <header className="mmo-hud-header">
        <div className="hud-inner">
          <div
            className="brand-crest"
            onClick={() => setActiveTab('feed')}
            id="chromarift-home-brand"
          >
            <div className="brand-emblem">
              <Swords size={20} />
            </div>
            <div>
              <div className="brand-title">CHROMARIFT</div>
              <div className="brand-subtitle">Photo-Combat Social MMO</div>
            </div>
          </div>

          <nav className="hud-nav" aria-label="MMO Primary Navigation">
            <button
              type="button"
              className={`hud-tab ${activeTab === 'feed' ? 'active' : ''}`}
              onClick={() => setActiveTab('feed')}
              id="nav-tab-feed"
            >
              <Zap size={15} /> Chromastream
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'forge' ? 'active' : ''}`}
              onClick={() => setActiveTab('forge')}
              id="nav-tab-forge"
            >
              <UploadCloud size={15} /> Forge Photo
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'sanctum' ? 'active' : ''}`}
              onClick={() => setActiveTab('sanctum')}
              id="nav-tab-sanctum"
            >
              <Shield size={15} /> Squad & Sanctum ({playerCards.length})
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'world' ? 'active' : ''}`}
              onClick={() => setActiveTab('world')}
              id="nav-tab-world"
            >
              <Globe size={15} /> Rift Atlas & Raids
            </button>
            <button
              type="button"
              className={`hud-tab ${activeTab === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('leaderboard')}
              id="nav-tab-leaderboard"
            >
              <Trophy size={15} /> Arena Ranks
            </button>
          </nav>

          <div className="hud-resources">
            <div className="resource-pill" title="Lumen Dust (Used to Level Up Cards)">
              <Sparkles size={13} style={{ color: 'var(--gold-bright)' }} />
              <span>Lumen:</span>
              <strong>{player.lumenDust}</strong>
            </div>
            <div className="resource-pill" title="Chromatic Shards (Used for Foil Ascension)">
              <Flame size={13} style={{ color: 'var(--elem-astral)' }} />
              <span>Shards:</span>
              <strong style={{ color: 'var(--elem-astral)' }}>{player.chromaticShards}</strong>
            </div>
            <div className="resource-pill" title="Arena Rating & Level">
              <span>Lv.{player.level}</span>
              <span>·</span>
              <strong>{player.eloRating} ELO</strong>
            </div>
          </div>
        </div>
      </header>

      <main className="mmo-container">
        {/* TAB 1: THE CHROMASTREAM (SOCIAL FEED + INSTANT SQUAD CHALLENGES) */}
        {activeTab === 'feed' && (
          <div className="feed-layout">
            <div className="feed-stream">
              {/* Top Callout Banner */}
              <div
                style={{
                  background:
                    'linear-gradient(135deg, hsla(38, 62%, 50%, 0.14), hsla(354, 70%, 50%, 0.1))',
                  border: '1px solid var(--border-gold)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      color: 'var(--gold-bright)',
                    }}
                  >
                    Season I · The Optical Convergence
                  </div>
                  <h1
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.65rem',
                      marginTop: '0.15rem',
                    }}
                  >
                    Upload Photographs. Forge Relics. Conquer the Rift.
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                    Every photo you upload is analyzed for RGB color aura and camera EXIF telemetry
                    to mint a combat card. Hype posts to buff their stats, or challenge any player’s
                    squad!
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-gold"
                    onClick={() => setActiveTab('forge')}
                    id="hero-forge-photo-cta"
                  >
                    <UploadCloud size={15} /> Upload & Forge Photo Card
                  </button>
                  <button
                    type="button"
                    className="btn btn-crimson"
                    onClick={() => {
                      const randomRival = rivals[0];
                      if (randomRival) handleChallengePlayer(randomRival, 'pvp');
                    }}
                    id="hero-quick-battle-cta"
                  >
                    <Swords size={15} /> Quick Auto-Battle
                  </button>
                </div>
              </div>

              {/* Feed Posts */}
              {mmoState.posts.map((post) => {
                const card = mmoState.cards.find((c) => c.id === post.cardId);
                const postAuthor =
                  mmoState.players.find((p) => p.id === post.authorId) || rivals[0];
                if (!card) return null;

                return (
                  <article key={post.id} className="feed-post-card">
                    <CombatCardView card={card} compact={false} />

                    <div className="post-meta-col">
                      <div className="post-author-row">
                        <div className="author-badge">
                          <div className="author-avatar">
                            {post.authorName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.94rem' }}>
                              {post.authorName}
                            </div>
                            <div
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.68rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              @{post.authorHandle} · {post.createdAt}
                            </div>
                          </div>
                        </div>

                        <span className={`faction-tag faction-${post.authorFaction}`}>
                          Order of {post.authorFaction}
                        </span>
                      </div>

                      <p style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                        {post.caption}
                      </p>

                      {/* Alchemical Spectrum Telemetry Strip */}
                      <div
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.65rem 0.85rem',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.69rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                        }}
                      >
                        <span>
                          RGB Aura: R{card.colorTelemetry.r} · G{card.colorTelemetry.g} · B
                          {card.colorTelemetry.b}
                        </span>
                        <span>Contrast: {card.colorTelemetry.contrast}</span>
                        <span style={{ color: '#4ade80' }}>
                          Web Optimized: -{card.savingsPercent}% ({formatBytes(card.optimizedSizeBytes)})
                        </span>
                      </div>

                      <div className="post-actions-bar">
                        <button
                          type="button"
                          className="btn btn-surface"
                          onClick={() => handleHypePost(post.id)}
                          id={`hype-post-${post.id}`}
                        >
                          <Zap size={14} style={{ color: 'var(--gold-bright)' }} />
                          Hype Resonance ({post.hypeCount}) · +Stat Buff
                        </button>

                        {postAuthor && (
                          <button
                            type="button"
                            className="btn btn-crimson"
                            onClick={() => handleChallengePlayer(postAuthor, 'pvp')}
                            id={`challenge-post-${post.id}`}
                          >
                            <Swords size={14} /> Challenge @{post.authorHandle}&apos;s Squad
                          </button>
                        )}
                      </div>

                      {/* Comments Section */}
                      <div className="comments-box">
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.66rem',
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <MessageSquare size={11} /> Chromastream War-Comms (
                          {post.comments.length})
                        </div>

                        {post.comments.map((c) => (
                          <div key={c.id} style={{ fontSize: '0.8rem' }}>
                            <strong style={{ color: 'var(--gold-bright)' }}>
                              @{c.authorHandle}:
                            </strong>{' '}
                            <span style={{ color: 'var(--text-secondary)' }}>{c.text}</span>
                          </div>
                        ))}

                        <form
                          onSubmit={(e) => handleAddComment(e, post.id)}
                          style={{ display: 'flex', gap: '0.45rem', marginTop: '0.35rem' }}
                        >
                          <input
                            type="text"
                            className="form-input"
                            style={{ padding: '0.42rem 0.65rem', fontSize: '0.78rem' }}
                            placeholder="Transmit war-comm or compliment..."
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
                            style={{ padding: '0.42rem 0.75rem' }}
                          >
                            <Send size={13} />
                          </button>
                        </form>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Right Sticky Active Squad & Synergy Command Sidebar */}
            <aside className="squad-sidebar-panel">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.66rem',
                      color: 'var(--gold-primary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Active Auto-Battle Formation
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
                    {player.displayName}&apos;s Squad
                  </h2>
                </div>
                <span className="card-power-badge">⚔ {totalSquadPower}</span>
              </div>

              {/* Faction Switcher */}
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
                      opacity: player.faction === fac ? 1 : 0.45,
                      fontWeight: player.faction === fac ? 700 : 400,
                    }}
                  >
                    {fac}
                  </button>
                ))}
              </div>

              <div className="mini-squad-slots">
                {playerSquad.map((c, idx) => (
                  <div key={c.id} className="mini-slot" title={`Slot ${idx + 1}: ${c.title}`}>
                    <img src={c.imageUrl} alt={c.title} />
                    <div className="mini-slot-label">
                      S{idx + 1} · {c.element}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.66rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    marginBottom: '0.45rem',
                  }}
                >
                  Active Formation Synergies ({playerSynergies.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {playerSynergies.map((syn) => (
                    <div
                      key={syn.id}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.45rem 0.65rem',
                        fontSize: '0.75rem',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--gold-bright)' }}>
                        ✦ {syn.name}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                        {syn.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => setActiveTab('sanctum')}
                >
                  <Shield size={14} /> Edit Squad & Upgrade Cards
                </button>
                <button
                  type="button"
                  className="btn btn-surface"
                  onClick={() => setActiveTab('world')}
                >
                  <Globe size={14} /> Enter Rift Atlas & Raid Bosses
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* TAB 2: SOUL-LENS FORGE (PHOTO UPLOAD -> COMBAT CARD MINTING) */}
        {activeTab === 'forge' && (
          <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--gold-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                Optical Alchemy & WebP/AVIF Pipeline
              </span>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.1rem' }}>
                The Soul-Lens Forge
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                Upload any photograph. Our engine extracts its RGB color spectrum, contrast entropy,
                and camera EXIF telemetry (Shutter Speed = Speed, Aperture = Crit/DEF, Focal Length
                = Combat Role, ISO = Attack Scaling) to mint a web-optimized Combat Card.
              </p>
            </div>

            {/* Quick Anomaly Scanner Buttons for instant testing */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.6rem',
                marginBottom: '1.25rem',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                }}
              >
                Or Scan Procedural Camera Anomaly:
              </span>
              <button
                type="button"
                className="btn btn-surface"
                onClick={() => handleSynthesizeAnomaly('solar')}
                id="scan-anomaly-solar-btn"
              >
                <Wand2 size={14} style={{ color: 'var(--elem-solar)' }} /> Scan Solar Anomaly
              </button>
              <button
                type="button"
                className="btn btn-surface"
                onClick={() => handleSynthesizeAnomaly('abyssal')}
                id="scan-anomaly-abyssal-btn"
              >
                <Wand2 size={14} style={{ color: 'var(--elem-abyssal)' }} /> Scan Abyssal Anomaly
              </button>
              <button
                type="button"
                className="btn btn-surface"
                onClick={() => handleSynthesizeAnomaly('crimson')}
                id="scan-anomaly-crimson-btn"
              >
                <Wand2 size={14} style={{ color: 'var(--elem-crimson)' }} /> Scan Crimson Anomaly
              </button>
              <button
                type="button"
                className="btn btn-surface"
                onClick={() => handleSynthesizeAnomaly('verdant')}
                id="scan-anomaly-verdant-btn"
              >
                <Wand2 size={14} style={{ color: 'var(--elem-verdant)' }} /> Scan Verdant Anomaly
              </button>
            </div>

            {/* Dropzone */}
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
                padding: '2.5rem 2rem',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: '1.5rem',
              }}
              id="soul-lens-dropzone"
            >
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
              <UploadCloud
                size={34}
                style={{ color: 'var(--gold-bright)', marginBottom: '0.65rem' }}
              />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem' }}>
                Drop a photograph here to bind its light into a Combat Card
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  marginTop: '0.3rem',
                }}
              >
                JPEG · PNG · WebP · AVIF · Automatic client pre-scaling (&lt;2.8 MB Vercel-safe) +
                Sharp multi-tier WebP/AVIF
              </div>
            </div>

            {stagedFile && (
              <form
                onSubmit={handleForgeSubmit}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-gold)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.5rem',
                  marginBottom: '2rem',
                  display: 'grid',
                  gridTemplateColumns: '220px 1fr',
                  gap: '1.5rem',
                  alignItems: 'start',
                }}
              >
                <div>
                  {stagedPreview && (
                    <img
                      src={stagedPreview}
                      alt="Staged preview"
                      style={{
                        width: '100%',
                        aspectRatio: '4/3',
                        objectFit: 'cover',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    />
                  )}
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                      marginTop: '0.45rem',
                    }}
                  >
                    {stagedFile.name} ({formatBytes(stagedFile.size)})
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  <div>
                    <label
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        display: 'block',
                        marginBottom: '0.3rem',
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
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        display: 'block',
                        marginBottom: '0.3rem',
                      }}
                    >
                      Chromastream Battle Cry / Caption
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Describe the shot or challenge rival Lumenmancers..."
                      value={forgeCaption}
                      onChange={(e) => setForgeCaption(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.68rem',
                          textTransform: 'uppercase',
                          color: 'var(--text-secondary)',
                          display: 'block',
                          marginBottom: '0.3rem',
                        }}
                      >
                        Equip Directly to Squad Formation
                      </label>
                      <select
                        className="form-select"
                        value={forgeEquipSlot}
                        onChange={(e) => setForgeEquipSlot(e.target.value)}
                      >
                        <option value="0">Slot 1 (Frontline Vanguard)</option>
                        <option value="1">Slot 2 (Mid-Front Bruiser)</option>
                        <option value="2">Slot 3 (Mid-Back Striker)</option>
                        <option value="3">Slot 4 (Backline Arcanist)</option>
                        <option value="">Keep in Sanctum Vault</option>
                      </select>
                    </div>

                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        marginTop: '1.3rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={forgeShareFeed}
                        onChange={(e) => setForgeShareFeed(e.target.checked)}
                      />
                      <span>Post to Chromastream Social Feed</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-gold"
                    disabled={forging}
                    id="submit-forge-card-btn"
                    style={{ padding: '0.85rem' }}
                  >
                    <Sparkles size={16} />
                    {forging
                      ? forgeStatusText || 'Forging Combat Card...'
                      : 'Forge Combat Card & Optimize for Web (+120 Lumen, +4 Shards)'}
                  </button>
                </div>
              </form>
            )}

            {/* Newly Forged Card Showcase */}
            {lastForgedCard && (
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--gold-bright)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.5rem',
                  display: 'grid',
                  gridTemplateColumns: '320px 1fr',
                  gap: '1.5rem',
                  alignItems: 'center',
                }}
                id="forged-card-result"
              >
                <CombatCardView card={lastForgedCard} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      color: 'var(--gold-bright)',
                      textTransform: 'uppercase',
                    }}
                  >
                    ✦ Soul-Lens Forging Complete · Alchemical Telemetry
                  </div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem' }}>
                    {lastForgedCard.title} ({lastForgedCard.rarity} {lastForgedCard.element}{' '}
                    {lastForgedCard.role})
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Derived from RGB mean ({lastForgedCard.colorTelemetry.r},{' '}
                    {lastForgedCard.colorTelemetry.g}, {lastForgedCard.colorTelemetry.b}) and
                    contrast index {lastForgedCard.colorTelemetry.contrast}. Web payload compressed
                    from {formatBytes(lastForgedCard.originalSizeBytes)} to{' '}
                    {formatBytes(lastForgedCard.optimizedSizeBytes)} (-
                    {lastForgedCard.savingsPercent}%).
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-crimson"
                      onClick={() => {
                        if (rivals[0]) handleChallengePlayer(rivals[0], 'pvp');
                      }}
                    >
                      <Swords size={15} /> Test New Card in Auto-Battle
                    </button>
                    <button
                      type="button"
                      className="btn btn-surface"
                      onClick={() => setActiveTab('feed')}
                    >
                      View on Chromastream Feed
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SQUAD & CARD SANCTUM (DECK BUILDER, LEVEL UP, FOIL ASCENSION & SOUL FUSION) */}
        {activeTab === 'sanctum' && (
          <div>
            {/* Active 4-Card Formation Builder */}
            <div
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-gold)',
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem',
                marginBottom: '2rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      color: 'var(--gold-primary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Pre-Battle Tactical Configuration · Total Power ⚔ {totalSquadPower}
                  </span>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.85rem' }}>
                    Active 4-Card Auto-Battle Formation
                  </h1>
                </div>

                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
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
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '1.15rem',
                }}
              >
                {playerSquad.map((card, idx) => (
                  <CombatCardView
                    key={card.id}
                    card={card}
                    slotBadge={`SLOT ${idx + 1} · ${
                      idx === 0 ? 'FRONTLINE' : idx === 3 ? 'BACKLINE' : 'MIDLINE'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Full Card Collection & Upgrades */}
            <div style={{ marginBottom: '1rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem' }}>
                Sanctum Vault & Relic Ascension ({playerCards.length} Cards)
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Spend Lumen Dust to Level Up, Chromatic Shards to Foil-Ascend (Holo → Prismatic →
                Mythic Relic), or Soul-Fuse spare cards to imprint secondary optical traits.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(305px, 1fr))',
                gap: '1.35rem',
              }}
            >
              {playerCards.map((card) => {
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
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.3rem' }}>
                          {[0, 1, 2, 3].map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              className="btn btn-surface"
                              style={{
                                padding: '0.3rem',
                                fontSize: '0.7rem',
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
                            style={{ flex: 1, padding: '0.45rem', fontSize: '0.73rem' }}
                            onClick={() => handleUpgradeCard(card.id, 'levelup')}
                          >
                            <ArrowUpCircle size={13} /> Lv.Up ({levelCost} Lumen)
                          </button>
                          <button
                            type="button"
                            className="btn btn-surface"
                            style={{ flex: 1, padding: '0.45rem', fontSize: '0.73rem' }}
                            onClick={() => handleUpgradeCard(card.id, 'ascend')}
                          >
                            <Sparkles size={13} /> Foil (8 Shards)
                          </button>
                          {playerCards.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-surface"
                              style={{ padding: '0.45rem 0.6rem', fontSize: '0.73rem' }}
                              onClick={() => setFuseTargetCardId(card.id)}
                              title="Soul-Fuse another card into this card"
                            >
                              <Layers size={13} />
                            </button>
                          )}
                        </div>

                        {fuseTargetCardId === card.id && (
                          <div
                            style={{
                              background: 'var(--bg-void)',
                              border: '1px solid var(--border-gold)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.6rem',
                              marginTop: '0.25rem',
                            }}
                          >
                            <div
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.65rem',
                                color: 'var(--gold-bright)',
                                marginBottom: '0.35rem',
                              }}
                            >
                              Select Card to Sacrifice (+18% Stats + Trait Imprint):
                            </div>
                            <select
                              className="form-select"
                              style={{ marginBottom: '0.4rem', fontSize: '0.75rem' }}
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
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <button
                                type="button"
                                className="btn btn-crimson"
                                style={{ flex: 1, padding: '0.35rem', fontSize: '0.72rem' }}
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
                                style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem' }}
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
        )}

        {/* TAB 4: THE RIFT ATLAS (MMO WORLD TERRITORY WAR & COLOSSAL RAID BOSSES) */}
        {activeTab === 'world' && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--gold-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                Persistent 3-Faction Territory War & Co-Op World Bosses
              </span>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.1rem' }}>
                The Rift Atlas
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
                Deploy your 4-card squad to conquer Sector Guardians for the{' '}
                <strong style={{ color: 'var(--gold-bright)' }}>Order of {player.faction}</strong>{' '}
                or launch Raid Strikes against Colossal World Bosses.
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
                            'linear-gradient(to top, rgba(8,9,13,0.95) 10%, rgba(8,9,13,0.25) 100%)',
                          padding: '1rem 1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.68rem',
                            color: 'var(--gold-bright)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {zone.subtitle}
                        </div>
                        <h2
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                          }}
                        >
                          <ElementIcon element={zone.element} size={18} />
                          {zone.name}
                        </h2>
                      </div>
                    </div>

                    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                        {zone.description}
                      </p>

                      {/* Faction Territory Control Bar */}
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.68rem',
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
                          padding: '0.85rem',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <strong style={{ color: '#f87171', fontSize: '0.86rem' }}>
                            ☠ {zone.raidBoss.name}
                          </strong>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.7rem',
                              color: 'var(--gold-bright)',
                            }}
                          >
                            {zone.raidBoss.currentHp.toLocaleString()} /{' '}
                            {zone.raidBoss.maxHp.toLocaleString()} HP
                          </span>
                        </div>
                        <div className="hp-bar-track" style={{ marginBottom: '0.45rem' }}>
                          <div
                            className="hp-bar-fill enemy"
                            style={{ width: `${bossPct}%` }}
                          />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          <strong>{zone.raidBoss.abilityName}:</strong> {zone.raidBoss.abilityDesc}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.6rem', marginTop: 'auto' }}>
                        {guardian && (
                          <button
                            type="button"
                            className="btn btn-surface"
                            style={{ flex: 1 }}
                            onClick={() =>
                              handleChallengePlayer(guardian, 'territory', zone.id)
                            }
                          >
                            <Swords size={14} /> Conquer Sector (+6% {player.faction})
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-crimson"
                          style={{ flex: 1 }}
                          onClick={() => handleRaidBossStrike(zone)}
                        >
                          <Flame size={14} /> Raid Boss (+{zone.raidBoss.rewardLumen} Lumen)
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: ARENA RANKS & GLOBAL MMO LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <div style={{ maxWidth: '980px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1.5rem' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--gold-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                }}
              >
                Grand Auto-Arena Standings
              </span>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.1rem' }}>
                Chromarift Pantheon Leaderboard
              </h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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
                        padding: '1rem 1.35rem',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '1.4rem',
                            fontWeight: 800,
                            color: idx === 0 ? 'var(--gold-bright)' : 'var(--text-muted)',
                            width: '32px',
                          }}
                        >
                          #{idx + 1}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong style={{ fontSize: '1rem' }}>{p.displayName}</strong>
                            <span className={`faction-tag faction-${p.faction}`}>
                              {p.faction}
                            </span>
                            {p.id === player.id && (
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '0.65rem',
                                  color: 'var(--gold-bright)',
                                }}
                              >
                                (YOU)
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            @{p.username} · {p.title} · Lv.{p.level} · {p.wins}W / {p.losses}L
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          <div style={{ color: 'var(--gold-bright)', fontWeight: 700 }}>
                            {p.eloRating} ELO
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                            Squad Power: ⚔ {pPower}
                          </div>
                        </div>

                        {p.id !== player.id && (
                          <button
                            type="button"
                            className="btn btn-crimson"
                            onClick={() => handleChallengePlayer(p, 'pvp')}
                          >
                            <Swords size={14} /> Challenge
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
