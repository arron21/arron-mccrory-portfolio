import React, { useEffect, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Info,
  ZoomIn,
  ZoomOut,
  Camera,
  MapPin,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { formatBytes, type Photo, type Collection } from '../types.ts';

interface LightboxProps {
  photos: Photo[];
  activeIndex: number;
  collections: Collection[];
  onClose: () => void;
  onSelectIndex: (index: number) => void;
}

export const Lightbox: React.FC<LightboxProps> = ({
  photos,
  activeIndex,
  collections,
  onClose,
  onSelectIndex,
}) => {
  const [showDrawer, setShowDrawer] = useState(true);
  const [zoomed, setZoomed] = useState(false);

  const photo = photos[activeIndex];

  useEffect(() => {
    setZoomed(false);
  }, [activeIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') {
        onSelectIndex((activeIndex - 1 + photos.length) % photos.length);
      }
      if (e.key === 'ArrowRight') {
        onSelectIndex((activeIndex + 1) % photos.length);
      }
      if (e.key.toLowerCase() === 'i') {
        setShowDrawer((prev) => !prev);
      }
      if (e.key.toLowerCase() === 'z') {
        setZoomed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIndex, photos.length, onClose, onSelectIndex]);

  if (!photo) return null;

  const collection = collections.find((c) => c.id === photo.collectionId);
  const lightboxAvif = photo.variants.lightbox_avif || photo.variants.gallery_avif;
  const lightboxWebp = photo.variants.lightbox_webp || photo.variants.gallery_webp;

  return (
    <div className="lightbox-backdrop" id="portfolio-lightbox" role="dialog" aria-modal="true">
      <div className="lightbox-top">
        <div className="lightbox-counter">
          <span>
            PLATE {String(activeIndex + 1).padStart(2, '0')} /{' '}
            {String(photos.length).padStart(2, '0')}
          </span>
          {collection && (
            <span style={{ color: 'var(--accent-warm)' }}>· {collection.title}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setZoomed((z) => !z)}
            title="Toggle Zoom (Z)"
            id="lightbox-zoom-btn"
          >
            {zoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setShowDrawer((d) => !d)}
            title="Toggle Technical Info (I)"
            id="lightbox-info-btn"
            style={
              showDrawer
                ? { borderColor: 'var(--accent-warm)', color: 'var(--accent-warm)' }
                : undefined
            }
          >
            <Info size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title="Close Lightbox (Esc)"
            id="lightbox-close-btn"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      <div className="lightbox-stage-wrap">
        <div className="lightbox-stage" onClick={() => setZoomed((z) => !z)}>
          {photos.length > 1 && (
            <button
              type="button"
              className="lightbox-nav-btn prev"
              onClick={(e) => {
                e.stopPropagation();
                onSelectIndex((activeIndex - 1 + photos.length) % photos.length);
              }}
              aria-label="Previous plate"
              id="lightbox-prev-btn"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          <picture>
            {lightboxAvif?.url && <source srcSet={lightboxAvif.url} type="image/avif" />}
            {lightboxWebp?.url && <source srcSet={lightboxWebp.url} type="image/webp" />}
            <img
              src={lightboxWebp?.url || lightboxAvif?.url}
              alt={photo.title}
              className={zoomed ? 'zoomed' : ''}
            />
          </picture>

          {photos.length > 1 && (
            <button
              type="button"
              className="lightbox-nav-btn next"
              onClick={(e) => {
                e.stopPropagation();
                onSelectIndex((activeIndex + 1) % photos.length);
              }}
              aria-label="Next plate"
              id="lightbox-next-btn"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>

        {showDrawer && (
          <aside className="lightbox-drawer">
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--accent-warm)',
                  marginBottom: '0.35rem',
                }}
              >
                {collection ? collection.title : 'Selected Archive'}
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.85rem',
                  fontWeight: 500,
                  lineHeight: 1.15,
                }}
              >
                {photo.title}
              </h2>
            </div>

            {photo.caption && (
              <p style={{ fontSize: '0.88rem', color: '#b8b4aa', lineHeight: 1.65 }}>
                {photo.caption}
              </p>
            )}

            {(photo.location || photo.exif.takenAt) && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.85rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: '#9c988e',
                }}
              >
                {photo.location && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <MapPin size={13} /> {photo.location}
                  </span>
                )}
                {photo.exif.takenAt && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Calendar size={13} /> {photo.exif.takenAt}
                  </span>
                )}
              </div>
            )}

            <div
              style={{
                borderTop: '1px solid rgba(255,255,255,0.08)',
                paddingTop: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#9c988e',
                  marginBottom: '0.75rem',
                }}
              >
                <Camera size={13} /> Optical & Exposure Telemetry
              </div>
              <div className="plate-exif-table" style={{ borderTop: 'none', paddingTop: 0 }}>
                <div>
                  <span className="exif-cell-label">Body</span>
                  <span className="exif-cell-value">{photo.exif.camera || '—'}</span>
                </div>
                <div>
                  <span className="exif-cell-label">Glass</span>
                  <span className="exif-cell-value">{photo.exif.lens || '—'}</span>
                </div>
                <div>
                  <span className="exif-cell-label">Focal Length</span>
                  <span className="exif-cell-value">{photo.exif.focalLength || '—'}</span>
                </div>
                <div>
                  <span className="exif-cell-label">Aperture</span>
                  <span className="exif-cell-value">{photo.exif.aperture || '—'}</span>
                </div>
                <div>
                  <span className="exif-cell-label">Shutter</span>
                  <span className="exif-cell-value">{photo.exif.shutterSpeed || '—'}</span>
                </div>
                <div>
                  <span className="exif-cell-label">Sensitivity</span>
                  <span className="exif-cell-value">{photo.exif.iso || '—'}</span>
                </div>
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid rgba(255,255,255,0.08)',
                paddingTop: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--accent-warm)',
                  marginBottom: '0.6rem',
                }}
              >
                <Sparkles size={13} /> Web Optimization Delivery
              </div>
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '4px',
                  padding: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.71rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#8e8a80' }}>Master Resolution:</span>
                  <span>
                    {photo.width} × {photo.height} px
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#8e8a80' }}>Source File:</span>
                  <span>{formatBytes(photo.originalSizeBytes)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#8e8a80' }}>Web AVIF/WebP:</span>
                  <span style={{ color: '#6ee7b7' }}>
                    {formatBytes(photo.optimizedSizeBytes)} (-{photo.savingsPercent}%)
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#8e8a80' }}>GPS / Private EXIF:</span>
                  <span>Stripped</span>
                </div>
              </div>
            </div>

            {photo.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: 'auto' }}>
                {photo.tags.map((tag) => (
                  <span key={tag} className="chip">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      {photos.length > 1 && (
        <div className="lightbox-filmstrip">
          {photos.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              className={`filmstrip-thumb ${idx === activeIndex ? 'active' : ''}`}
              onClick={() => onSelectIndex(idx)}
              title={p.title}
            >
              <img
                src={p.variants.thumb_webp?.url || p.variants.gallery_webp?.url}
                alt={p.title}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
