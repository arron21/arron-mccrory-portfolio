import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { db, getSettings, updateSettings, UPLOADS_DIR, type SiteSettings } from './db.ts';
import { optimizeUploadedPhoto, deletePhotoFiles } from './optimizer.ts';
import { registerAuthRoutes, requireAdmin, getSessionUser } from './auth.ts';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Serve optimized WebP/AVIF derivatives with aggressive caching
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    maxAge: '365d',
    immutable: true,
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 60 * 1024 * 1024, // 60 MB max per raw image
    files: 25,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/avif',
      'image/tiff',
    ];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image format: ${file.mimetype}`));
    }
  },
});

interface RawPhotoRow {
  id: string;
  title: string;
  caption: string;
  location: string;
  collection_id: string | null;
  tags: string;
  is_featured: number;
  is_public: number;
  sort_order: number;
  width: number;
  height: number;
  aspect_ratio: number;
  dominant_color: string;
  blur_data_url: string;
  original_filename: string;
  original_size_bytes: number;
  optimized_size_bytes: number;
  total_variants_bytes: number;
  variants: string;
  exif_camera: string;
  exif_lens: string;
  exif_focal_length: string;
  exif_aperture: string;
  exif_shutter_speed: string;
  exif_iso: string;
  exif_taken_at: string;
  created_at: string;
  updated_at: string;
}

function serializePhoto(row: RawPhotoRow) {
  let tags: string[] = [];
  let variants: Record<string, unknown> = {};
  try {
    tags = JSON.parse(row.tags);
  } catch {
    tags = [];
  }
  try {
    variants = JSON.parse(row.variants);
  } catch {
    variants = {};
  }

  const savingsRatio =
    row.original_size_bytes > 0
      ? Math.max(0, 1 - row.optimized_size_bytes / row.original_size_bytes)
      : 0;

  return {
    id: row.id,
    title: row.title,
    caption: row.caption,
    location: row.location,
    collectionId: row.collection_id,
    tags,
    isFeatured: Boolean(row.is_featured),
    isPublic: Boolean(row.is_public),
    sortOrder: row.sort_order,
    width: row.width,
    height: row.height,
    aspectRatio: row.aspect_ratio,
    dominantColor: row.dominant_color,
    blurDataUrl: row.blur_data_url,
    originalFilename: row.original_filename,
    originalSizeBytes: row.original_size_bytes,
    optimizedSizeBytes: row.optimized_size_bytes,
    totalVariantsBytes: row.total_variants_bytes,
    savingsPercent: Number((savingsRatio * 100).toFixed(1)),
    variants,
    exif: {
      camera: row.exif_camera,
      lens: row.exif_lens,
      focalLength: row.exif_focal_length,
      aperture: row.exif_aperture,
      shutterSpeed: row.exif_shutter_speed,
      iso: row.exif_iso,
      takenAt: row.exif_taken_at,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const api = express.Router();
registerAuthRoutes(api);

// Public Portfolio Data
api.get('/portfolio', (req: Request, res: Response) => {
  const settings = getSettings();
  const isAdmin = Boolean(getSessionUser(req));

  const rawPhotos = db
    .prepare(
      `SELECT * FROM photos
       WHERE is_public = 1
       ORDER BY sort_order ASC, created_at DESC`
    )
    .all() as unknown as RawPhotoRow[];

  const photos = rawPhotos.map(serializePhoto);

  const rawCollections = db
    .prepare(
      `SELECT * FROM collections
       WHERE is_public = 1
       ORDER BY sort_order ASC, created_at ASC`
    )
    .all() as Array<{
    id: string;
    slug: string;
    title: string;
    subtitle: string;
    description: string;
    cover_photo_id: string | null;
    sort_order: number;
    is_public: number;
    created_at: string;
  }>;

  const collections = rawCollections.map((col) => {
    const colPhotos = photos.filter((p) => p.collectionId === col.id);
    const coverPhoto =
      photos.find((p) => p.id === col.cover_photo_id) || colPhotos[0] || null;
    return {
      id: col.id,
      slug: col.slug,
      title: col.title,
      subtitle: col.subtitle,
      description: col.description,
      coverPhotoId: col.cover_photo_id,
      coverPhoto,
      photoCount: colPhotos.length,
      sortOrder: col.sort_order,
      isPublic: Boolean(col.is_public),
    };
  });

  const totalOriginalBytes = photos.reduce((acc, p) => acc + p.originalSizeBytes, 0);
  const totalOptimizedBytes = photos.reduce((acc, p) => acc + p.optimizedSizeBytes, 0);
  const averageSavingsPercent =
    totalOriginalBytes > 0
      ? Number(((1 - totalOptimizedBytes / totalOriginalBytes) * 100).toFixed(1))
      : 0;

  // Strip sensitive settings from public payload
  const publicSettings = {
    photographerName: settings.photographerName,
    studioTitle: settings.studioTitle,
    tagline: settings.tagline,
    heroStatement: settings.heroStatement,
    location: settings.location,
    availabilityStatus: settings.availabilityStatus,
    bioLead: settings.bioLead,
    bioBody: settings.bioBody,
    philosophyQuote: settings.philosophyQuote,
    gearCameras: settings.gearCameras,
    gearLenses: settings.gearLenses,
    gearWorkflow: settings.gearWorkflow,
    socialGithub: settings.socialGithub,
    socialInstagram: settings.socialInstagram,
    socialEmail: settings.socialEmail,
  };

  res.json({
    settings: publicSettings,
    collections,
    photos,
    telemetry: {
      totalPhotos: photos.length,
      totalOriginalBytes,
      totalOptimizedBytes,
      averageSavingsPercent,
    },
    isAdmin,
  });
});

// Admin Studio Full Data
api.get('/studio/data', requireAdmin, (_req: Request, res: Response) => {
  const settings = getSettings();
  const rawPhotos = db
    .prepare('SELECT * FROM photos ORDER BY sort_order ASC, created_at DESC')
    .all() as unknown as RawPhotoRow[];
  const photos = rawPhotos.map(serializePhoto);

  const rawCollections = db
    .prepare('SELECT * FROM collections ORDER BY sort_order ASC, created_at ASC')
    .all() as Array<{
    id: string;
    slug: string;
    title: string;
    subtitle: string;
    description: string;
    cover_photo_id: string | null;
    sort_order: number;
    is_public: number;
    created_at: string;
  }>;

  const collections = rawCollections.map((col) => {
    const colPhotos = photos.filter((p) => p.collectionId === col.id);
    const coverPhoto =
      photos.find((p) => p.id === col.cover_photo_id) || colPhotos[0] || null;
    return {
      id: col.id,
      slug: col.slug,
      title: col.title,
      subtitle: col.subtitle,
      description: col.description,
      coverPhotoId: col.cover_photo_id,
      coverPhoto,
      photoCount: colPhotos.length,
      sortOrder: col.sort_order,
      isPublic: Boolean(col.is_public),
    };
  });

  const inquiries = db
    .prepare('SELECT * FROM inquiries ORDER BY created_at DESC')
    .all() as Array<{
    id: string;
    name: string;
    email: string;
    project_type: string;
    subject: string;
    message: string;
    is_read: number;
    created_at: string;
  }>;

  const totalOriginalBytes = photos.reduce((acc, p) => acc + p.originalSizeBytes, 0);
  const totalOptimizedBytes = photos.reduce((acc, p) => acc + p.optimizedSizeBytes, 0);
  const totalDiskBytes = photos.reduce((acc, p) => acc + p.totalVariantsBytes, 0);

  res.json({
    settings,
    collections,
    photos,
    inquiries: inquiries.map((inq) => ({
      id: inq.id,
      name: inq.name,
      email: inq.email,
      projectType: inq.project_type,
      subject: inq.subject,
      message: inq.message,
      isRead: Boolean(inq.is_read),
      createdAt: inq.created_at,
    })),
    telemetry: {
      totalPhotos: photos.length,
      totalOriginalBytes,
      totalOptimizedBytes,
      totalDiskBytes,
      bytesSaved: Math.max(0, totalOriginalBytes - totalOptimizedBytes),
      averageSavingsPercent:
        totalOriginalBytes > 0
          ? Number(((1 - totalOptimizedBytes / totalOriginalBytes) * 100).toFixed(1))
          : 0,
    },
  });
});

// Batch Photo Upload & Web Optimization Endpoint
api.post(
  '/photos/upload',
  requireAdmin,
  upload.array('photos', 25),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No photo files received for optimization.' });
        return;
      }

      const settings = getSettings();
      const collectionId = (req.body.collectionId || '').trim() || null;
      const isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === '1';
      const isPublic = req.body.isPublic !== 'false' && req.body.isPublic !== '0';
      const keepOriginals =
        req.body.keepOriginals !== undefined
          ? req.body.keepOriginals === 'true'
          : settings.keepOriginals;
      const location = (req.body.location || '').trim();

      let sharedTags: string[] = [];
      if (req.body.tags) {
        try {
          sharedTags = JSON.parse(req.body.tags);
        } catch {
          sharedTags = String(req.body.tags)
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        }
      }

      let customTitles: Record<string, string> = {};
      if (req.body.titles) {
        try {
          customTitles = JSON.parse(req.body.titles);
        } catch {
          customTitles = {};
        }
      }

      let customCaptions: Record<string, string> = {};
      if (req.body.captions) {
        try {
          customCaptions = JSON.parse(req.body.captions);
        } catch {
          customCaptions = {};
        }
      }

      let clientOriginalSizes: Record<string, number> = {};
      if (req.body.clientOriginalSizes) {
        try {
          clientOriginalSizes = JSON.parse(req.body.clientOriginalSizes);
        } catch {
          clientOriginalSizes = {};
        }
      }

      let clientExifMap: Record<
        string,
        Partial<{
          camera: string;
          lens: string;
          focalLength: string;
          aperture: string;
          shutterSpeed: string;
          iso: string;
          takenAt: string;
        }>
      > = {};
      if (req.body.clientExif) {
        try {
          clientExifMap = JSON.parse(req.body.clientExif);
        } catch {
          clientExifMap = {};
        }
      }

      const minOrderRow = db
        .prepare('SELECT MIN(sort_order) as minOrder FROM photos')
        .get() as { minOrder: number | null };
      let nextOrder = (minOrderRow?.minOrder ?? 1) - files.length;

      const insertStmt = db.prepare(`
        INSERT INTO photos (
          id, title, caption, location, collection_id, tags,
          is_featured, is_public, sort_order,
          width, height, aspect_ratio, dominant_color, blur_data_url,
          original_filename, original_size_bytes, optimized_size_bytes, total_variants_bytes,
          variants,
          exif_camera, exif_lens, exif_focal_length, exif_aperture, exif_shutter_speed, exif_iso, exif_taken_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?,
          ?, ?, ?, ?, ?, ?, ?
        )
      `);

      const createdPhotos = [];

      for (const file of files) {
        const id = crypto.randomUUID();
        const opt = await optimizeUploadedPhoto(id, file.buffer, file.originalname, {
          webpQuality: settings.webpQuality,
          avifQuality: settings.avifQuality,
          keepOriginals,
        });

        const baseTitle = file.originalname
          .replace(/\.[^/.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase());

        const title = (customTitles[file.originalname] || baseTitle || 'Untitled Plate').trim();
        const caption = (customCaptions[file.originalname] || '').trim();
        const sortOrder = nextOrder++;

        const reportedOrigSize = Number(clientOriginalSizes[file.originalname] || 0);
        const finalOriginalSizeBytes =
          reportedOrigSize > opt.originalSizeBytes ? reportedOrigSize : opt.originalSizeBytes;

        const cExif = clientExifMap[file.originalname] || {};

        insertStmt.run(
          id,
          title,
          caption,
          location,
          collectionId,
          JSON.stringify(sharedTags),
          isFeatured ? 1 : 0,
          isPublic ? 1 : 0,
          sortOrder,
          opt.width,
          opt.height,
          opt.aspectRatio,
          opt.dominantColor,
          opt.blurDataUrl,
          file.originalname,
          finalOriginalSizeBytes,
          opt.optimizedSizeBytes,
          opt.totalVariantsBytes,
          JSON.stringify(opt.variants),
          opt.exif.camera || cExif.camera || '',
          opt.exif.lens || cExif.lens || '',
          opt.exif.focalLength || cExif.focalLength || '',
          opt.exif.aperture || cExif.aperture || '',
          opt.exif.shutterSpeed || cExif.shutterSpeed || '',
          opt.exif.iso || cExif.iso || '',
          opt.exif.takenAt || cExif.takenAt || ''
        );

        const insertedRow = db
          .prepare('SELECT * FROM photos WHERE id = ?')
          .get(id) as unknown as RawPhotoRow;
        createdPhotos.push(serializePhoto(insertedRow));
      }

      res.status(201).json({
        ok: true,
        count: createdPhotos.length,
        photos: createdPhotos,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process and optimize photos';
      res.status(500).json({ error: msg });
    }
  }
);

// Update Photo Metadata & EXIF
api.put('/photos/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as
    | RawPhotoRow
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  const body = req.body || {};
  const title = body.title !== undefined ? String(body.title).trim() : existing.title;
  const caption = body.caption !== undefined ? String(body.caption).trim() : existing.caption;
  const location = body.location !== undefined ? String(body.location).trim() : existing.location;
  const collectionId =
    body.collectionId !== undefined ? body.collectionId || null : existing.collection_id;
  const tags =
    body.tags !== undefined
      ? JSON.stringify(
          Array.isArray(body.tags)
            ? body.tags
            : String(body.tags)
                .split(',')
                .map((t: string) => t.trim())
                .filter(Boolean)
        )
      : existing.tags;
  const isFeatured =
    body.isFeatured !== undefined ? (body.isFeatured ? 1 : 0) : existing.is_featured;
  const isPublic = body.isPublic !== undefined ? (body.isPublic ? 1 : 0) : existing.is_public;
  const sortOrder =
    body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sort_order;

  const exif = body.exif || {};
  const exifCamera =
    exif.camera !== undefined ? String(exif.camera).trim() : existing.exif_camera;
  const exifLens = exif.lens !== undefined ? String(exif.lens).trim() : existing.exif_lens;
  const exifFocalLength =
    exif.focalLength !== undefined
      ? String(exif.focalLength).trim()
      : existing.exif_focal_length;
  const exifAperture =
    exif.aperture !== undefined ? String(exif.aperture).trim() : existing.exif_aperture;
  const exifShutterSpeed =
    exif.shutterSpeed !== undefined
      ? String(exif.shutterSpeed).trim()
      : existing.exif_shutter_speed;
  const exifIso = exif.iso !== undefined ? String(exif.iso).trim() : existing.exif_iso;
  const exifTakenAt =
    exif.takenAt !== undefined ? String(exif.takenAt).trim() : existing.exif_taken_at;

  db.prepare(
    `UPDATE photos SET
      title = ?, caption = ?, location = ?, collection_id = ?, tags = ?,
      is_featured = ?, is_public = ?, sort_order = ?,
      exif_camera = ?, exif_lens = ?, exif_focal_length = ?,
      exif_aperture = ?, exif_shutter_speed = ?, exif_iso = ?, exif_taken_at = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title,
    caption,
    location,
    collectionId,
    tags,
    isFeatured,
    isPublic,
    sortOrder,
    exifCamera,
    exifLens,
    exifFocalLength,
    exifAperture,
    exifShutterSpeed,
    exifIso,
    exifTakenAt,
    id
  );

  const updated = db
    .prepare('SELECT * FROM photos WHERE id = ?')
    .get(id) as unknown as RawPhotoRow;
  res.json({ ok: true, photo: serializePhoto(updated) });
});

