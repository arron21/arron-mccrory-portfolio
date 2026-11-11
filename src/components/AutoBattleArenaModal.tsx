import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  FastForward,
  SkipForward,
  Trophy,
  Swords,
  Shield,
  Sparkles,
  ScrollText,
  StepForward,
  X,
} from 'lucide-react';
import type { AutoBattleSimulation, CombatUnitState } from '../utils/autoBattler.ts';
import { ElementIcon } from './CombatCardView.tsx';

interface AutoBattleArenaModalProps {
  simulation: AutoBattleSimulation;
  rewardSummary?: string;
  onClose: () => void;
}

export const AutoBattleArenaModal: React.FC<AutoBattleArenaModalProps> = ({
  simulation,
  rewardSummary,
  onClose,
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [showLog, setShowLog] = useState(false);

  const step = simulation.steps[currentIdx] || simulation.steps[0];
  const isFinished = currentIdx >= simulation.steps.length - 1;
  const progressPct = Math.round(((currentIdx + 1) / simulation.steps.length) * 100);

  useEffect(() => {
    if (!playing || isFinished) return;
    const delay = speed === 4 ? 220 : speed === 2 ? 480 : 900;
    const timer = setTimeout(() => {
      setCurrentIdx((prev) => Math.min(simulation.steps.length - 1, prev + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [playing, isFinished, speed, currentIdx, simulation.steps.length]);

  const renderUnitSlot = (unit: CombatUnitState) => {
    const isActing = step.actorInstanceId === unit.instanceId && step.type !== 'end';
    const isTargeted = step.targetInstanceId === unit.instanceId && step.type !== 'end';
    const hpPct = Math.max(0, Math.min(100, Math.round((unit.hp / unit.maxHp) * 100)));

    return (
      <div
        key={unit.instanceId}
        className={`arena-unit-card ${isActing ? 'acting' : ''} ${
          isTargeted ? 'targeted' : ''
        } ${!unit.alive ? 'dead' : ''}`}
      >
        <div className="unit-art">
          <img src={unit.imageUrl} alt={unit.title} />
          <div
            style={{
              position: 'absolute',
              top: '0.25rem',
              left: '0.25rem',
              right: '0.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.56rem',
            }}
          >
            <span
              className="card-pill"
              style={{ padding: '0.1rem 0.32rem', fontSize: '0.55rem' }}
            >
              <ElementIcon element={unit.element} size={10} />
              <span>S{unit.slotIndex + 1}</span>
            </span>
            {unit.shield > 0 && (
              <span
                className="card-pill"
                style={{
                  padding: '0.1rem 0.3rem',
                  fontSize: '0.54rem',
                  color: '#60a5fa',
                  borderColor: 'rgba(96,165,250,0.45)',
                }}
              >
                <Shield size={9} />+{unit.shield}
              </span>
            )}
          </div>

          {isTargeted && step.damage && (
            <div className={`floating-pop ${step.isCrit ? 'crit' : ''}`}>
              -{step.damage}
              {step.isCrit ? ' CRIT!' : ''}
            </div>
          )}
          {isActing && step.heal && (
            <div className="floating-pop" style={{ color: '#4ade80' }}>
              +{step.heal} HP
            </div>
          )}
        </div>

        <div style={{ padding: '0.4rem 0.45rem' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.72rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {unit.title}
          </div>

          <div className="hp-bar-track">
            <div
              className={`hp-bar-fill ${unit.side === 'enemy' ? 'enemy' : ''}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.56rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '0.2rem',
            }}
          >
            <span>{unit.hp} HP</span>
            <span>⚔{unit.atk}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="arena-backdrop" id="auto-battle-arena-modal" role="dialog" aria-modal="true">
      {/* Compact Mobile Top Header */}
      <div className="arena-header">
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--gold-primary)',
            }}
          >
            Auto-Arena · Round {step.round} · Tick {currentIdx + 1}/{simulation.steps.length}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.05rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            vs. {simulation.opponentName}
          </h2>
        </div>

        <button
          type="button"
          className="btn btn-surface"
          style={{ minHeight: '36px', padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
          onClick={onClose}
          id="arena-close-btn"
        >
          <X size={15} /> Close
        </button>
      </div>

      {/* Main Portrait Battlefield Stage */}
      <div className="arena-stage">
        <div className="battlefield-portrait-stack">
          {/* TOP HALF: ENEMY FORMATION */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.4rem',
                marginBottom: '0.35rem',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  color: '#f87171',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                }}
              >
                ☠ {simulation.opponentName} ({simulation.opponentTitle})
              </span>
              <div className="h-scroll-strip" style={{ maxWidth: '50%' }}>
                {simulation.enemySynergies.map((syn) => (
                  <span
                    key={syn.id}
                    className="card-pill"
                    style={{ fontSize: '0.54rem', padding: '0.1rem 0.35rem' }}
                  >
                    {syn.name}
                  </span>
                ))}
              </div>
            </div>

            <div
              className={`team-formation ${
                simulation.isRaidBoss ? 'raid-boss-formation' : ''
              }`}
            >
              {step.enemyUnits.map((u) => renderUnitSlot(u))}
            </div>
          </div>

          {/* CENTER LIVE ACTION TICKER */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-gold)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.55rem 0.75rem',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <Swords size={16} style={{ color: 'var(--gold-bright)', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    color: 'var(--gold-bright)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {step.title}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-primary)',
                    lineHeight: 1.35,
                  }}
                >
                  {step.logText}
                </div>
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                height: '2.5px',
                width: `${progressPct}%`,
                background: 'var(--gold-bright)',
                transition: 'width 0.2s ease',
              }}
            />
          </div>

          {/* BOTTOM HALF: PLAYER SQUAD FORMATION */}
          <div>
            <div className="team-formation">
              {step.playerUnits.map((u) => renderUnitSlot(u))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.4rem',
                marginTop: '0.4rem',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  color: '#4ade80',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ✦ Your Squad
              </span>
              <div className="h-scroll-strip">
                {simulation.playerSynergies.map((syn) => (
                  <span
                    key={syn.id}
                    className="card-pill"
                    style={{
                      fontSize: '0.55rem',
                      padding: '0.12rem 0.4rem',
                      borderColor: 'var(--border-gold)',
                      color: 'var(--gold-bright)',
                    }}
                    title={syn.description}
                  >
                    <Sparkles size={9} /> {syn.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Victory / Outcome Banner when finished */}
        {isFinished && (
          <div
            style={{
              background: simulation.won
                ? 'linear-gradient(135deg, hsla(38, 68%, 52%, 0.22), hsla(146, 68%, 45%, 0.16))'
                : 'hsla(354, 70%, 50%, 0.16)',
              border: `1px solid ${
                simulation.won ? 'var(--gold-bright)' : 'var(--crimson-primary)'
              }`,
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
            id="battle-outcome-banner"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <Trophy
                size={24}
                style={{
                  color: simulation.won ? 'var(--gold-bright)' : '#f87171',
                  flexShrink: 0,
                }}
              />
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>
                  {simulation.isRaidBoss
                    ? `Raid Strike Complete · ${simulation.totalDamageDealt.toLocaleString()} DMG!`
                    : simulation.won
                    ? 'Victory! Enemy Squad Shattered'
                    : 'Defeat — Upgrade or Reorder Squad'}
                </h3>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  {rewardSummary ||
                    `Total Damage Dealt: ${simulation.totalDamageDealt.toLocaleString()}`}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-gold"
              style={{ width: '100%' }}
              onClick={onClose}
            >
              Claim Spoils & Return
            </button>
          </div>
        )}

        {/* Collapsible Combat Log Drawer */}
        {showLog && (
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-gold)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.65rem',
              maxHeight: '160px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.28rem',
            }}
          >
            {simulation.steps.slice(0, currentIdx + 1).map((s) => (
              <div
                key={s.stepIndex}
                style={{
                  color:
                    s.stepIndex === currentIdx
                      ? 'var(--gold-bright)'
                      : s.side === 'player'
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                }}
              >
                [R{s.round}] {s.logText}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Thumb-Zone Playback Control Dock */}
      <div className="arena-bottom-dock">
        <button
          type="button"
          className="btn btn-surface"
          style={{ padding: '0.4rem', fontSize: '0.72rem' }}
          onClick={() => setPlaying((p) => !p)}
          id="arena-play-pause-btn"
        >
          {playing ? <Pause size={13} /> : <Play size={13} />}
          <span>{playing ? 'Pause' : 'Play'}</span>
        </button>

        <button
          type="button"
          className="btn btn-surface"
          style={{ padding: '0.4rem', fontSize: '0.72rem' }}
          onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
          id="arena-speed-btn"
        >
          <FastForward size={13} />
          <span>{speed}x</span>
        </button>

        <button
          type="button"
          className="btn btn-surface"
          style={{ padding: '0.4rem', fontSize: '0.72rem' }}
          disabled={isFinished}
          onClick={() => {
            setPlaying(false);
            setCurrentIdx((prev) => Math.min(simulation.steps.length - 1, prev + 1));
          }}
        >
          <StepForward size={13} />
          <span>Step</span>
        </button>

        <button
          type="button"
          className="btn btn-gold"
          style={{ padding: '0.4rem', fontSize: '0.72rem' }}
          onClick={() => {
            setPlaying(false);
            setCurrentIdx(simulation.steps.length - 1);
          }}
          id="arena-skip-end-btn"
        >
          <SkipForward size={13} />
          <span>Skip</span>
        </button>

        <button
          type="button"
          className="btn btn-surface"
          style={{
            padding: '0.4rem',
            fontSize: '0.72rem',
            borderColor: showLog ? 'var(--gold-bright)' : undefined,
            color: showLog ? 'var(--gold-bright)' : undefined,
          }}
          onClick={() => setShowLog((prev) => !prev)}
        >
          <ScrollText size={13} />
          <span>Log</span>
        </button>
      </div>
    </div>
  );
};
