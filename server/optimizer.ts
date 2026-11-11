import sharp from 'sharp';
import exifr from 'exifr';
import path from 'node:path';
import fs from 'node:fs/promises';
import { UPLOADS_DIR } from './db.ts';

export interface VariantInfo {
  url: string;
  bytes: number;
  width: number;
  height: number;
  format: 'webp' | 'avif' | 'original';
}

export interface PhotoVariants {
  thumb_webp: VariantInfo;
  thumb_avif: VariantInfo;
  gallery_webp: VariantInfo;
  gallery_avif: VariantInfo;
  lightbox_webp: VariantInfo;
  lightbox_avif: VariantInfo;
  original?: VariantInfo;
}

export interface ExtractedExif {
  camera: string;
  lens: string;
  focalLength: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
  takenAt: string;
}

export interface OptimizationResult {
  width: number;
  height: number;
  aspectRatio: number;
  dominantColor: string;
  blurDataUrl: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  totalVariantsBytes: number;
  variants: PhotoVariants;
  exif: ExtractedExif;
}

function formatShutterSpeed(exposureTime?: number): string {
  if (!exposureTime || typeof exposureTime !== 'number' || exposureTime <= 0) return '';
  if (exposureTime >= 1) {
    return `${Number(exposureTime.toFixed(1))}s`;
  }
  const denominator = Math.round(1 / exposureTime);
  return `1/${denominator}s`;
}

function formatAperture(fNumber?: number): string {
  if (!fNumber || typeof fNumber !== 'number' || fNumber <= 0) return '';
  return `f/${Number(fNumber.toFixed(1))}`;
}

function formatFocalLength(focalLength?: number): string {
  if (!focalLength || typeof focalLength !== 'number' || focalLength <= 0) return '';
  return `${Math.round(focalLength)}mm`;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

export async function extractExifMetadata(buffer: Buffer): Promise<ExtractedExif> {
  const empty: ExtractedExif = {
    camera: '',
    lens: '',
    focalLength: '',
    aperture: '',
    shutterSpeed: '',
    iso: '',
    takenAt: '',
  };

  try {
    const parsed = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: false, // Privacy: never extract or expose GPS coordinates
    });
    if (!parsed) return empty;

    const make = (parsed.Make || '').toString().trim();
    const model = (parsed.Model || '').toString().trim();
    let camera = model;
    if (make && model && !model.toLowerCase().startsWith(make.toLowerCase())) {
      camera = `${make} ${model}`;
    } else if (!camera && make) {
      camera = make;
    }

    const lens = (parsed.LensModel || parsed.Lens || '').toString().trim();
    const focalLength = formatFocalLength(parsed.FocalLengthIn35mmFormat || parsed.FocalLength);
    const aperture = formatAperture(parsed.FNumber || parsed.ApertureValue);
    const shutterSpeed = formatShutterSpeed(parsed.ExposureTime);
    const isoVal = parsed.ISO || parsed.ISOSpeedRatings;
    const iso = isoVal ? `ISO ${isoVal}` : '';

    let takenAt = '';
    const rawDate = parsed.DateTimeOriginal || parsed.CreateDate;
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      takenAt = rawDate.toISOString().split('T')[0];
    } else if (typeof rawDate === 'string' && rawDate.trim()) {
      takenAt = rawDate.trim().slice(0, 10).replace(/:/g, '-');
    }

    return {
      camera,
      lens,
      focalLength,
      aperture,
      shutterSpeed,
      iso,
      takenAt,
    };
  } catch {
    return empty;
  }
}

