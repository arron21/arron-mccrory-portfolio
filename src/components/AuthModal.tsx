import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, ExternalLink, Lock } from 'lucide-react';
import type { AuthStatus } from '../types.ts';

interface AuthModalProps {
  authStatus: AuthStatus | null;
  authError?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  authStatus,
  authError,
  onClose,
  onSuccess,
}) => {
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(authError || null);

  const githubConfigured = authStatus?.providers.github.configured ?? false;
  const googleConfigured = authStatus?.providers.google.configured ?? false;
  const passcodeRequired = authStatus?.providers.devFallback.passcodeRequired ?? false;
  const allowedGithub = authStatus?.providers.github.allowedUser || 'arron21';
  const allowedGoogle =
    authStatus?.providers.google.allowedEmail || '2738674+arron21@users.noreply.github.com';

  const handleLocalOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to authenticate');
      } else {
        onSuccess();
      }
    } catch {
      setError('Network error while signing in to Studio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" id="auth-login-modal" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--accent-warm)',
                display: 'block',
              }}
            >
              Owner Authentication
            </span>
            <h2 className="modal-title">Sign In to Studio</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            id="close-auth-modal-btn"
            aria-label="Close Sign In Modal"
          >
            <X size={16} />
          </button>
        </div>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.88rem',
            marginBottom: '1.35rem',
          }}
        >
          Studio access is restricted to the portfolio owner (
          <strong style={{ color: 'var(--text-primary)' }}>@{allowedGithub}</strong>) to upload
          and curate high-resolution plates.
        </p>

        {error && (
          <div
            style={{
              background: 'hsla(0, 68%, 62%, 0.14)',
              border: '1px solid hsla(0, 68%, 62%, 0.3)',
              color: 'var(--status-danger)',
              padding: '0.75rem 0.9rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              marginBottom: '1.2rem',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <a
            href={githubConfigured ? '/api/auth/github' : undefined}
            onClick={(e) => {
              if (!githubConfigured) {
                e.preventDefault();
                setError(
                  'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not set in environment yet. Use Owner Studio Sign-In below, or configure OAuth keys.'
                );
              }
            }}
            className="btn btn-secondary"
            id="oauth-github-btn"
            style={{
              width: '100%',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldCheck size={16} />
              Continue with GitHub (@{allowedGithub})
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: githubConfigured ? 'var(--status-success)' : 'var(--text-muted)',
              }}
            >
              {githubConfigured ? 'OAuth Ready' : 'Env Keys Optional'}
            </span>
          </a>

          <a
            href={googleConfigured ? '/api/auth/google' : undefined}
            onClick={(e) => {
              if (!googleConfigured) {
                e.preventDefault();
                setError(
                  'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set in environment yet. Use Owner Studio Sign-In below, or configure OAuth keys.'
                );
              }
            }}
            className="btn btn-secondary"
            id="oauth-google-btn"
            style={{
              width: '100%',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
              <ExternalLink size={16} />
              Continue with Google ({allowedGoogle.split('@')[0]})
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: googleConfigured ? 'var(--status-success)' : 'var(--text-muted)',
              }}
            >
              {googleConfigured ? 'OAuth Ready' : 'Env Keys Optional'}
            </span>
          </a>
        </div>

        <div
          style={{
            margin: '1.4rem 0',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
          <span>Direct Owner Studio Access</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
        </div>

        <form onSubmit={handleLocalOwnerLogin}>
          {passcodeRequired && (
            <div className="form-group">
              <label className="form-label" htmlFor="studio-passcode-input">
                Owner Studio Passcode
              </label>
              <input
                id="studio-passcode-input"
                type="password"
                className="form-input"
                placeholder="Enter studio passcode..."
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-accent"
            id="local-owner-login-btn"
            disabled={loading}
            style={{ width: '100%', padding: '0.78rem 1.2rem' }}
          >
            {passcodeRequired ? <Lock size={15} /> : <KeyRound size={15} />}
            {loading
              ? 'Signing In to Studio...'
              : `Sign In as Arron McCrory (@${allowedGithub})`}
          </button>
        </form>
      </div>
    </div>
  );
};
