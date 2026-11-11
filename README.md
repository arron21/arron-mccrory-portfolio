# Arron McCrory — Photography Portfolio & Studio

A self-contained, full-stack photography portfolio and visual archive built with **React + TypeScript + Vanilla CSS** on the frontend and **Node.js + Express + SQLite (`node:sqlite`) + Sharp + Exifr** on the backend.

## Key Features

- **Automated Multi-Tier Web Optimization (`server/optimizer.ts`)**:
  - Generates **6 responsive derivatives** per uploaded photo (`thumb` 600w, `gallery` 1400w, and `lightbox` 2400w in both **AVIF** and **WebP**).
  - Generates a base64 blurred **LQIP (Low-Quality Image Placeholder)** and extracts the dominant RGB hex color for zero-CLS progressive loading.
  - Extracts optical camera **EXIF telemetry** (Camera Body, Lens, Focal Length, Aperture, Shutter Speed, ISO, Date Taken) while stripping GPS coordinates and private serial metadata from public files.
  - Discards bulky raw original files by default (with a per-batch or global toggle to retain originals in `data/uploads/originals/`).
- **Owner Authentication (`server/auth.ts`)**:
  - **GitHub OAuth 2.0** (`/api/auth/github`) restricted to `ALLOWED_GITHUB_USER` (defaults to `arron21`).
  - **Google OAuth 2.0** (`/api/auth/google`) restricted to `ALLOWED_GOOGLE_EMAIL`.
  - **Direct Owner Studio Access** (`/api/auth/dev-login`) with optional passcode protection when OAuth environment keys are not yet configured.
- **Museum / Editorial Public Experience**:
  - Dark-first obsidian aesthetic with a warm gallery-paper light mode toggle.
  - Switchable **Masonry Grid** (preserving native aspect ratios) and **Editorial Museum Plates** view.
  - Full-screen **Lightbox** with keyboard navigation (`←`, `→`, `Esc`, `I` for telemetry drawer, `Z` for zoom) and interactive filmstrip.
  - Curated **Series / Collections**, editable **About & Gear** page, and SQLite-backed **Commissions & Inquiries** form.

## Running Locally

```bash
npm install
npm run dev
```

## Running with Docker

```bash
docker compose up --build -d
```