export async function optimizeUploadedPhoto(
  id: string,
  buffer: Buffer,
  originalFilename: string,
  options: {
    webpQuality: number;
    avifQuality: number;
    keepOriginals: boolean;
  }
): Promise<OptimizationResult> {
  const originalSizeBytes = buffer.byteLength;
  const exif = await extractExifMetadata(buffer);

  // Auto-orient based on EXIF orientation, stripping EXIF/GPS metadata from public outputs
  const basePipeline = sharp(buffer, { failOn: 'none' }).rotate();
  const metadata = await basePipeline.metadata();

  // Account for 90/270 deg orientation swap if present
  const isRotated = metadata.orientation && [5, 6, 7, 8].includes(metadata.orientation);
  const width = (isRotated ? metadata.height : metadata.width) || 1600;
  const height = (isRotated ? metadata.width : metadata.height) || 1200;
  const aspectRatio = Number((width / height).toFixed(4));

  // Extract dominant color & tiny LQIP blur placeholder
  const [stats, lqipBuffer] = await Promise.all([
    sharp(buffer, { failOn: 'none' }).rotate().stats(),
    sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 24, withoutEnlargement: true })
      .blur(1.2)
      .webp({ quality: 55 })
      .toBuffer(),
  ]);

  const dominantColor = stats?.dominant
    ? rgbToHex(stats.dominant.r, stats.dominant.g, stats.dominant.b)
    : '#18181b';
  const blurDataUrl = `data:image/webp;base64,${lqipBuffer.toString('base64')}`;

  const webpQ = Math.max(40, Math.min(98, options.webpQuality || 82));
  const avifQ = Math.max(35, Math.min(95, options.avifQuality || 68));

  // Generate 6 responsive web-optimized derivatives in parallel
  const thumbWebpPath = path.join(UPLOADS_DIR, 'thumb', `${id}.webp`);
  const thumbAvifPath = path.join(UPLOADS_DIR, 'thumb', `${id}.avif`);
  const galleryWebpPath = path.join(UPLOADS_DIR, 'gallery', `${id}.webp`);
  const galleryAvifPath = path.join(UPLOADS_DIR, 'gallery', `${id}.avif`);
  const lightboxWebpPath = path.join(UPLOADS_DIR, 'lightbox', `${id}.webp`);
  const lightboxAvifPath = path.join(UPLOADS_DIR, 'lightbox', `${id}.avif`);

  const [
    thumbWebpOut,
    thumbAvifOut,
    galleryWebpOut,
    galleryAvifOut,
    lightboxWebpOut,
    lightboxAvifOut,
  ] = await Promise.all([
    sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 600, withoutEnlargement: true })
      .webp({ quality: Math.max(50, webpQ - 2), effort: 4 })
      .toFile(thumbWebpPath),
    sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 600, withoutEnlargement: true })
      .avif({ quality: Math.max(45, avifQ - 3), effort: 3 })
      .toFile(thumbAvifPath),
    sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: webpQ, effort: 4 })
      .toFile(galleryWebpPath),
    sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 1400, withoutEnlargement: true })
      .avif({ quality: avifQ, effort: 3 })
      .toFile(galleryAvifPath),
    sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: Math.min(95, webpQ + 4), effort: 4 })
      .toFile(lightboxWebpPath),
    sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .avif({ quality: Math.min(92, avifQ + 4), effort: 3 })
      .toFile(lightboxAvifPath),
  ]);

  const variants: PhotoVariants = {
    thumb_webp: {
      url: `/uploads/thumb/${id}.webp`,
      bytes: thumbWebpOut.size,
      width: thumbWebpOut.width,
      height: thumbWebpOut.height,
      format: 'webp',
    },
    thumb_avif: {
      url: `/uploads/thumb/${id}.avif`,
      bytes: thumbAvifOut.size,
      width: thumbAvifOut.width,
      height: thumbAvifOut.height,
      format: 'avif',
    },
    gallery_webp: {
      url: `/uploads/gallery/${id}.webp`,
      bytes: galleryWebpOut.size,
      width: galleryWebpOut.width,
      height: galleryWebpOut.height,
      format: 'webp',
    },
    gallery_avif: {
      url: `/uploads/gallery/${id}.avif`,
      bytes: galleryAvifOut.size,
      width: galleryAvifOut.width,
      height: galleryAvifOut.height,
      format: 'avif',
    },
    lightbox_webp: {
      url: `/uploads/lightbox/${id}.webp`,
      bytes: lightboxWebpOut.size,
      width: lightboxWebpOut.width,
      height: lightboxWebpOut.height,
      format: 'webp',
    },
    lightbox_avif: {
      url: `/uploads/lightbox/${id}.avif`,
      bytes: lightboxAvifOut.size,
      width: lightboxAvifOut.width,
      height: lightboxAvifOut.height,
      format: 'avif',
    },
  };

  if (options.keepOriginals) {
    const ext = path.extname(originalFilename) || '.jpg';
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '').toLowerCase() || '.jpg';
    const origPath = path.join(UPLOADS_DIR, 'originals', `${id}${safeExt}`);
    await fs.writeFile(origPath, buffer);
    variants.original = {
      url: `/uploads/originals/${id}${safeExt}`,
      bytes: originalSizeBytes,
      width,
      height,
      format: 'original',
    };
  }

  // Primary served web size is the gallery AVIF/WebP derivative
  const optimizedSizeBytes = Math.min(galleryAvifOut.size, galleryWebpOut.size);
  const totalVariantsBytes =
    thumbWebpOut.size +
    thumbAvifOut.size +
    galleryWebpOut.size +
    galleryAvifOut.size +
    lightboxWebpOut.size +
    lightboxAvifOut.size +
    (variants.original ? variants.original.bytes : 0);

  return {
    width,
    height,
    aspectRatio,
    dominantColor,
    blurDataUrl,
    originalSizeBytes,
    optimizedSizeBytes,
    totalVariantsBytes,
    variants,
    exif,
  };
}

export async function deletePhotoFiles(id: string, variantsJson: string): Promise<void> {
  try {
    const variants = JSON.parse(variantsJson) as Partial<PhotoVariants>;
    const urls = Object.values(variants)
      .filter((v): v is VariantInfo => Boolean(v && v.url))
      .map((v) => v.url);

    for (const url of urls) {
      if (url.startsWith('/uploads/')) {
        const rel = url.replace('/uploads/', '');
        const filePath = path.join(UPLOADS_DIR, rel);
        await fs.unlink(filePath).catch(() => {});
      }
    }
  } catch {
    // Fallback cleanup by ID
    for (const dir of ['thumb', 'gallery', 'lightbox']) {
      for (const ext of ['webp', 'avif']) {
        await fs.unlink(path.join(UPLOADS_DIR, dir, `${id}.${ext}`)).catch(() => {});
      }
    }
  }
}