// Reorder Photos
api.post('/photos/reorder', requireAdmin, (req: Request, res: Response) => {
  const { orderedIds } = (req.body || {}) as { orderedIds?: string[] };
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: 'orderedIds array is required' });
    return;
  }

  const updateOrder = db.prepare('UPDATE photos SET sort_order = ? WHERE id = ?');
  orderedIds.forEach((id, index) => {
    updateOrder.run(index + 1, id);
  });

  res.json({ ok: true });
});

// Delete Photo
api.delete('/photos/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as
    | RawPhotoRow
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Photo not found' });
    return;
  }

  db.prepare('DELETE FROM photos WHERE id = ?').run(id);
  await deletePhotoFiles(id, existing.variants);

  res.json({ ok: true });
});

// Collections CRUD
api.post('/collections', requireAdmin, (req: Request, res: Response) => {
  const { title, subtitle, description, isPublic } = req.body || {};
  if (!title || !String(title).trim()) {
    res.status(400).json({ error: 'Collection title is required' });
    return;
  }

  const id = crypto.randomUUID();
  const baseSlug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const slug = `${baseSlug || 'series'}-${id.slice(0, 4)}`;

  const maxOrder = db
    .prepare('SELECT MAX(sort_order) as maxOrder FROM collections')
    .get() as { maxOrder: number | null };

  db.prepare(
    `INSERT INTO collections (id, slug, title, subtitle, description, sort_order, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    slug,
    String(title).trim(),
    String(subtitle || '').trim(),
    String(description || '').trim(),
    (maxOrder?.maxOrder ?? 0) + 1,
    isPublic === false ? 0 : 1
  );

  res.status(201).json({ ok: true, id, slug });
});

api.put('/collections/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, subtitle, description, coverPhotoId, sortOrder, isPublic } = req.body || {};

  const existing = db.prepare('SELECT * FROM collections WHERE id = ?').get(id) as
    | {
        id: string;
        title: string;
        subtitle: string;
        description: string;
        cover_photo_id: string | null;
        sort_order: number;
        is_public: number;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Collection not found' });
    return;
  }

  db.prepare(
    `UPDATE collections SET
      title = ?, subtitle = ?, description = ?, cover_photo_id = ?, sort_order = ?, is_public = ?,
      updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    title !== undefined ? String(title).trim() : existing.title,
    subtitle !== undefined ? String(subtitle).trim() : existing.subtitle,
    description !== undefined ? String(description).trim() : existing.description,
    coverPhotoId !== undefined ? coverPhotoId || null : existing.cover_photo_id,
    sortOrder !== undefined ? Number(sortOrder) : existing.sort_order,
    isPublic !== undefined ? (isPublic ? 1 : 0) : existing.is_public,
    id
  );

  res.json({ ok: true });
});

