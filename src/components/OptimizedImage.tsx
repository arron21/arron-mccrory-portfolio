import React, { useState } from 'react';
import type { Photo } from '../types.ts';

interface OptimizedImageProps {
  photo: Photo;
  tier?: 'thumb' | 'gallery' | 'lightbox';
  className?: string;
  alt?: string;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  photo,
  tier = 'gallery',
  className = '',
  alt,
}) => {
  const [loaded, setLoaded] = useState(false);

  const avifVariant =
    tier === 'thumb'
      ? photo.variants.thumb_avif || photo.variants.gallery_avif
      : tier === 'lightbox'
      ? photo.variants.lightbox_avif || photo.variants.gallery_avif
      : photo.variants.gallery_avif || photo.variants.thumb_avif;

  const webpVariant =
    tier === 'thumb'
      ? photo.variants.thumb_webp || photo.variants.gallery_webp
      : tier === 'lightbox'
      ? photo.variants.lightbox_webp || photo.variants.gallery_webp
      : photo.variants.gallery_webp || photo.variants.thumb_webp;

  const fallbackSrc = webpVariant?.url || avifVariant?.url || '';

  return (
    <div
      className={`photo-frame ${className}`}
      style={{
        backgroundColor: photo.dominantColor || '#141416',
        backgroundImage:
          !loaded && photo.blurDataUrl ? `url(${photo.blurDataUrl})` : undefined,
        aspectRatio: photo.aspectRatio ? `${photo.width} / ${photo.height}` : undefined,
      }}
    >
      <picture>
        {avifVariant?.url && <source srcSet={avifVariant.url} type="image/avif" />}
        {webpVariant?.url && <source srcSet={webpVariant.url} type="image/webp" />}
        <img
          src={fallbackSrc}
          alt={alt || photo.title}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={loaded ? 'loaded' : ''}
        />
      </picture>
    </div>
  );
};
