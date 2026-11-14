import React, { useState } from 'react';
import {
  LogIn,
  UserPlus,
  LogOut,
  X,
  Shield,
  CheckCircle2,
  Sparkles,
  Swords,
} from 'lucide-react';
import type {
  FactionId,
  MmoCard,
  MmoPlayer,
  MmoUserAccount,
  SessionUser,
} from '../types.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  standalone?: boolean;
  sessionUser: SessionUser | null;
  currentPlayer: MmoPlayer | null;
  accounts?: MmoUserAccount[];
  players?: MmoPlayer[];
  cards?: MmoCard[];
  onLoginSuccess: (payload: {
    sessionUser: SessionUser | null;
    activePlayerId?: string | null;
    state?: unknown;
    accounts?: MmoUserAccount[];
    message: string;
  }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  standalone = false,
  sessionUser,
  currentPlayer,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [faction, setFaction] = useState<FactionId>('Helios');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen && !standalone) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const endpoint =
        mode === 'register' ? '/api/mmo/auth/register' : '/api/mmo/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          displayName: displayName.trim(),
          password,
          faction,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Authentication failed.');
      } else {
        onLoginSuccess({
          sessionUser: data.sessionUser,
          activePlayerId: data.activePlayerId,
          state: data.state,
          accounts: data.accounts,
          message:
            mode === 'register'
              ? `Welcome to CHROMARIFT, @${data.sessionUser?.username}! Your personal Deck of Cards is ready.`
              : `Logged in as @${data.sessionUser?.username}! Loaded your personal Deck of Cards.`,
        });
        setUsername('');
        setPassword('');
        setDisplayName('');
        if (onClose) onClose();
      }
    } catch {
      setErrorMsg('Network error while connecting to authentication server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/mmo/auth/logout', { method: 'POST' });
      const data = await res.json();
      onLoginSuccess({
        sessionUser: null,
        activePlayerId: null,
        state: data.state,
        accounts: data.accounts,
        message: 'Logged out of your account.',
      });
      if (onClose) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const cardContent = (
    <div
      className={standalone ? '' : 'arena-modal-sheet'}
      onClick={(e) => e.stopPropagation()}
      style={{
        maxWidth: standalone ? '460px' : '440px',
        width: '100%',
        margin: standalone ? '0 auto' : undefined,
        padding: '1.15rem',
        background: standalone ? 'var(--bg-elevated)' : undefined,
        border: standalone ? '1px solid var(--border-gold)' : undefined,
        borderRadius: standalone ? 'var(--radius-md)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {standalone && (
            <div className="brand-emblem" style={{ flexShrink: 0 }}>
              <Swords size={18} />
            </div>
          )}
          <div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.62rem',
                color: 'var(--gold-bright)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Personal Account Authentication
            </span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem' }}>
              {standalone ? 'Log In to Your Deck' : 'Your Account'}
            </h2>
          </div>
        </div>
        {!standalone && onClose && (
          <button
            type="button"
            className="btn btn-surface"
            onClick={onClose}
            style={{ minHeight: '34px', padding: '0.35rem 0.55rem' }}
            aria-label="Close Account Modal"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {standalone && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Every player has their own private <strong>Deck of Photo Cards</strong> and{' '}
          <strong>4-Card Combat Squad</strong>. Sign in with your username and password or
          create your own account to start forging cards.
        </p>
      )}

      {/* Active Player Banner (when logged in) */}
      {currentPlayer && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-gold)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.65rem 0.8rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <CheckCircle2 size={16} style={{ color: '#4ade80', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                {currentPlayer.displayName}{' '}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: 'var(--gold-bright)',
                  }}
                >
                  @{currentPlayer.username}
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  color: 'var(--text-secondary)',
                }}
              >
                {sessionUser
                  ? '✓ Signed In · Personal Deck Active'
                  : `Order of ${currentPlayer.faction} · Lv.${currentPlayer.level}`}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-surface"
            onClick={handleLogout}
            disabled={submitting}
            id="auth-logout-btn"
            style={{ minHeight: '34px', padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
          >
            <LogOut size={13} /> Log Out
          </button>
        </div>
      )}

      {/* Mode Switcher: Log In vs Create New User Account */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.45rem',
        }}
      >
        <button
          type="button"
          className="btn btn-surface"
          id="auth-tab-login-btn"
          onClick={() => {
            setMode('login');
            setErrorMsg(null);
          }}
          style={{
            borderColor: mode === 'login' ? 'var(--gold-bright)' : undefined,
            color: mode === 'login' ? 'var(--gold-bright)' : undefined,
          }}
        >
          <LogIn size={14} /> Log In
        </button>
        <button
          type="button"
          className="btn btn-surface"
          id="auth-tab-register-btn"
          onClick={() => {
            setMode('register');
            setErrorMsg(null);
          }}
          style={{
            borderColor: mode === 'register' ? '#4ade80' : undefined,
            color: mode === 'register' ? '#4ade80' : undefined,
          }}
        >
          <UserPlus size={14} /> Create Account
        </button>
      </div>

      {errorMsg && (
        <div
          style={{
            background: 'hsla(354, 70%, 45%, 0.16)',
            border: '1px solid var(--elem-crimson)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.55rem 0.7rem',
            fontSize: '0.76rem',
            color: '#fca5a5',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Login / Register Form */}
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
      >
        <div>
          <label
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.63rem',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '0.25rem',
            }}
          >
            Your Username Handle
          </label>
          <input
            type="text"
            className="form-input"
            placeholder={mode === 'login' ? 'Enter your username' : 'Choose a username'}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            id="auth-username-input"
          />
        </div>

        {mode === 'register' && (
          <div>
            <label
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.63rem',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: '0.25rem',
              }}
            >
              Display Name
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Luna Vance"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              id="auth-displayname-input"
            />
          </div>
        )}

        <div>
          <label
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.63rem',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: '0.25rem',
            }}
          >
            Password
          </label>
          <input
            type="password"
            className="form-input"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            id="auth-password-input"
          />
        </div>

        {mode === 'register' && (
          <div>
            <label
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.63rem',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                display: 'block',
                marginBottom: '0.3rem',
              }}
            >
              Starting Faction Order
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.35rem',
              }}
            >
              {(['Helios', 'Umbra', 'Prism'] as FactionId[]).map((fac) => (
                <button
                  key={fac}
                  type="button"
                  className="btn btn-surface"
                  onClick={() => setFaction(fac)}
                  style={{
                    minHeight: '36px',
                    fontSize: '0.72rem',
                    borderColor: faction === fac ? 'var(--gold-bright)' : undefined,
                    color: faction === fac ? 'var(--gold-bright)' : undefined,
                  }}
                >
                  <Shield size={12} /> {fac}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-gold"
          disabled={submitting}
          id="auth-submit-btn"
          style={{ width: '100%', padding: '0.75rem' }}
        >
          <Sparkles size={15} />
          <span>
            {submitting
              ? 'Authenticating...'
              : mode === 'register'
              ? 'Create Account & Start My Deck'
              : 'Log In to My Deck'}
          </span>
        </button>
      </form>
    </div>
  );

  if (standalone) {
    return cardContent;
  }

  return (
    <div
      className="arena-modal-backdrop"
      onClick={onClose}
      style={{ zIndex: 1300 }}
    >
      {cardContent}
    </div>
  );
};
