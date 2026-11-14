import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  ShieldCheck,
  LogOut,
  X,
  Shield,
  CheckCircle2,
  Sparkles,
  Swords,
  ArrowLeft,
  RefreshCw,
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

const COUNTRY_CODES = [
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+61', label: '🇦🇺 +61' },
  { code: '+81', label: '🇯🇵 +81' },
  { code: '+49', label: '🇩🇪 +49' },
  { code: '+33', label: '🇫🇷 +33' },
  { code: '+52', label: '🇲🇽 +52' },
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  standalone = false,
  sessionUser,
  currentPlayer,
  onLoginSuccess,
}) => {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [countryCode, setCountryCode] = useState('+1');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [isExistingUser, setIsExistingUser] = useState(false);
  const [existingUsername, setExistingUsername] = useState<string | undefined>(undefined);
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [deliveryMode, setDeliveryMode] = useState<'sms' | 'dev-preview'>('dev-preview');

  // Optional quick profile fields for first-time players
  const [displayName, setDisplayName] = useState('');
  const [faction, setFaction] = useState<FactionId>('Helios');

  const [resendCooldown, setResendCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  if (!isOpen && !standalone) return null;

  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/mmo/auth/phone/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          countryCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not send verification code.');
      } else {
        setOtpToken(data.otpToken || '');
        setMaskedPhone(data.maskedPhone || phone.trim());
        setIsExistingUser(Boolean(data.isExistingUser));
        setExistingUsername(data.existingUsername);
        setDeliveryMode(data.deliveryMode || 'dev-preview');
        setDevCode(data.devCode);
        setCode('');
        setStep('code');
        setResendCooldown(30);
      }
    } catch {
      setErrorMsg('Network error while sending verification code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/mmo/auth/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          countryCode,
          code: code.trim(),
          otpToken,
          displayName: displayName.trim(),
          faction,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Verification failed.');
      } else {
        onLoginSuccess({
          sessionUser: data.sessionUser,
          activePlayerId: data.activePlayerId,
          state: data.state,
          accounts: data.accounts,
          message: data.isNewUser
            ? `Phone verified! Welcome to CHROMARIFT, @${data.sessionUser?.username}!`
            : `Welcome back, @${data.sessionUser?.username}! Personal Deck loaded.`,
        });
        setPhone('');
        setCode('');
        setOtpToken('');
        setDevCode(undefined);
        setDisplayName('');
        setStep('phone');
        if (onClose) onClose();
      }
    } catch {
      setErrorMsg('Network error while verifying phone code.');
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
              Quick Phone Verification
            </span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem' }}>
              {step === 'phone' ? 'Sign Up or Log In' : 'Enter 6-Digit Code'}
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
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          No passwords required. Enter your phone number to verify in seconds—new players get
          an instant personal <strong>Deck of Photo Cards</strong> automatically.
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
                  ? '✓ Phone Verified · Personal Deck Active'
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

      {/* STEP 1: Enter Phone Number */}
      {step === 'phone' && (
        <form
          onSubmit={handleSendCode}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
        >
          <div>
            <label
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.63rem',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                marginBottom: '0.3rem',
              }}
            >
              <Smartphone size={12} style={{ color: 'var(--gold-bright)' }} /> Mobile Phone
              Number
            </label>
            <div style={{ display: 'flex', gap: '0.45rem' }}>
              <select
                className="form-input"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Country code"
                style={{ width: '98px', flexShrink: 0, padding: '0.6rem 0.45rem' }}
                id="auth-country-select"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.label} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                className="form-input"
                placeholder="(555) 234-5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                id="auth-phone-input"
                style={{ flex: 1, fontSize: '1rem', letterSpacing: '0.02em' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-gold"
            disabled={submitting}
            id="auth-send-code-btn"
            style={{ width: '100%', padding: '0.8rem', fontSize: '0.9rem' }}
          >
            <ShieldCheck size={16} />
            <span>{submitting ? 'Sending Code...' : 'Send Verification Code →'}</span>
          </button>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.63rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            Works for both new sign-ups &amp; returning players · 6-digit SMS verification
          </div>
        </form>
      )}

      {/* STEP 2: Enter 6-Digit SMS Code */}
      {step === 'code' && (
        <form
          onSubmit={handleVerifyCode}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.55rem 0.7rem',
              gap: '0.5rem',
            }}
          >
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700 }}>
                {isExistingUser && existingUsername
                  ? `Welcome back, @${existingUsername}`
                  : 'New Player Instant Sign-Up'}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.64rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Code sent to {maskedPhone}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-surface"
              style={{ minHeight: '28px', padding: '0.2rem 0.5rem', fontSize: '0.64rem' }}
              onClick={() => {
                setStep('phone');
                setErrorMsg(null);
              }}
            >
              <ArrowLeft size={11} /> Change
            </button>
          </div>

          {/* Instant SMS Dev Preview Banner when Twilio keys are not configured */}
          {deliveryMode === 'dev-preview' && devCode && (
            <div
              id="auth-dev-otp-banner"
              style={{
                background: 'rgba(20, 83, 45, 0.28)',
                border: '1px solid rgba(74, 222, 128, 0.5)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.55rem 0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: '#bbf7d0',
                }}
              >
                📱 Verification Code:{' '}
                <strong style={{ fontSize: '0.88rem', color: '#4ade80', letterSpacing: '0.1em' }}>
                  {devCode}
                </strong>
              </div>
              <button
                type="button"
                className="btn btn-surface"
                id="auth-autofill-code-btn"
                style={{
                  minHeight: '28px',
                  padding: '0.2rem 0.55rem',
                  fontSize: '0.64rem',
                  borderColor: 'rgba(74, 222, 128, 0.5)',
                  color: '#4ade80',
                }}
                onClick={() => setCode(devCode)}
              >
                Auto-Fill
              </button>
            </div>
          )}

          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.3rem',
              }}
            >
              <label
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.63rem',
                  textTransform: 'uppercase',
                  color: 'var(--gold-bright)',
                }}
              >
                6-Digit Verification Code
              </label>
              <button
                type="button"
                disabled={resendCooldown > 0 || submitting}
                onClick={() => void handleSendCode()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: resendCooldown > 0 ? 'var(--text-muted)' : 'var(--gold-bright)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  cursor: resendCooldown > 0 ? 'default' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <RefreshCw size={10} />
                {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend Code'}
              </button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="form-input"
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoFocus
              id="auth-otp-input"
              style={{
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: '1.35rem',
                letterSpacing: '0.38em',
                fontWeight: 700,
              }}
            />
          </div>

          {/* Optional quick customization ONLY for new players */}
          {!isExistingUser && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem',
                paddingTop: '0.2rem',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <label
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: '0.22rem',
                  }}
                >
                  Player Name (Optional — auto-created if blank)
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

              <div>
                <label
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: '0.25rem',
                  }}
                >
                  Faction Allegiance
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
                        minHeight: '34px',
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
            </div>
          )}

          <button
            type="submit"
            className="btn btn-gold"
            disabled={submitting || code.length !== 6}
            id="auth-verify-submit-btn"
            style={{ width: '100%', padding: '0.8rem' }}
          >
            <Sparkles size={15} />
            <span>
              {submitting
                ? 'Verifying...'
                : isExistingUser
                ? 'Verify & Open My Deck'
                : 'Verify & Start Playing'}
            </span>
          </button>
        </form>
      )}
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
