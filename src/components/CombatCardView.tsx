import React from 'react';
import {
  Flame,
  Sun,
  Waves,
  Leaf,
  Sparkles,
  Contrast,
  Zap,
  Camera,
  Shield,
} from 'lucide-react';
import type { MmoCard, ElementType } from '../types.ts';

interface CombatCardViewProps {
  card: MmoCard;
  compact?: boolean;
  slotBadge?: string;
  footerActions?: React.ReactNode;
}

const ELEMENT_COLORS: Record<ElementType, string> = {
  Solar: 'var(--elem-solar)',
  Abyssal: 'var(--elem-abyssal)',
  Crimson: 'var(--elem-crimson)',
  Verdant: 'var(--elem-verdant)',
  Astral: 'var(--elem-astral)',
  Monochrome: 'var(--elem-monochrome)',
};

export function ElementIcon({ element, size = 13 }: { element: ElementType; size?: number }) {
  switch (element) {
    case 'Solar':
      return <Sun size={size} style={{ color: ELEMENT_COLORS.Solar }} />;
    case 'Abyssal':
      return <Waves size={size} style={{ color: ELEMENT_COLORS.Abyssal }} />;
    case 'Crimson':
      return <Flame size={size} style={{ color: ELEMENT_COLORS.Crimson }} />;
    case 'Verdant':
      return <Leaf size={size} style={{ color: ELEMENT_COLORS.Verdant }} />;
    case 'Astral':
      return <Sparkles size={size} style={{ color: ELEMENT_COLORS.Astral }} />;
    case 'Monochrome':
      return <Contrast size={size} style={{ color: ELEMENT_COLORS.Monochrome }} />;
  }
}

export const CombatCardView: React.FC<CombatCardViewProps> = ({
  card,
  compact = false,
  slotBadge,
  footerActions,
}) => {
  const elemColor = ELEMENT_COLORS[card.element] || 'var(--gold-primary)';

  return (
    <article className={`combat-card foil-${card.foil}`}>
      <div className="card-art-wrap">
        <img src={card.imageUrl} alt={card.title} loading="lazy" />
        {card.foil !== 'Standard' && <div className="card-foil-glare" />}

        <div className="card-top-badges">
          <span className="card-pill" style={{ borderColor: elemColor }}>
            <ElementIcon element={card.element} size={12} />
            <span>{card.element}</span>
            <span style={{ opacity: 0.65 }}>· Lv.{card.level}</span>
          </span>

          <span className="card-pill">
            {slotBadge ? (
              <span style={{ color: 'var(--gold-bright)' }}>{slotBadge}</span>
            ) : (
              <span>
                {card.rarity}
                {card.foil !== 'Standard' ? ` · ${card.foil}` : ''}
              </span>
            )}
          </span>
        </div>

        <div className="card-art-bottom">
          <div className="card-title-group">
            <div className="card-epithet">
              {card.role} · {card.epithet}
            </div>
            <h3>{card.title}</h3>
          </div>
          <div className="card-power-badge" title="Combat Power Rating">
            ⚔ {card.powerRating}
          </div>
        </div>
      </div>

      <div className="card-body">
        <div className="card-stats-row">
          <div>
            <span className="stat-box-label">HP</span>
            <span className="stat-box-val" style={{ color: '#4ade80' }}>
              {card.hp}
            </span>
          </div>
          <div>
            <span className="stat-box-label">ATK</span>
            <span className="stat-box-val" style={{ color: '#f87171' }}>
              {card.atk}
            </span>
          </div>
          <div>
            <span className="stat-box-label">DEF</span>
            <span className="stat-box-val" style={{ color: '#60a5fa' }}>
              {card.def}
            </span>
          </div>
          <div>
            <span className="stat-box-label">SPD</span>
            <span className="stat-box-val" style={{ color: '#38bdf8' }}>
              {card.spd}
            </span>
          </div>
          <div>
            <span className="stat-box-label">CRT</span>
            <span className="stat-box-val" style={{ color: 'var(--gold-bright)' }}>
              {card.crit}%
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.35rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.66rem',
          }}
        >
          <span
            style={{
              background: 'var(--gold-subtle)',
              color: 'var(--gold-bright)',
              padding: '0.16rem 0.45rem',
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <Shield size={11} /> {card.opticalTrait}
          </span>
          {card.secondaryTrait && (
            <span
              style={{
                background: 'hsla(192, 86%, 60%, 0.14)',
                color: 'var(--elem-astral)',
                padding: '0.16rem 0.45rem',
                borderRadius: '4px',
              }}
            >
              + {card.secondaryTrait}
            </span>
          )}
          <span
            style={{
              marginLeft: 'auto',
              color: 'var(--gold-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
            }}
            title="Social Hype Resonance (+Stat Buff)"
          >
            <Zap size={11} /> {card.hypeCount} Hype
          </span>
        </div>

        {!compact && (
          <div className="card-ability-box">
            <div className="ability-header">
              <span>✦ {card.ability.name}</span>
              <span className="ability-trigger-tag">{card.ability.triggerLabel}</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.73rem', lineHeight: 1.45 }}>
              {card.ability.description}
            </p>
          </div>
        )}

        <div className="card-exif-strip">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <Camera size={11} />
            {card.exif.camera || 'Optical Plate'}
          </span>
          <span>
            {[card.exif.focalLength, card.exif.aperture, card.exif.shutterSpeed]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>

        {footerActions && <div style={{ marginTop: '0.25rem' }}>{footerActions}</div>}
      </div>
    </article>
  );
};
