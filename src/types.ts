export interface VariantInfo {
  url: string;
  bytes: number;
  width: number;
  height: number;
  format: 'webp' | 'avif' | 'original';
}

export interface PhotoVariants {
  thumb_webp?: VariantInfo;
  thumb_avif?: VariantInfo;
  gallery_webp?: VariantInfo;
  gallery_avif?: VariantInfo;
  lightbox_webp?: VariantInfo;
  lightbox_avif?: VariantInfo;
  original?: VariantInfo;
}

export interface ExifData {
  camera: string;
  lens: string;
  focalLength: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
  takenAt: string;
}

export interface Photo {
  id: string;
  title: string;
  caption: string;
  location: string;
  collectionId: string | null;
  tags: string[];
  isFeatured: boolean;
  isPublic: boolean;
  sortOrder: number;
  width: number;
  height: number;
  aspectRatio: number;
  dominantColor: string;
  blurDataUrl: string;
  originalFilename: string;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  totalVariantsBytes: number;
  savingsPercent: number;
  variants: PhotoVariants;
  exif: ExifData;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  coverPhotoId: string | null;
  coverPhoto: Photo | null;
  photoCount: number;
  sortOrder: number;
  isPublic: boolean;
}

export interface PublicSettings {
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
}

export interface FullSiteSettings extends PublicSettings {
  allowedGithubUser: string;
  allowedGoogleEmail: string;
  webpQuality: number;
  avifQuality: number;
  keepOriginals: boolean;
  fallbackPasscode: string;
}

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  projectType: string;
  subject: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface Telemetry {
  totalPhotos: number;
  totalOriginalBytes: number;
  totalOptimizedBytes: number;
  totalDiskBytes?: number;
  bytesSaved?: number;
  averageSavingsPercent: number;
}

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl?: string;
  provider: 'github' | 'google' | 'local-owner';
}

export interface AuthStatus {
  authenticated: boolean;
  user: AuthUser | null;
  providers: {
    github: {
      configured: boolean;
      allowedUser: string;
    };
    google: {
      configured: boolean;
      allowedEmail: string;
    };
    devFallback: {
      enabled: boolean;
      passcodeRequired: boolean;
    };
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : val >= 100 ? 0 : 1)} ${units[idx]}`;
}

export function formatExifSummary(exif: ExifData): string {
  const parts = [
    exif.camera,
    exif.focalLength,
    exif.aperture,
    exif.shutterSpeed,
    exif.iso,
  ].filter(Boolean);
  return parts.join(' · ');
}
