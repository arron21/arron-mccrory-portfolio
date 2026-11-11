import React, { useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  Image as ImageIcon,
  FolderKanban,
  Mail,
  Sliders,
  Star,
  Eye,
  EyeOff,
  Trash2,
  Edit3,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Plus,
  X,
  LogOut,
  Wand2,
} from 'lucide-react';
import {
  formatBytes,
  type Photo,
  type Collection,
  type Inquiry,
  type FullSiteSettings,
  type Telemetry,
  type AuthUser,
} from '../types.ts';
import { preparePhotoForUpload } from '../utils/clientOptimizer.ts';

interface StudioDashboardProps {
  user: AuthUser | null;
  onRefreshPublic: () => void;
  onLogout: () => void;
  onExitStudio: () => void;
}

interface StagedFile {
  id: string;
  file: File;
  previewUrl: string;
  title: string;
  caption: string;
}

export const StudioDashboard: React.FC<StudioDashboardProps> = ({
  user,
  onRefreshPublic,
  onLogout,
  onExitStudio,
}) => {
  const [activeTab, setActiveTab] = useState<
    'upload' | 'library' | 'collections' | 'inquiries' | 'settings'
  >('upload');

  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [settings, setSettings] = useState<FullSiteSettings | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Upload state
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadCollectionId, setUploadCollectionId] = useState<string>('');
  const [uploadLocation, setUploadLocation] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadFeatured, setUploadFeatured] = useState(true);
  const [uploadKeepOriginals, setUploadKeepOriginals] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [lastOptimizedBatch, setLastOptimizedBatch] = useState<Photo[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Library Filter & Edit Modal
  const [libCollectionFilter, setLibCollectionFilter] = useState<string>('all');
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);

  // New Collection Form
  const [newColTitle, setNewColTitle] = useState('');
  const [newColSubtitle, setNewColSubtitle] = useState('');
  const [newColDesc, setNewColDesc] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const fetchStudioData = async () => {
    try {
      const res = await fetch('/api/studio/data');
      if (!res.ok) return;
      const data = await res.json();
      setPhotos(data.photos || []);
      setCollections(data.collections || []);
      setInquiries(data.inquiries || []);
      setSettings(data.settings || null);
      setTelemetry(data.telemetry || null);
      if (data.settings) {
        setUploadKeepOriginals(Boolean(data.settings.keepOriginals));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudioData();
  }, []);

  const stageFileList = (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;

    const mapped: StagedFile[] = arr.map((file) => {
      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        title: cleanTitle || 'Untitled Plate',
        caption: '',
      };
    });

    setStagedFiles((prev) => [...prev, ...mapped]);
  };

  // Helper to synthesize a high-res 2800x1866 photographic test plate in-browser so the user can test the optimization pipeline in 1 click if desired
  const handleSynthesizeTestPlate = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Atmospheric twilight gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0d131a');
    grad.addColorStop(0.48, '#1e2936');
    grad.addColorStop(0.75, '#433835');
    grad.addColorStop(1, '#121011');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle solar/lunar luminance orb
    const radial = ctx.createRadialGradient(1680, 620, 20, 1680, 620, 520);
    radial.addColorStop(0, 'rgba(238, 212, 174, 0.85)');
    radial.addColorStop(0.35, 'rgba(210, 168, 120, 0.22)');
    radial.addColorStop(1, 'rgba(15, 18, 24, 0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Layered basalt ridge silhouettes
    const ridges = [
      { yBase: 980, amp: 110, freq: 0.0018, phase: 0.5, color: 'rgba(22, 26, 33, 0.85)' },
      { yBase: 1140, amp: 85, freq: 0.0024, phase: 2.1, color: 'rgba(15, 17, 22, 0.94)' },
      { yBase: 1310, amp: 55, freq: 0.0031, phase: 4.0, color: '#090a0d' },
    ];

    for (const r of ridges) {
      ctx.beginPath();
      ctx.moveTo(0, canvas.height);
      for (let x = 0; x <= canvas.width; x += 20) {
        const y =
          r.yBase +
          Math.sin(x * r.freq + r.phase) * r.amp +
          Math.cos(x * r.freq * 2.3) * (r.amp * 0.35);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fillStyle = r.color;
      ctx.fill();
    }

    blobFromCanvas(canvas, 'image/png', 1.0).then((blob) => {
      if (!blob) return;
      const file = new File([blob], `basalt-twilight-study-${Date.now().toString().slice(-4)}.png`, {
        type: 'image/png',
      });
      stageFileList([file]);
      showToast('Staged 2400×1600 uncompressed master plate for WebP/AVIF optimization.');
    });
  };

  function blobFromCanvas(
    canvas: HTMLCanvasElement,
    type: string,
    quality: number
  ): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  const handleUploadBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stagedFiles.length === 0) return;

    setUploading(true);
    setLastOptimizedBatch([]);

    const uploadedPhotos: Photo[] = [];

    try {
      for (let i = 0; i < stagedFiles.length; i++) {
        const item = stagedFiles[i];
        setUploadProgressText(
          `Pre-optimizing & uploading plate ${i + 1} of ${stagedFiles.length} (${item.title})...`
        );

        const prepared = await preparePhotoForUpload(item.file);
        const targetFilename = prepared.uploadFile.name;

        const formData = new FormData();
        formData.append('photos', prepared.uploadFile);

        if (uploadCollectionId) formData.append('collectionId', uploadCollectionId);
        if (uploadLocation) formData.append('location', uploadLocation);
        if (uploadTags) formData.append('tags', uploadTags);
        formData.append('isFeatured', String(uploadFeatured));
        formData.append('keepOriginals', String(uploadKeepOriginals));
        formData.append('titles', JSON.stringify({ [targetFilename]: item.title }));
        formData.append('captions', JSON.stringify({ [targetFilename]: item.caption }));
        formData.append(
          'clientOriginalSizes',
          JSON.stringify({ [targetFilename]: prepared.originalSizeBytes })
        );
        formData.append(
          'clientExif',
          JSON.stringify({ [targetFilename]: prepared.exif })
        );

        const res = await fetch('/api/photos/upload', {
          method: 'POST',
          body: formData,
        });

        let data: { error?: string; photos?: Photo[] } = {};
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          const text = await res.text();
          data = { error: text.slice(0, 160) || `Upload failed (${res.status})` };
        }

        if (!res.ok) {
          showToast(data.error || `Upload failed on plate ${i + 1}`);
          return;
        }

        if (data.photos && data.photos.length > 0) {
          uploadedPhotos.push(...data.photos);
        }
      }

      stagedFiles.forEach((s) => URL.revokeObjectURL(s.previewUrl));
      setStagedFiles([]);
      setLastOptimizedBatch(uploadedPhotos);
      await fetchStudioData();
      onRefreshPublic();
      showToast(
        `Optimized & published ${uploadedPhotos.length} plate${
          uploadedPhotos.length === 1 ? '' : 's'
        } in AVIF & WebP.`
      );
    } catch {
      showToast('Network error while uploading photos.');
    } finally {
      setUploading(false);
      setUploadProgressText('');
    }
  };

  const handleQuickToggle = async (photo: Photo, field: 'isFeatured' | 'isPublic') => {
    await fetch(`/api/photos/${photo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: !photo[field] }),
    });
    await fetchStudioData();
    onRefreshPublic();
  };

  const handleMovePhoto = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= photos.length) return;
    const next = [...photos];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setPhotos(next);

    await fetch('/api/photos/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: next.map((p) => p.id) }),
    });
    onRefreshPublic();
  };

  const handleDeletePhoto = async (id: string) => {
    await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    await fetchStudioData();
    onRefreshPublic();
    showToast('Plate and all associated WebP/AVIF derivatives deleted.');
  };

  const handleSavePhotoEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPhoto) return;

    const res = await fetch(`/api/photos/${editingPhoto.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingPhoto),
    });

    if (res.ok) {
      setEditingPhoto(null);
      await fetchStudioData();
      onRefreshPublic();
      showToast('Plate metadata and optical EXIF updated.');
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColTitle.trim()) return;
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newColTitle,
        subtitle: newColSubtitle,
        description: newColDesc,
        isPublic: true,
      }),
    });
    if (res.ok) {
      setNewColTitle('');
      setNewColSubtitle('');
      setNewColDesc('');
      await fetchStudioData();
      onRefreshPublic();
      showToast('New photographic series created.');
    }
  };

  const handleDeleteCollection = async (id: string) => {
    await fetch(`/api/collections/${id}`, { method: 'DELETE' });
    await fetchStudioData();
    onRefreshPublic();
    showToast('Series removed (photos remain in archive).');
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      await fetchStudioData();
      onRefreshPublic();
      showToast('Studio profile, OAuth allowlist, and optimization settings saved.');
    }
  };

  const unreadInquiries = inquiries.filter((i) => !i.isRead).length;
  const filteredLibraryPhotos =
    libCollectionFilter === 'all'
      ? photos
      : libCollectionFilter === 'unassigned'
      ? photos.filter((p) => !p.collectionId)
      : photos.filter((p) => p.collectionId === libCollectionFilter);

  if (loading) {
    return (
      <div className="page-shell">
        <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          Loading Studio Workspace...
        </p>
      </div>
    );
  }

  return (
    <div className="page-shell" id="studio-workspace">
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 950,
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-warm)',
            color: 'var(--text-primary)',
            padding: '0.85rem 1.2rem',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.84rem',
          }}
        >
          <CheckCircle2 size={16} style={{ color: 'var(--accent-warm)' }} />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.75rem',
          paddingBottom: '1.25rem',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <span className="hero-kicker" style={{ marginBottom: '0.25rem' }}>
            Curatorial Darkroom & Web Optimizer
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.35rem',
              fontWeight: 500,
              lineHeight: 1.1,
            }}
          >
            Studio Management
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onExitStudio}
            id="view-public-gallery-btn"
          >
            View Public Portfolio
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onLogout}
            id="studio-logout-btn"
          >
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </div>

      {/* Telemetry Strip */}
      {telemetry && (
        <div className="telemetry-strip">
          <div className="telemetry-card">
            <div className="telemetry-label">Published Plates</div>
            <div className="telemetry-value">{telemetry.totalPhotos}</div>
            <div className="telemetry-sub">{collections.length} Curated Series</div>
          </div>
          <div className="telemetry-card">
            <div className="telemetry-label">Raw Camera Input</div>
            <div className="telemetry-value">{formatBytes(telemetry.totalOriginalBytes)}</div>
            <div className="telemetry-sub">Master Upload Stream</div>
          </div>
          <div className="telemetry-card">
            <div className="telemetry-label">Served Web Payload</div>
            <div className="telemetry-value" style={{ color: 'var(--accent-warm)' }}>
              {formatBytes(telemetry.totalOptimizedBytes)}
            </div>
            <div className="telemetry-sub">AVIF + WebP Gallery Tier</div>
          </div>
          <div className="telemetry-card">
            <div className="telemetry-label">Web Compression Efficiency</div>
            <div className="telemetry-value" style={{ color: 'var(--status-success)' }}>
              {telemetry.totalPhotos > 0 ? `-${telemetry.averageSavingsPercent}%` : 'Ready'}
            </div>
            <div className="telemetry-sub">
              {formatBytes(telemetry.bytesSaved || 0)} Bandwidth Saved
            </div>
          </div>
        </div>
      )}

      <div className="studio-shell">
        {/* Sidebar Navigation */}
        <aside className="studio-sidebar">
          <div className="studio-user-box">
            <div className="studio-avatar">
              {(user?.name || 'AM')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                }}
              >
                {user?.name || 'Arron McCrory'}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: 'var(--text-muted)',
                }}
              >
                @{user?.username || 'arron21'}
              </div>
            </div>
          </div>

          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
            id="studio-tab-upload"
          >
            <span className="studio-tab-btn-left">
              <UploadCloud size={16} /> Upload & Optimize
            </span>
          </button>

          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
            id="studio-tab-library"
          >
            <span className="studio-tab-btn-left">
              <ImageIcon size={16} /> Photo Archive
            </span>
            <span className="studio-badge">{photos.length}</span>
          </button>

          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'collections' ? 'active' : ''}`}
            onClick={() => setActiveTab('collections')}
            id="studio-tab-collections"
          >
            <span className="studio-tab-btn-left">
              <FolderKanban size={16} /> Collections
            </span>
            <span className="studio-badge">{collections.length}</span>
          </button>

          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'inquiries' ? 'active' : ''}`}
            onClick={() => setActiveTab('inquiries')}
            id="studio-tab-inquiries"
          >
            <span className="studio-tab-btn-left">
              <Mail size={16} /> Inquiries
            </span>
            {unreadInquiries > 0 && (
              <span
                className="studio-badge"
                style={{ background: 'var(--accent-warm)', color: '#0a0a0b', fontWeight: 600 }}
              >
                {unreadInquiries}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`studio-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            id="studio-tab-settings"
          >
            <span className="studio-tab-btn-left">
              <Sliders size={16} /> Profile & Settings
            </span>
          </button>
        </aside>

        {/* Main Studio Panel */}
        <section>
          {activeTab === 'upload' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.85rem',
                      fontWeight: 500,
                    }}
                  >
                    Batch Web Optimization Pipeline
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    Drop high-resolution JPEG, PNG, TIFF, WebP, or AVIF files. Automatically
                    generates 6 responsive AVIF + WebP derivatives (600w, 1400w, 2400w), extracts
                    optical EXIF, and strips GPS location metadata.
                  </p>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSynthesizeTestPlate}
                  id="synthesize-test-photo-btn"
                  title="Generate a 2400x1600 high-resolution test frame in browser to test the server optimization pipeline"
                >
                  <Wand2 size={15} /> Stage 2400×1600 Test Frame
                </button>
              </div>

              <div
                className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) {
                    stageFileList(e.dataTransfer.files);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                id="photo-upload-dropzone"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/avif,image/tiff"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files) stageFileList(e.target.files);
                    e.target.value = '';
                  }}
                  id="photo-file-input"
                />
                <div className="empty-archive-icon" style={{ marginBottom: '0.85rem' }}>
                  <UploadCloud size={24} />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.55rem',
                    marginBottom: '0.3rem',
                  }}
                >
                  Drag & drop master photographs here, or click to browse
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Up to 25 files per batch · Max 60 MB per file · Auto-WebP ({settings?.webpQuality}
                  %) & AVIF ({settings?.avifQuality}%)
                </div>
              </div>

              {stagedFiles.length > 0 && (
                <form
                  onSubmit={handleUploadBatch}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.5rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1rem',
                    }}
                  >
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.4rem',
                        fontWeight: 500,
                      }}
                    >
                      Staged Batch ({stagedFiles.length} file{stagedFiles.length === 1 ? '' : 's'})
                    </h3>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        stagedFiles.forEach((s) => URL.revokeObjectURL(s.previewUrl));
                        setStagedFiles([]);
                      }}
                    >
                      Clear Queue
                    </button>
                  </div>

                  <div className="form-grid" style={{ marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="upload-collection-select">
                        Assign to Collection / Series
                      </label>
                      <select
                        id="upload-collection-select"
                        className="form-select"
                        value={uploadCollectionId}
                        onChange={(e) => setUploadCollectionId(e.target.value)}
                      >
                        <option value="">— Unassigned (General Archive) —</option>
                        {collections.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.title} ({col.subtitle})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="upload-location-input">
                        Location (Optional)
                      </label>
                      <input
                        id="upload-location-input"
                        type="text"
                        className="form-input"
                        placeholder="e.g., Puget Sound, WA"
                        value={uploadLocation}
                        onChange={(e) => setUploadLocation(e.target.value)}
                      />
                    </div>

                    <div className="form-group full-width">
                      <label className="form-label" htmlFor="upload-tags-input">
                        Tags (Comma-separated)
                      </label>
                      <input
                        id="upload-tags-input"
                        type="text"
                        className="form-input"
                        placeholder="e.g., monochrome, architecture, twilight, medium-format"
                        value={uploadTags}
                        onChange={(e) => setUploadTags(e.target.value)}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '1.5rem',
                      marginBottom: '1.25rem',
                      fontSize: '0.84rem',
                    }}
                  >
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={uploadFeatured}
                        onChange={(e) => setUploadFeatured(e.target.checked)}
                      />
                      <span>Feature on Portfolio Homepage</span>
                    </label>

                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={uploadKeepOriginals}
                        onChange={(e) => setUploadKeepOriginals(e.target.checked)}
                      />
                      <span>Keep untouched original upload on disk (otherwise discard raw file)</span>
                    </label>
                  </div>

                  <div className="staged-files-list">
                    {stagedFiles.map((item, idx) => (
                      <div key={item.id} className="staged-file-row">
                        <img
                          src={item.previewUrl}
                          alt={item.title}
                          className="staged-thumb"
                        />
                        <div>
                          <input
                            type="text"
                            className="form-input"
                            value={item.title}
                            placeholder="Plate Title"
                            onChange={(e) => {
                              const val = e.target.value;
                              setStagedFiles((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, title: val } : p))
                              );
                            }}
                          />
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.68rem',
                              color: 'var(--text-muted)',
                              marginTop: '0.25rem',
                            }}
                          >
                            {item.file.name} · {formatBytes(item.file.size)}
                          </div>
                        </div>
                        <input
                          type="text"
                          className="form-input"
                          value={item.caption}
                          placeholder="Editorial caption or field note (optional)..."
                          onChange={(e) => {
                            const val = e.target.value;
                            setStagedFiles((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, caption: val } : p))
                            );
                          }}
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => {
                            URL.revokeObjectURL(item.previewUrl);
                            setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          title="Remove from queue"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="btn btn-accent"
                    disabled={uploading}
                    id="execute-upload-optimize-btn"
                    style={{ width: '100%', padding: '0.85rem' }}
                  >
                    <Sparkles size={16} />
                    {uploading
                      ? uploadProgressText ||
                        'Running Sharp Multi-Tier AVIF + WebP Optimization Pipeline...'
                      : `Optimize & Publish ${stagedFiles.length} Plate${
                          stagedFiles.length === 1 ? '' : 's'
                        }`}
                  </button>
                </form>
              )}

              {/* Live Optimization Report after upload */}
              {lastOptimizedBatch.length > 0 && (
                <div className="opt-report-card" id="optimization-telemetry-report">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.74rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--status-success)',
                      marginBottom: '0.85rem',
                    }}
                  >
                    <CheckCircle2 size={16} /> Web Optimization Complete · Derivative Telemetry
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    {lastOptimizedBatch.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '1rem',
                          display: 'grid',
                          gridTemplateColumns: '88px 1fr',
                          gap: '1.1rem',
                          alignItems: 'center',
                        }}
                      >
                        <img
                          src={p.variants.thumb_webp?.url}
                          alt={p.title}
                          style={{
                            width: '88px',
                            height: '64px',
                            objectFit: 'cover',
                            borderRadius: '3px',
                          }}
                        />
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              justifyContent: 'space-between',
                              gap: '0.5rem',
                              marginBottom: '0.35rem',
                            }}
                          >
                            <strong>{p.title}</strong>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.75rem',
                                color: 'var(--status-success)',
                              }}
                            >
                              {formatBytes(p.originalSizeBytes)} →{' '}
                              {formatBytes(p.optimizedSizeBytes)} (-{p.savingsPercent}% Web
                              Payload)
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.68rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            <span className="pipeline-badge">
                              Thumb AVIF: {formatBytes(p.variants.thumb_avif?.bytes || 0)}
                            </span>
                            <span className="pipeline-badge">
                              Thumb WebP: {formatBytes(p.variants.thumb_webp?.bytes || 0)}
                            </span>
                            <span className="pipeline-badge">
                              Gallery AVIF (1400w):{' '}
                              {formatBytes(p.variants.gallery_avif?.bytes || 0)}
                            </span>
                            <span className="pipeline-badge">
                              Gallery WebP (1400w):{' '}
                              {formatBytes(p.variants.gallery_webp?.bytes || 0)}
                            </span>
                            <span className="pipeline-badge">
                              Lightbox AVIF (2400w):{' '}
                              {formatBytes(p.variants.lightbox_avif?.bytes || 0)}
                            </span>
                            <span className="pipeline-badge">
                              LQIP Blur + Dominant {p.dominantColor}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'library' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div>
                  <h2
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.85rem',
                      fontWeight: 500,
                    }}
                  >
                    Curated Archive ({filteredLibraryPhotos.length})
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                    Manage plate sequence, featured status, optical EXIF metadata, and public
                    visibility.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                  <select
                    className="form-select"
                    style={{ width: 'auto' }}
                    value={libCollectionFilter}
                    onChange={(e) => setLibCollectionFilter(e.target.value)}
                  >
                    <option value="all">All Collections ({photos.length})</option>
                    <option value="unassigned">Unassigned</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-accent"
                    onClick={() => setActiveTab('upload')}
                  >
                    <Plus size={15} /> Upload New Plates
                  </button>
                </div>
              </div>

              {filteredLibraryPhotos.length === 0 ? (
                <div className="empty-archive-card">
                  <div className="empty-archive-title">No Plates in This View</div>
                  <p className="empty-archive-desc">
                    Upload your first photograph in the Web Optimizer tab to populate your archive.
                  </p>
                  <button
                    type="button"
                    className="btn btn-accent"
                    onClick={() => setActiveTab('upload')}
                  >
                    <UploadCloud size={15} /> Go to Upload & Optimizer
                  </button>
                </div>
              ) : (
                <div className="studio-photo-grid">
                  {filteredLibraryPhotos.map((photo, idx) => {
                    const col = collections.find((c) => c.id === photo.collectionId);
                    return (
                      <div key={photo.id} className="studio-photo-card">
                        <div className="studio-photo-thumb">
                          <img
                            src={photo.variants.thumb_webp?.url || photo.variants.gallery_webp?.url}
                            alt={photo.title}
                          />
                          <div className="studio-photo-badges">
                            <span className="chip">
                              {photo.width}×{photo.height}
                            </span>
                            <span className="chip savings">
                              -{photo.savingsPercent}% ({formatBytes(photo.optimizedSizeBytes)})
                            </span>
                          </div>
                        </div>

                        <div className="studio-photo-body">
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.66rem',
                              textTransform: 'uppercase',
                              color: 'var(--accent-warm)',
                            }}
                          >
                            {col ? col.title : 'General Archive'}
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: '1.3rem',
                              fontWeight: 500,
                              lineHeight: 1.2,
                            }}
                          >
                            {photo.title}
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.69rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {[
                              photo.exif.camera,
                              photo.exif.focalLength,
                              photo.exif.aperture,
                              photo.exif.shutterSpeed,
                              photo.exif.iso,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'No EXIF tags set — click Edit to add'}
                          </div>

                          <div className="studio-photo-actions">
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => handleQuickToggle(photo, 'isFeatured')}
                                title={
                                  photo.isFeatured ? 'Featured on Homepage' : 'Mark as Featured'
                                }
                                style={
                                  photo.isFeatured
                                    ? {
                                        color: 'var(--accent-warm)',
                                        borderColor: 'var(--accent-warm)',
                                      }
                                    : undefined
                                }
                              >
                                <Star size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => handleQuickToggle(photo, 'isPublic')}
                                title={photo.isPublic ? 'Publicly Visible' : 'Hidden Draft'}
                              >
                                {photo.isPublic ? <Eye size={14} /> : <EyeOff size={14} />}
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => handleMovePhoto(idx, -1)}
                                disabled={idx === 0}
                                title="Move Earlier"
                              >
                                <ArrowLeft size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => handleMovePhoto(idx, 1)}
                                disabled={idx === filteredLibraryPhotos.length - 1}
                                title="Move Later"
                              >
                                <ArrowRight size={14} />
                              </button>
                            </div>

                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setEditingPhoto(photo)}
                                title="Edit Title, Story & EXIF"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => handleDeletePhoto(photo.id)}
                                title="Delete Plate"
                                style={{ color: 'var(--status-danger)' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'collections' && (
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.85rem',
                  fontWeight: 500,
                  marginBottom: '0.35rem',
                }}
              >
                Photographic Series & Collections
              </h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.88rem',
                  marginBottom: '1.5rem',
                }}
              >
                Organize your portfolio into thematic essays or bodies of work.
              </p>

              <form
                onSubmit={handleCreateCollection}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.4rem',
                  marginBottom: '2rem',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.35rem',
                    marginBottom: '1rem',
                  }}
                >
                  Create New Series
                </h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Series Title</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Pacific Nocturnes"
                      value={newColTitle}
                      onChange={(e) => setNewColTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Series Subtitle / Number</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g., Series IV · Coastal Long Exposure"
                      value={newColSubtitle}
                      onChange={(e) => setNewColSubtitle(e.target.value)}
                    />
                  </div>
                  <div className="form-group full-width">
                    <label className="form-label">Curatorial Statement</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Brief description of this body of work..."
                      value={newColDesc}
                      onChange={(e) => setNewColDesc(e.target.value)}
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-accent">
                  <Plus size={15} /> Create Series
                </button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {collections.map((col) => (
                  <div
                    key={col.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
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
                          color: 'var(--accent-warm)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {col.subtitle || 'Curated Series'} · {col.photoCount} Plates
                      </div>
                      <h4
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '1.5rem',
                          fontWeight: 500,
                        }}
                      >
                        {col.title}
                      </h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
                        {col.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => handleDeleteCollection(col.id)}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'inquiries' && (
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.85rem',
                  fontWeight: 500,
                  marginBottom: '0.35rem',
                }}
              >
                Commission & Print Inquiries ({inquiries.length})
              </h2>
              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.88rem',
                  marginBottom: '1.5rem',
                }}
              >
                Direct messages submitted via the public Contact form are stored in your local
                SQLite database.
              </p>

              {inquiries.length === 0 ? (
                <div className="empty-archive-card">
                  <div className="empty-archive-title">No Inquiries Yet</div>
                  <p className="empty-archive-desc">
                    Messages submitted through the Contact & Commissions page will appear here.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {inquiries.map((inq) => (
                    <div
                      key={inq.id}
                      style={{
                        background: 'var(--bg-elevated)',
                        border: `1px solid ${
                          inq.isRead ? 'var(--border-subtle)' : 'var(--accent-warm)'
                        }`,
                        borderRadius: 'var(--radius-md)',
                        padding: '1.35rem 1.5rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                          marginBottom: '0.6rem',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.68rem',
                              color: 'var(--accent-warm)',
                              textTransform: 'uppercase',
                              marginRight: '0.75rem',
                            }}
                          >
                            {inq.projectType}
                          </span>
                          <strong>{inq.name}</strong> ({inq.email})
                        </div>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {inq.createdAt}
                        </span>
                      </div>
                      {inq.subject && (
                        <div style={{ fontWeight: 500, marginBottom: '0.4rem' }}>
                          {inq.subject}
                        </div>
                      )}
                      <p
                        style={{
                          color: 'var(--text-secondary)',
                          fontSize: '0.9rem',
                          marginBottom: '1rem',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {inq.message}
                      </p>
                      <div style={{ display: 'flex', gap: '0.6rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={async () => {
                            await fetch(`/api/inquiries/${inq.id}/read`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ isRead: !inq.isRead }),
                            });
                            await fetchStudioData();
                          }}
                        >
                          {inq.isRead ? 'Mark Unread' : 'Mark Read'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={async () => {
                            await fetch(`/api/inquiries/${inq.id}`, { method: 'DELETE' });
                            await fetchStudioData();
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && settings && (
            <form
              onSubmit={handleSaveSettings}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1.75rem',
              }}
            >
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.85rem',
                  fontWeight: 500,
                  marginBottom: '1.25rem',
                }}
              >
                Portfolio Identity, Optimization & OAuth Settings
              </h2>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Photographer Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.photographerName}
                    onChange={(e) =>
                      setSettings({ ...settings, photographerName: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Header Masthead Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.studioTitle}
                    onChange={(e) => setSettings({ ...settings, studioTitle: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Editorial Tagline</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.tagline}
                    onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Location & Availability</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.location}
                    onChange={(e) => setSettings({ ...settings, location: e.target.value })}
                  />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Homepage Hero Statement</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: '76px' }}
                    value={settings.heroStatement}
                    onChange={(e) =>
                      setSettings({ ...settings, heroStatement: e.target.value })
                    }
                  />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Biography Lead</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: '76px' }}
                    value={settings.bioLead}
                    onChange={(e) => setSettings({ ...settings, bioLead: e.target.value })}
                  />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Biography Body</label>
                  <textarea
                    className="form-textarea"
                    value={settings.bioBody}
                    onChange={(e) => setSettings({ ...settings, bioBody: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    WebP Compression Quality ({settings.webpQuality}%)
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={98}
                    className="form-input"
                    value={settings.webpQuality}
                    onChange={(e) =>
                      setSettings({ ...settings, webpQuality: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    AVIF Compression Quality ({settings.avifQuality}%)
                  </label>
                  <input
                    type="number"
                    min={40}
                    max={95}
                    className="form-input"
                    value={settings.avifQuality}
                    onChange={(e) =>
                      setSettings({ ...settings, avifQuality: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Allowed GitHub Username (OAuth)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={settings.allowedGithubUser}
                    onChange={(e) =>
                      setSettings({ ...settings, allowedGithubUser: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Allowed Google Email (OAuth)</label>
                  <input
                    type="email"
                    className="form-input"
                    value={settings.allowedGoogleEmail}
                    onChange={(e) =>
                      setSettings({ ...settings, allowedGoogleEmail: e.target.value })
                    }
                  />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">
                    Optional Studio Fallback Passcode (Leave blank for 1-click local owner login)
                  </label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Optional passcode..."
                    value={settings.fallbackPasscode}
                    onChange={(e) =>
                      setSettings({ ...settings, fallbackPasscode: e.target.value })
                    }
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-accent" id="save-studio-settings-btn">
                Save Studio & Pipeline Configuration
              </button>
            </form>
          )}
        </section>
      </div>

      {/* Edit Photo & EXIF Modal */}
      {editingPhoto && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Edit Plate & Optical EXIF</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setEditingPhoto(null)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePhotoEdit}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Plate Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingPhoto.title}
                    onChange={(e) =>
                      setEditingPhoto({ ...editingPhoto, title: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Collection / Series</label>
                  <select
                    className="form-select"
                    value={editingPhoto.collectionId || ''}
                    onChange={(e) =>
                      setEditingPhoto({
                        ...editingPhoto,
                        collectionId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">— General Archive —</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group full-width">
                  <label className="form-label">Caption / Story</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: '72px' }}
                    value={editingPhoto.caption}
                    onChange={(e) =>
                      setEditingPhoto({ ...editingPhoto, caption: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingPhoto.location}
                    onChange={(e) =>
                      setEditingPhoto({ ...editingPhoto, location: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tags (Comma-separated)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingPhoto.tags.join(', ')}
                    onChange={(e) =>
                      setEditingPhoto({
                        ...editingPhoto,
                        tags: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Camera Body</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Fujifilm GFX 100 II"
                    value={editingPhoto.exif.camera}
                    onChange={(e) =>
                      setEditingPhoto({
                        ...editingPhoto,
                        exif: { ...editingPhoto.exif, camera: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Lens</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., GF 55mm f/1.7 R WR"
                    value={editingPhoto.exif.lens}
                    onChange={(e) =>
                      setEditingPhoto({
                        ...editingPhoto,
                        exif: { ...editingPhoto.exif, lens: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Focal Length</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., 55mm"
                    value={editingPhoto.exif.focalLength}
                    onChange={(e) =>
                      setEditingPhoto({
                        ...editingPhoto,
                        exif: { ...editingPhoto.exif, focalLength: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Aperture</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., f/2.0"
                    value={editingPhoto.exif.aperture}
                    onChange={(e) =>
                      setEditingPhoto({
                        ...editingPhoto,
                        exif: { ...editingPhoto.exif, aperture: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Shutter Speed</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., 1/500s"
                    value={editingPhoto.exif.shutterSpeed}
                    onChange={(e) =>
                      setEditingPhoto({
                        ...editingPhoto,
                        exif: { ...editingPhoto.exif, shutterSpeed: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">ISO</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., ISO 160"
                    value={editingPhoto.exif.iso}
                    onChange={(e) =>
                      setEditingPhoto({
                        ...editingPhoto,
                        exif: { ...editingPhoto.exif, iso: e.target.value },
                      })
                    }
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingPhoto(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-accent">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