api.delete('/collections/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  db.prepare('UPDATE photos SET collection_id = NULL WHERE collection_id = ?').run(id);
  db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Public Contact / Commission Inquiry Submission
api.post('/inquiries', (req: Request, res: Response) => {
  const { name, email, projectType, subject, message } = req.body || {};
  if (!name || !email || !message) {
    res.status(400).json({ error: 'Name, email, and message are required.' });
    return;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO inquiries (id, name, email, project_type, subject, message)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(name).trim(),
    String(email).trim(),
    String(projectType || 'Editorial / Commission').trim(),
    String(subject || '').trim(),
    String(message).trim()
  );

  res.status(201).json({ ok: true, id });
});

api.put('/inquiries/:id/read', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { isRead } = req.body || {};
  db.prepare('UPDATE inquiries SET is_read = ? WHERE id = ?').run(isRead ? 1 : 0, id);
  res.json({ ok: true });
});

api.delete('/inquiries/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Update Site & Optimization Settings
api.put('/settings', requireAdmin, (req: Request, res: Response) => {
  const body = (req.body || {}) as Partial<SiteSettings>;
  const updated = updateSettings(body);
  res.json({ ok: true, settings: updated });
});

app.use('/api', api);

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.use((_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Arron McCrory Photography Portfolio server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;
