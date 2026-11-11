import exifr from 'exifr';
import type { ExifData } from '../types.ts';

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

export async function extractClientExif(file: File): Promise<ExifData> {
  const empty: ExifData = {
    camera: '',
    lens: '',
    focalLength: '',
    aperture: '',
    shutterSpeed: '',
    iso: '',
    takenAt: '',
  };

  try {
    const parsed = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: false,
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
    const focalLength = formatFocalLength(
      parsed.FocalLengthIn35mmFormat || parsed.FocalLength
    );
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

const VERCEL_SAFE_MAX_BYTES = 2.8 * 1024 * 1024; // 2.8 MB max per request (well under Vercel's 4.5 MB limit)
const MAX_MASTER_DIMENSION = 2400; // Matches Lightbox 2400w max derivative

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Prepares a photo file for upload so that it never exceeds Vercel's 4.5 MB
 * FUNCTION_PAYLOAD_TOO_LARGE limit, while preserving full 2400px master resolution
 * and extracting optical EXIF metadata from the untouched original file first.
 */
export async function preparePhotoForUpload(file: File): Promise<{
  uploadFile: File;
  originalSizeBytes: number;
  exif: ExifData;
}> {
  const originalSizeBytes = file.size;
  const exif = await extractClientExif(file);

  // If the file is already small (< 2.5 MB), we still check if we need to compress or can send directly
  try {
    const img = await loadImageElement(file);
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;

    if (
      file.size <= VERCEL_SAFE_MAX_BYTES &&
      origW <= MAX_MASTER_DIMENSION &&
      origH <= MAX_MASTER_DIMENSION
    ) {
      return { uploadFile: file, originalSizeBytes, exif };
    }

    // Scale down to fit within 2400x2400 preserving exact aspect ratio
    const scale = Math.min(1, MAX_MASTER_DIMENSION / Math.max(origW, origH));
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { uploadFile: file, originalSizeBytes, exif };
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Encode as high-quality WebP (or JPEG fallback) under 2.8 MB
    let quality = 0.88;
    let blob = await canvasToBlob(canvas, 'image/webp', quality);
    let mime = 'image/webp';
    let ext = '.webp';

    if (!blob || blob.type !== 'image/webp') {
      mime = 'image/jpeg';
      ext = '.jpg';
      blob = await canvasToBlob(canvas, mime, quality);
    }

    while (blob && blob.size > VERCEL_SAFE_MAX_BYTES && quality > 0.55) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, mime, quality);
    }

    if (!blob) {
      return { uploadFile: file, originalSizeBytes, exif };
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const uploadFile = new File([blob], `${baseName}${ext}`, {
      type: mime,
      lastModified: file.lastModified,
    });

    return { uploadFile, originalSizeBytes, exif };
  } catch {
    return { uploadFile: file, originalSizeBytes, exif };
  }
}
