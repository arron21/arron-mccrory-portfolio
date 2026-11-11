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

  const step = simulation.steps[currentIdx] || simulation.steps[0];
  const isFinished = currentIdx >= simulation.steps.length - 1;

  useEffect(() => {
    if (!playing || isFinished) return;
    const delay = speed === 4 ? 220 : speed === 2 ? 480 : 920;
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
              top: '0.4rem',
              left: '0.4rem',
              right: '0.4rem',
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
            }}
          >
            <span className="card-pill">
              <ElementIcon element={unit.element} size={11} />
              Slot {unit.slotIndex + 1}
            </span>
            {unit.shield > 0 && (
              <span
                className="card-pill"
                style={{ color: '#60a5fa', borderColor: 'rgba(96,165,250,0.45)' }}
              >
                <Shield size={10} /> +{unit.shield}
              </span>
            )}
          </div>

          {isTargeted && step.damage && (
            <div className={`floating-pop ${step.isCrit ? 'crit' : ''}`}>
              -{step.damage} {step.isCrit ? 'CRIT!' : ''}
            </div>
          )}
          {isActing && step.heal && (
            <div className="floating-pop" style={{ color: '#4ade80' }}>
              +{step.heal} HP
            </div>
          )}
        </div>

        <div style={{ padding: '0.65rem' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.86rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {unit.title}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              color: 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '0.15rem',
            }}
          >
            <span>{unit.role}</span>
            <span>
              {unit.hp}/{unit.maxHp}
            </span>
          </div>

          <div className="hp-bar-track">
            <div
              className={`hp-bar-fill ${unit.side === 'enemy' ? 'enemy' : ''}`}
              style={{ width: `${hpPct}%` }}
            />
          </div>

          <div
            style={{
              marginTop: '0.4rem',
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span>ATK {unit.atk}</span>
            <span>SPD {unit.spd}</span>
            <span>CRT {unit.crit}%</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="arena-backdrop" id="auto-battle-arena-modal" role="dialog" aria-modal="true">
      <div className="arena-header">
        <div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--gold-primary)',
              display: 'block',
            }}
          >
            Pure Auto-Battler Simulation · Round {step.round}
          </span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem' }}>
            Your Squad vs. {simulation.opponentName} ({simulation.opponentTitle})
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-surface"
            onClick={() => setPlaying((p) => !p)}
            id="arena-play-pause-btn"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? 'Pause' : 'Resume'}
          </button>

          <button
            type="button"
            className="btn btn-surface"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
            id="arena-speed-btn"
          >
            <FastForward size={14} /> {speed}x Speed
          </button>

          <button
            type="button"
            className="btn btn-surface"
            disabled={isFinished}
            onClick={() => {
              setPlaying(false);
              setCurrentIdx((prev) => Math.min(simulation.steps.length - 1, prev + 1));
            }}
          >
            Step
          </button>

          <button
            type="button"
            className="btn btn-gold"
            onClick={() => {
              setPlaying(false);
              setCurrentIdx(simulation.steps.length - 1);
            }}
            id="arena-skip-end-btn"
          >
            <SkipForward size={14} /> Skip to Outcome
          </button>

          <button
            type="button"
            className="btn btn-surface"
            onClick={onClose}
            id="arena-close-btn"
          >
            <X size={15} /> Close Arena
          </button>
        </div>
      </div>

      <div className="arena-stage">
        {/* Synergy Banners */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--gold-bright)',
              }}
            >
              YOUR SYNERGIES:
            </span>
            {simulation.playerSynergies.map((syn) => (
              <span
                key={syn.id}
                className="card-pill"
                style={{ borderColor: 'var(--border-gold)', color: 'var(--gold-bright)' }}
                title={syn.description}
              >
                <Sparkles size={11} /> {syn.name}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
              }}
            >
              RIVAL SYNERGIES:
            </span>
            {simulation.enemySynergies.map((syn) => (
              <span key={syn.id} className="card-pill" title={syn.description}>
                {syn.name}
              </span>
            ))}
          </div>
        </div>

        {/* Live Action Callout Banner */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-gold)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Swords size={18} style={{ color: 'var(--gold-bright)' }} />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--gold-bright)' }}>{step.title}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {step.logText}
              </div>
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Tick {currentIdx + 1} / {simulation.steps.length}
          </span>
        </div>

        {/* 4v4 Battlefield Formation */}
        <div className="battlefield-grid">
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: '#4ade80',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
              }}
            >
              Your Squad (Slot 1 Frontline → Slot 4 Backline)
            </div>
            <div className="team-formation">
              {step.playerUnits.map((u) => renderUnitSlot(u))}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: '1.35rem',
              fontWeight: 800,
              color: 'var(--gold-primary)',
            }}
          >
            VS
          </div>

          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: '#f87171',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
              }}
            >
              {simulation.opponentName} Formation
            </div>
            <div className="team-formation">
              {step.enemyUnits.map((u) => renderUnitSlot(u))}
            </div>
          </div>
        </div>

        {/* Victory / Outcome Banner when finished */}
        {isFinished && (
          <div
            style={{
              background: simulation.won
                ? 'linear-gradient(135deg, hsla(38, 68%, 52%, 0.2), hsla(146, 68%, 45%, 0.14))'
                : 'hsla(354, 70%, 50%, 0.14)',
              border: `1px solid ${
                simulation.won ? 'var(--gold-bright)' : 'var(--crimson-primary)'
              }`,
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
            id="battle-outcome-banner"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              <Trophy
                size={28}
                style={{ color: simulation.won ? 'var(--gold-bright)' : '#f87171' }}
              />
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem' }}>
                  {simulation.isRaidBoss
                    ? `Raid Boss Strike Complete · ${simulation.totalDamageDealt.toLocaleString()} Total Damage!`
                    : simulation.won
                    ? 'Victory! Enemy Formation Shattered'
                    : 'Defeat — Recalibrate Your Squad Synergies'}
                </h3>
                <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                  {rewardSummary ||
                    `Total Squad Damage Dealt: ${simulation.totalDamageDealt.toLocaleString()} · Rewards credited to your Sanctum.`}
                </p>
              </div>
            </div>

            <button type="button" className="btn btn-gold" onClick={onClose}>
              Return to Chromarift
            </button>
          </div>
        )}

        {/* Scrollable Combat Log */}
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            maxHeight: '190px',
            overflowY: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.73rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
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
      </div>
    </div>
  );
};
