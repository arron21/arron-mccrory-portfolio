import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Sun,
  Moon,
  LayoutGrid,
  Rows3,
  Search,
  Sparkles,
  UploadCloud,
  Lock,
  ArrowUpRight,
  CheckCircle2,
  MapPin,
  Aperture,
  Layers,
  Send,
} from 'lucide-react';
import {
  formatBytes,
  formatExifSummary,
  type Photo,
  type Collection,
  type PublicSettings,
  type Telemetry,
  type AuthStatus,
} from './types.ts';
import { OptimizedImage } from './components/OptimizedImage.tsx';
import { Lightbox } from './components/Lightbox.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { StudioDashboard } from './components/StudioDashboard.tsx';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activePage, setActivePage] = useState<
    'work' | 'collections' | 'about' | 'contact' | 'studio'
  >('work');
  const [layoutMode, setLayoutMode] = useState<'masonry' | 'editorial'>('masonry');

  // Portfolio state
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth state
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Gallery Filter & Lightbox state
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Contact Inquiry form state
  const [inqName, setInqName] = useState('');
  const [inqEmail, setInqEmail] = useState('');
  const [inqType, setInqType] = useState('Editorial / Commission');
  const [inqSubject, setInqSubject] = useState('');
  const [inqMessage, setInqMessage] = useState('');
  const [inqSubmitting, setInqSubmitting] = useState(false);
  const [inqSuccess, setInqSuccess] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const fetchPortfolio = async () => {
    try {
      const [portRes, authRes] = await Promise.all([
        fetch('/api/portfolio'),
        fetch('/api/auth/status'),
      ]);
      if (portRes.ok) {
        const data = await portRes.json();
        setSettings(data.settings);
        setCollections(data.collections || []);
        setPhotos(data.photos || []);
        setTelemetry(data.telemetry || null);
      }
      if (authRes.ok) {
        const authData = (await authRes.json()) as AuthStatus;
        setAuthStatus(authData);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();

    const params = new URLSearchParams(window.location.search);
    if (params.get('studio') === '1') {
      setActivePage('studio');
      window.history.replaceState({}, '', '/');
    }
    const err = params.get('auth_error');
    if (err) {
      setAuthError(`OAuth notice: ${err.replace(/_/g, ' ')}`);
      setShowAuthModal(true);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    photos.forEach((p) => p.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
      if (selectedCollectionId === 'featured' && !p.isFeatured) return false;
      if (
        selectedCollectionId !== 'all' &&
        selectedCollectionId !== 'featured' &&
        p.collectionId !== selectedCollectionId
      ) {
        return false;
      }
      if (selectedTag && !p.tags.includes(selectedTag)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchCaption = p.caption.toLowerCase().includes(q);
        const matchLocation = p.location.toLowerCase().includes(q);
        const matchCamera = p.exif.camera.toLowerCase().includes(q);
        const matchTag = p.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchTitle && !matchCaption && !matchLocation && !matchCamera && !matchTag) {
          return false;
        }
      }
      return true;
    });
  }, [photos, selectedCollectionId, selectedTag, searchQuery]);

  const activeCollection = useMemo(() => {
    if (selectedCollectionId === 'all' || selectedCollectionId === 'featured') return null;
    return collections.find((c) => c.id === selectedCollectionId) || null;
  }, [collections, selectedCollectionId]);

  const handleOpenStudioOrLogin = () => {
    if (authStatus?.authenticated) {
      setActivePage('studio');
    } else {
      setShowAuthModal(true);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    await fetchPortfolio();
    setActivePage('work');
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInqSubmitting(true);
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inqName,
          email: inqEmail,
          projectType: inqType,
          subject: inqSubject,
          message: inqMessage,
        }),
      });
      if (res.ok) {
        setInqSuccess(true);
        setInqName('');
        setInqEmail('');
        setInqSubject('');
        setInqMessage('');
      }
    } finally {
      setInqSubmitting(false);
    }
  };

  return (
    <div>
      {/* Sticky Editorial Header */}
      <header className="site-header">
        <div className="header-inner">
          <div
            className="brand-identity"
            onClick={() => {
              setActivePage('work');
              setSelectedCollectionId('all');
            }}
            id="brand-home-link"
          >
            <span className="brand-name">{settings?.studioTitle || 'ARRON MCCRORY'}</span>
            <span className="brand-sub">Fine Art & Editorial Photography</span>
          </div>

          <nav className="main-nav" aria-label="Primary Navigation">
            <button
              type="button"
              className={`nav-link ${activePage === 'work' ? 'active' : ''}`}
              onClick={() => setActivePage('work')}
              id="nav-work-btn"
            >
              Work
            </button>
            <button
              type="button"
              className={`nav-link ${activePage === 'collections' ? 'active' : ''}`}
              onClick={() => setActivePage('collections')}
              id="nav-collections-btn"
            >
              Series ({collections.length})
            </button>
            <button
              type="button"
              className={`nav-link ${activePage === 'about' ? 'active' : ''}`}
              onClick={() => setActivePage('about')}
              id="nav-about-btn"
            >
              About & Gear
            </button>
            <button
              type="button"
              className={`nav-link ${activePage === 'contact' ? 'active' : ''}`}
              onClick={() => setActivePage('contact')}
              id="nav-contact-btn"
            >
              Inquiries
            </button>
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              title={`Switch to ${theme === 'dark' ? 'Gallery Paper (Light)' : 'Obsidian (Dark)'} Mode`}
              id="theme-toggle-btn"
              aria-label="Toggle color theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <button
              type="button"
              className={`btn ${authStatus?.authenticated ? 'btn-accent' : 'btn-secondary'}`}
              onClick={handleOpenStudioOrLogin}
              id="header-studio-btn"
            >
              {authStatus?.authenticated ? (
                <>
                  <UploadCloud size={15} /> Studio & Upload
                </>
              ) : (
                <>
                  <Lock size={14} /> Owner Login
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Router */}
      {activePage === 'studio' && authStatus?.authenticated ? (
        <StudioDashboard
          user={authStatus.user}
          onRefreshPublic={fetchPortfolio}
          onLogout={handleLogout}
          onExitStudio={() => setActivePage('work')}
        />
      ) : activePage === 'collections' ? (
        <main className="page-shell">
          <div style={{ marginBottom: '2.5rem' }}>
            <span className="hero-kicker">Thematic Bodies of Work</span>
            <h1 className="hero-title" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.4rem)' }}>
              Curated Series & Monographs
            </h1>
          </div>

          <div className="collections-grid">
            {collections.map((col) => (
              <article
                key={col.id}
                className="collection-card"
                onClick={() => {
                  setSelectedCollectionId(col.id);
                  setActivePage('work');
                }}
              >
                <div className="collection-cover">
                  {col.coverPhoto ? (
                    <img
                      src={
                        col.coverPhoto.variants.gallery_webp?.url ||
                        col.coverPhoto.variants.thumb_webp?.url
                      }
                      alt={col.title}
                    />
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                      }}
                    >
                      <Camera size={22} style={{ opacity: 0.5 }} />
                      <span>Awaiting First Plate</span>
                    </div>
                  )}
                </div>
                <div className="collection-body">
                  <span className="collection-card-sub">{col.subtitle || 'Series'}</span>
                  <h2 className="collection-card-title">{col.title}</h2>
                  <p className="collection-card-desc">{col.description}</p>
                  <div className="collection-card-footer">
                    <span>
                      {col.photoCount} {col.photoCount === 1 ? 'Plate' : 'Plates'}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      Explore Series <ArrowUpRight size={14} />
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </main>
      ) : activePage === 'about' ? (
        <main className="page-shell">
          <div className="about-layout">
            <div>
              <span className="about-section-label">Artist Statement & Biography</span>
              <h1 className="about-heading">
                {settings?.photographerName || 'Arron McCrory'}
              </h1>
              <p className="about-lead">{settings?.bioLead}</p>
              <p className="about-body">{settings?.bioBody}</p>

              {settings?.philosophyQuote && (
                <blockquote className="philosophy-blockquote">
                  {settings.philosophyQuote}
                </blockquote>
              )}

              <div
                style={{
                  marginTop: '2rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => setActivePage('contact')}
                >
                  Inquire About Commissions & Prints
                </button>
                {settings?.socialGithub && (
                  <a
                    href={settings.socialGithub}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary"
                  >
                    GitHub (@arron21) <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            </div>

            <aside className="gear-panel">
              <div>
                <div className="gear-group-title">Primary Camera Systems</div>
                <ul className="gear-list">
                  {(settings?.gearCameras || []).map((item) => (
                    <li key={item}>
                      <Camera size={14} style={{ color: 'var(--accent-warm)' }} /> {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="gear-group-title">Optical Glass</div>
                <ul className="gear-list">
                  {(settings?.gearLenses || []).map((item) => (
                    <li key={item}>
                      <Aperture size={14} style={{ color: 'var(--accent-warm)' }} /> {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="gear-group-title">Color & Web Delivery Pipeline</div>
                <ul className="gear-list">
                  {(settings?.gearWorkflow || []).map((item) => (
                    <li key={item}>
                      <Layers size={14} style={{ color: 'var(--accent-warm)' }} /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </main>
      ) : activePage === 'contact' ? (
        <main className="page-shell">
          <div className="contact-layout">
            <div>
              <span className="about-section-label">Commissions, Licensing & Editions</span>
              <h1 className="about-heading">Initiate a Dialogue</h1>
              <p className="about-body">
                Available for select editorial assignments, architectural documentation, fine-art
                archival pigment prints, and creative collaborations.
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <MapPin size={15} style={{ color: 'var(--accent-warm)' }} />
                  <span>{settings?.location || 'Pacific Northwest · Available Worldwide'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <Sparkles size={15} style={{ color: 'var(--accent-warm)' }} />
                  <span>
                    {settings?.availabilityStatus ||
                      'Accepting Select Editorial & Print Commissions'}
                  </span>
                </div>
              </div>
            </div>

            <div className="contact-card">
              {inqSuccess ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <div className="empty-archive-icon">
                    <CheckCircle2 size={24} />
                  </div>
                  <h2
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.9rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Inquiry Received
                  </h2>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      marginBottom: '1.5rem',
                      fontSize: '0.92rem',
                    }}
                  >
                    Thank you. Your message has been logged in Arron McCrory&apos;s Studio Inbox.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setInqSuccess(false)}
                  >
                    Send Another Message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} id="contact-inquiry-form">
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label" htmlFor="inq-name">
                        Your Name
                      </label>
                      <input
                        id="inq-name"
                        type="text"
                        className="form-input"
                        required
                        value={inqName}
                        onChange={(e) => setInqName(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="inq-email">
                        Email Address
                      </label>
                      <input
                        id="inq-email"
                        type="email"
                        className="form-input"
                        required
                        value={inqEmail}
                        onChange={(e) => setInqEmail(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="inq-type">
                        Inquiry Category
                      </label>
                      <select
                        id="inq-type"
                        className="form-select"
                        value={inqType}
                        onChange={(e) => setInqType(e.target.value)}
                      >
                        <option>Editorial / Commission</option>
                        <option>Fine Art Print Acquisition</option>
                        <option>Commercial / Licensing</option>
                        <option>Portrait Session</option>
                        <option>General Collaboration</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="inq-subject">
                        Subject / Location
                      </label>
                      <input
                        id="inq-subject"
                        type="text"
                        className="form-input"
                        placeholder="Project timeline or edition title"
                        value={inqSubject}
                        onChange={(e) => setInqSubject(e.target.value)}
                      />
                    </div>
                    <div className="form-group full-width">
                      <label className="form-label" htmlFor="inq-message">
                        Project Brief or Message
                      </label>
                      <textarea
                        id="inq-message"
                        className="form-textarea"
                        required
                        placeholder="Share details regarding scope, location, or print edition..."
                        value={inqMessage}
                        onChange={(e) => setInqMessage(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-accent"
                    disabled={inqSubmitting}
                    id="submit-inquiry-btn"
                    style={{ width: '100%', padding: '0.8rem' }}
                  >
                    <Send size={15} />
                    {inqSubmitting ? 'Transmitting Inquiry...' : 'Send Inquiry to Studio'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </main>
      ) : (
        /* Default Public Work / Gallery Page */
        <main className="page-shell">
          <section className="editorial-hero">
            <div>
              <span className="hero-kicker">
                {settings?.location || 'Pacific Northwest · Visual Archive'}
              </span>
              <h1 className="hero-title">
                {settings?.tagline || 'Stillness, Light & Architectural Geometry'}
              </h1>
            </div>

            <div>
              <p className="hero-statement">{settings?.heroStatement}</p>
              <div className="hero-meta-strip">
                <span className="hero-meta-item">
                  Plates: <strong>{photos.length}</strong>
                </span>
                <span className="hero-meta-item">
                  Series: <strong>{collections.length}</strong>
                </span>
                <span className="hero-meta-item">
                  Pipeline: <strong>AVIF + WebP Multi-Tier</strong>
                </span>
                {telemetry && telemetry.totalPhotos > 0 && (
                  <span className="hero-meta-item">
                    Avg Payload Reduction: <strong>-{telemetry.averageSavingsPercent}%</strong>
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Gallery Filter & Layout Toolbar */}
          <div className="gallery-toolbar">
            <div className="filter-pills">
              <button
                type="button"
                className={`filter-pill ${selectedCollectionId === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedCollectionId('all');
                  setSelectedTag(null);
                }}
                id="filter-all-btn"
              >
                All Work <span className="pill-count">{photos.length}</span>
              </button>

              {photos.some((p) => p.isFeatured) && (
                <button
                  type="button"
                  className={`filter-pill ${selectedCollectionId === 'featured' ? 'active' : ''}`}
                  onClick={() => setSelectedCollectionId('featured')}
                  id="filter-featured-btn"
                >
                  Featured{' '}
                  <span className="pill-count">
                    {photos.filter((p) => p.isFeatured).length}
                  </span>
                </button>
              )}

              {collections.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  className={`filter-pill ${selectedCollectionId === col.id ? 'active' : ''}`}
                  onClick={() => setSelectedCollectionId(col.id)}
                >
                  {col.title} <span className="pill-count">{col.photoCount}</span>
                </button>
              ))}

              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`filter-pill ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => setSelectedTag((prev) => (prev === tag ? null : tag))}
                >
                  #{tag}
                </button>
              ))}
            </div>

            <div className="toolbar-right">
              <div className="search-input-wrap">
                <Search size={14} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search plates, camera, tag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  id="gallery-search-input"
                />
              </div>

              <div className="view-mode-group" role="group" aria-label="Gallery View Mode">
                <button
                  type="button"
                  className={`view-mode-btn ${layoutMode === 'masonry' ? 'active' : ''}`}
                  onClick={() => setLayoutMode('masonry')}
                  id="view-mode-masonry-btn"
                  title="Masonry Grid"
                >
                  <LayoutGrid size={14} /> Grid
                </button>
                <button
                  type="button"
                  className={`view-mode-btn ${layoutMode === 'editorial' ? 'active' : ''}`}
                  onClick={() => setLayoutMode('editorial')}
                  id="view-mode-editorial-btn"
                  title="Editorial Museum Plates"
                >
                  <Rows3 size={14} /> Editorial
                </button>
              </div>
            </div>
          </div>

          {/* Active Collection Header Banner */}
          {activeCollection && (
            <div className="collection-banner">
              <div>
                <div className="collection-banner-subtitle">{activeCollection.subtitle}</div>
                <h2 className="collection-banner-title">{activeCollection.title}</h2>
                <p className="collection-banner-desc">{activeCollection.description}</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedCollectionId('all')}
              >
                Show All Series
              </button>
            </div>
          )}

          {/* Gallery Content */}
          {loading ? (
            <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              Loading visual archive...
            </p>
          ) : photos.length === 0 ? (
            /* Empty Initial Archive State (Zero Sample Photos as requested) */
            <div className="empty-archive-card" id="empty-gallery-state">
              <div className="empty-archive-icon">
                <Camera size={24} />
              </div>
              <h2 className="empty-archive-title">Visual Archive Ready for First Plates</h2>
              <p className="empty-archive-desc">
                Your photography portfolio is initialized with zero sample photos. Sign in to the
                Owner Studio to upload your first photographs—each upload is automatically
                converted into responsive AVIF and WebP plates with LQIP blur placeholders and
                optical EXIF extraction.
              </p>

              <div className="empty-pipeline-badges">
                <span className="pipeline-badge">600w Thumb AVIF/WebP</span>
                <span className="pipeline-badge">1400w Gallery AVIF/WebP</span>
                <span className="pipeline-badge">2400w Lightbox AVIF/WebP</span>
                <span className="pipeline-badge">Base64 LQIP Blur-Up</span>
                <span className="pipeline-badge">Optical EXIF · GPS Stripped</span>
              </div>

              <button
                type="button"
                className="btn btn-accent"
                onClick={handleOpenStudioOrLogin}
                id="empty-state-upload-cta"
                style={{ padding: '0.8rem 1.5rem' }}
              >
                <UploadCloud size={16} />
                {authStatus?.authenticated
                  ? 'Open Studio & Upload First Photos'
                  : 'Sign In to Upload First Photos'}
              </button>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="empty-archive-card">
              <h2 className="empty-archive-title">No Matching Plates</h2>
              <p className="empty-archive-desc">
                No photographs matched your current series or search filter.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSelectedCollectionId('all');
                  setSelectedTag(null);
                  setSearchQuery('');
                }}
              >
                Reset Filters
              </button>
            </div>
          ) : layoutMode === 'masonry' ? (
            <div className="masonry-grid" id="portfolio-masonry-grid">
              {filteredPhotos.map((photo, idx) => (
                <article
                  key={photo.id}
                  className="masonry-item"
                  onClick={() => setLightboxIndex(idx)}
                >
                  <OptimizedImage photo={photo} tier="gallery" />
                  <div className="photo-overlay">
                    <h3 className="overlay-title">{photo.title}</h3>
                    <div className="overlay-exif">
                      <span>{formatExifSummary(photo.exif) || `${photo.width}×${photo.height}`}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="editorial-feed" id="portfolio-editorial-feed">
              {filteredPhotos.map((photo, idx) => {
                const col = collections.find((c) => c.id === photo.collectionId);
                return (
                  <article key={photo.id} className="editorial-plate">
                    <div
                      className="editorial-plate-image"
                      onClick={() => setLightboxIndex(idx)}
                    >
                      <OptimizedImage photo={photo} tier="lightbox" />
                    </div>
                    <div className="editorial-plate-info">
                      <span className="plate-index">
                        PLATE {String(idx + 1).padStart(2, '0')}{' '}
                        {col ? `· ${col.title}` : ''}
                      </span>
                      <h2 className="plate-title">{photo.title}</h2>
                      {photo.caption && <p className="plate-caption">{photo.caption}</p>}
                      {photo.location && (
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.74rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <MapPin size={13} /> {photo.location}
                        </div>
                      )}

                      <div className="plate-exif-table">
                        <div>
                          <span className="exif-cell-label">Camera</span>
                          <span className="exif-cell-value">{photo.exif.camera || '—'}</span>
                        </div>
                        <div>
                          <span className="exif-cell-label">Lens</span>
                          <span className="exif-cell-value">{photo.exif.lens || '—'}</span>
                        </div>
                        <div>
                          <span className="exif-cell-label">Exposure</span>
                          <span className="exif-cell-value">
                            {[
                              photo.exif.focalLength,
                              photo.exif.aperture,
                              photo.exif.shutterSpeed,
                              photo.exif.iso,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="exif-cell-label">Web Plate</span>
                          <span className="exif-cell-value" style={{ color: 'var(--accent-warm)' }}>
                            {formatBytes(photo.optimizedSizeBytes)} (-{photo.savingsPercent}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            © {new Date().getFullYear()} {settings?.photographerName || 'Arron McCrory'}. All
            photographs color-managed & served in AVIF/WebP.
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', fontFamily: 'var(--font-mono)' }}>
            <span>SQLite + Sharp Engine</span>
            <button
              type="button"
              onClick={handleOpenStudioOrLogin}
              style={{ color: 'var(--accent-warm)' }}
            >
              {authStatus?.authenticated ? 'Studio Active' : 'Owner Studio Login'}
            </button>
          </div>
        </div>
      </footer>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && filteredPhotos[lightboxIndex] && (
        <Lightbox
          photos={filteredPhotos}
          activeIndex={lightboxIndex}
          collections={collections}
          onClose={() => setLightboxIndex(null)}
          onSelectIndex={(i) => setLightboxIndex(i)}
        />
      )}

      {/* Auth Login Modal */}
      {showAuthModal && (
        <AuthModal
          authStatus={authStatus}
          authError={authError}
          onClose={() => {
            setShowAuthModal(false);
            setAuthError(null);
          }}
          onSuccess={async () => {
            setShowAuthModal(false);
            setAuthError(null);
            await fetchPortfolio();
            setActivePage('studio');
          }}
        />
      )}
    </div>
  );
}

export default App;
