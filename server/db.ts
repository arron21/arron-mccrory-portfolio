import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const DATA_DIR =
  process.env.DATA_DIR ||
  (process.env.VERCEL
    ? '/tmp/portfolio-data'
    : path.resolve(process.cwd(), 'data'));
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

for (const sub of ['thumb', 'gallery', 'lightbox', 'originals']) {
  fs.mkdirSync(path.join(UPLOADS_DIR, sub), { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'portfolio.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    cover_photo_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_public INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_public INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    aspect_ratio REAL NOT NULL,
    dominant_color TEXT NOT NULL DEFAULT '#18181b',
    blur_data_url TEXT NOT NULL DEFAULT '',
    original_filename TEXT NOT NULL,
    original_size_bytes INTEGER NOT NULL,
    optimized_size_bytes INTEGER NOT NULL,
    total_variants_bytes INTEGER NOT NULL DEFAULT 0,
    variants TEXT NOT NULL,
    exif_camera TEXT NOT NULL DEFAULT '',
    exif_lens TEXT NOT NULL DEFAULT '',
    exif_focal_length TEXT NOT NULL DEFAULT '',
    exif_aperture TEXT NOT NULL DEFAULT '',
    exif_shutter_speed TEXT NOT NULL DEFAULT '',
    exif_iso TEXT NOT NULL DEFAULT '',
    exif_taken_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    project_type TEXT NOT NULL DEFAULT 'Editorial / Commission',
    subject TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_json TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface SiteSettings {
  photographerName: string;
  studioTitle: string;
  tagline: string;
  heroStatement: string;
  location: string;
  availabilityStatus: string;
  bioLead: string;
  bioBody: string;
  philosophyQuote: string;
  gearCameras: string[];
  gearLenses: string[];
  gearWorkflow: string[];
  socialGithub: string;
  socialInstagram: string;
  socialEmail: string;
  allowedGithubUser: string;
  allowedGoogleEmail: string;
  webpQuality: number;
  avifQuality: number;
  keepOriginals: boolean;
  fallbackPasscode: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
  photographerName: 'Arron McCrory',
  studioTitle: 'ARRON MCCRORY',
  tagline: 'Stillness, Light & Architectural Geometry',
  heroStatement:
    'An evolving visual archive studying natural luminance, quiet human intervals, and atmospheric landscapes—rendered in museum-grade web plates.',
  location: 'Pacific Northwest · Available Worldwide',
  availabilityStatus: 'Accepting Select Editorial & Print Commissions',
  bioLead:
    'Arron McCrory is a visual artist and photographer focused on the interplay between natural light, architectural form, and transient environmental atmosphere.',
  bioBody:
    'Working across digital medium-format and compact rangefinder systems, every frame in this archive is curated for tonal depth and presented via a custom multi-stage WebP and AVIF color-managed pipeline. Stripped of intrusive tracking metadata while preserving optical exposure telemetry, each photograph is delivered at native aspect ratio.',
  philosophyQuote:
    '“Photography is the discipline of subtracting noise until only light and cadence remain.”',
  gearCameras: [
    'Fujifilm GFX 100 II · Medium Format Digital',
    'Leica Q3 · 28mm Summilux Full-Frame',
    'Fujifilm X-T5 · Everyday Street Body',
  ],
  gearLenses: [
    'GF 55mm f/1.7 R WR',
    'GF 32-64mm f/4 R LM WR',
    'XF 23mm f/1.4 R LM WR',
    'XF 56mm f/1.2 R WR',
  ],
  gearWorkflow: [
    'Capture One Pro — Custom Linear Response Curve',
    'Automated Sharp AVIF (10-bit) & WebP Multi-Tier Pipeline',
    'Calibrated Eizo ColorEdge Reference Grading',
  ],
  socialGithub: 'https://github.com/arron21',
  socialInstagram: 'https://instagram.com/',
  socialEmail: '2738674+arron21@users.noreply.github.com',
  allowedGithubUser: process.env.ALLOWED_GITHUB_USER || 'arron21',
  allowedGoogleEmail:
    process.env.ALLOWED_GOOGLE_EMAIL || '2738674+arron21@users.noreply.github.com',
  webpQuality: 82,
  avifQuality: 68,
  keepOriginals: false,
  fallbackPasscode: process.env.ADMIN_PASSCODE || '',
};

export function initDefaults() {
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('site_settings') as
    | { value: string }
    | undefined;
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(
      'site_settings',
      JSON.stringify(DEFAULT_SETTINGS)
    );
  }

  const colCount = db.prepare('SELECT COUNT(*) as count FROM collections').get() as {
    count: number;
  };
  if (colCount.count === 0) {
    const insertCol = db.prepare(`
      INSERT INTO collections (id, slug, title, subtitle, description, sort_order, is_public)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    insertCol.run(
      crypto.randomUUID(),
      'monoliths-and-light',
      'Monoliths & Light',
      'Series I · Landscape & Atmosphere',
      'Studies of alpine fog, coastal basalt, and high-altitude twilight across changing seasons.',
      1
    );
    insertCol.run(
      crypto.randomUUID(),
      'urban-solitude',
      'Urban Solitude',
      'Series II · Street & Architecture',
      'Geometric intersections, rain-slicked concrete, and fleeting silhouettes in nocturnal transit.',
      2
    );
    insertCol.run(
      crypto.randomUUID(),
      'quiet-portraits',
      'Quiet Portraits',
      'Series III · Editorial & Environmental',
      'Unhurried environmental portraiture sculpted solely with window and ambient light.',
      3
    );
  }
}

initDefaults();

export function getSettings(): SiteSettings {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('site_settings') as
    | { value: string }
    | undefined;
  if (!row) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function updateSettings(partial: Partial<SiteSettings>): SiteSettings {
  const current = getSettings();
  const updated: SiteSettings = { ...current, ...partial };
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('site_settings', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(JSON.stringify(updated));
  return updated;
}

export { DATA_DIR, UPLOADS_DIR };
