import React, { useState } from 'react';
import {
  Flame,
  Sun,
  Waves,
  Leaf,
  Sparkles,
  Contrast,
  Shield,
  Swords,
  Zap,
  Wand2,
} from 'lucide-react';
import {
  ELEMENT_DISPLAY,
  ROLE_DISPLAY,
  VIBE_DEFINITIONS,
  type MmoCard,
  type ElementType,
  type CardRole,
  type PhotoCategory,
  type VibeType,
} from '../types.ts';

interface CombatCardViewProps {
  card: MmoCard;
  compact?: boolean;
  slotBadge?: string;
  onJudgeVibe?: (cardId: string, vibe: VibeType) => Promise<void> | void;
  footerActions?: React.ReactNode;
}

const CATEGORY_ICONS: Record<PhotoCategory, string> = {
  Portrait: '👤',
  Architecture: '🏛️',
  Nature: '🌿',
  'Still Life': '🏺',
  'Street & Action': '⚡',
  'Macro & Wildlife': '🦋',
  'Night & Astro': '🌙',
  'Fine Art & Abstract': '🎨',
};

export function ElementIcon({ element, size = 13 }: { element: ElementType; size?: number }) {
  const color = ELEMENT_DISPLAY[element]?.color || 'var(--gold-primary)';
  switch (element) {
    case 'Solar':
      return <Sun size={size} style={{ color }} />;
    case 'Abyssal':
      return <Waves size={size} style={{ color }} />;
    case 'Crimson':
      return <Flame size={size} style={{ color }} />;
    case 'Verdant':
      return <Leaf size={size} style={{ color }} />;
    case 'Astral':
      return <Sparkles size={size} style={{ color }} />;
    case 'Monochrome':
      return <Contrast size={size} style={{ color }} />;
  }
}

export function RoleIcon({ role, size = 12 }: { role: CardRole; size?: number }) {
  switch (role) {
    case 'Vanguard':
      return <Shield size={size} />;
    case 'Bruiser':
      return <Zap size={size} />;
    case 'Striker':
      return <Swords size={size} />;
    case 'Arcanist':
      return <Wand2 size={size} />;
  }
}

export const CombatCardView: React.FC<CombatCardViewProps> = ({
  card,
  compact = false,
  slotBadge,
  onJudgeVibe,
  footerActions,
}) => {
  const [recentVibe, setRecentVibe] = useState<string | null>(null);

  const elementMeta = ELEMENT_DISPLAY[card.element] || {
    label: card.element,
    color: 'var(--gold-primary)',
  };
  const roleMeta = ROLE_DISPLAY[card.role] || { label: card.role };
  const category = card.category || 'Still Life';
  const catEmoji = CATEGORY_ICONS[category] || '📷';

  const vibeCounts = card.vibeCounts || {
    cool: 0,
    cute: 0,
    scary: 0,
    funny: 0,
    chill: 0,
    epic: 0,
  };

  const earnedBadges = VIBE_DEFINITIONS.map((vibe) => ({
    ...vibe,
    count: vibeCounts[vibe.id] || 0,
  }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  const handleVibeClick = (vibe: VibeType, label: string, emoji: string) => {
    setRecentVibe(`${emoji} +1 ${label}`);
    if (onJudgeVibe) {
      onJudgeVibe(card.id, vibe);
    }
    window.setTimeout(() => {
      setRecentVibe((prev) => (prev === `${emoji} +1 ${label}` ? null : prev));
    }, 1400);
  };

  return (
    <article
      className={`combat-card foil-${card.foil}${compact ? ' is-compact' : ''}`}
      style={{ ['--card-elem-color' as string]: elementMeta.color }}
    >
      {/* Clean Photography Showcase */}
      <div className="card-art-wrap" style={compact ? { aspectRatio: '16 / 10' } : undefined}>
        <img
          src={card.imageUrl}
          alt={card.title}
          loading="lazy"
          onError={(e) => {
            if (card.blurDataUrl && e.currentTarget.src !== card.blurDataUrl) {
              e.currentTarget.src = card.blurDataUrl;
            }
          }}
        />
        {card.foil !== 'Standard' && <div className="card-foil-glare" />}

        {(slotBadge || card.isWild) && (
          <div className="card-top-badges">
            <span className="card-pill card-pill-status">
              {slotBadge ? (
                <span style={{ color: 'var(--gold-bright)' }}>{slotBadge}</span>
              ) : (
                <span style={{ color: '#f87171' }}>Wild</span>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="card-body">
        {/* Title & Level / Power */}
        <div className="card-header-row">
          <h3 className="card-title" title={card.title}>
            {card.title}
          </h3>
          <span
            className="card-power-badge"
            title={`Level ${card.level} · Power ${card.powerRating}`}
          >
            Lv.{card.level} · ⚔ {card.powerRating}
          </span>
        </div>

        {/* Core Identity: Photography Type, Element, Role */}
        <div className="card-identity-pills">
          <span className="card-id-pill card-id-category" title="Photography Type">
            <span>{catEmoji}</span>
            <span>{category}</span>
          </span>

          <span
            className="card-id-pill card-id-element"
            style={{ borderColor: elementMeta.color, color: elementMeta.color }}
            title={`${elementMeta.label} Element`}
          >
            <ElementIcon element={card.element} size={12} />
            <span>{elementMeta.label}</span>
          </span>

          <span className="card-id-pill card-id-role" title={`Role: ${roleMeta.label}`}>
            <RoleIcon role={card.role} size={11} />
            <span>{roleMeta.label}</span>
          </span>
        </div>

        {/* Special Community Reaction Badges */}
        {earnedBadges.length > 0 && (
          <div className="card-special-badges" aria-label="Special reaction badges">
            {earnedBadges.map((badge, index) => (
              <span
                key={badge.id}
                className={`card-special-badge${index === 0 ? ' is-top' : ''}`}
                style={{
                  borderColor: badge.color,
                  color: badge.color,
                }}
                title={`${badge.count} ${badge.count === 1 ? 'person' : 'people'} called this ${badge.label.toLowerCase()}`}
              >
                <span className="badge-emoji">{badge.emoji}</span>
                <span className="badge-count">{badge.count}</span>
                <span className="badge-label">{badge.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Lightweight Reaction Bar */}
        {onJudgeVibe && (
          <div className="card-react-section">
            <div className="card-react-header">
              <span className="card-react-prompt">React</span>
              {recentVibe && <span className="card-react-toast">{recentVibe}</span>}
            </div>
            <div className="card-react-pills">
              {VIBE_DEFINITIONS.map((vibe) => {
                const count = vibeCounts[vibe.id] || 0;
                return (
                  <button
                    key={vibe.id}
                    type="button"
                    className={`card-react-btn${count > 0 ? ' has-count' : ''}`}
                    style={count > 0 ? { borderColor: vibe.color } : undefined}
                    onClick={() => handleVibeClick(vibe.id, vibe.label, vibe.emoji)}
                    title={`Mark as ${vibe.label}`}
                  >
                    <span>{vibe.emoji}</span>
                    <span>{vibe.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quiet Combat Stats Strip on Full Cards */}
        {!compact && (
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
        )}

        {footerActions && <div style={{ marginTop: '0.2rem' }}>{footerActions}</div>}
      </div>
    </article>
  );
};
