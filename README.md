# InstaSnip — Premium Media Downloader

InstaSnip is a high-fidelity, secure, and responsive batch media downloader for **Instagram** and **TikTok**. It features a modern dark-first design, fluid transitions, and a customized carousel media picker for multi-media posts.

## Features

- **Instagram Downloader:** Resolves photo, video, Reel, and Carousel posts.
- **TikTok Downloader:** Resolves video posts with ease.
- **Batch Processing:** Paste multiple URLs (comma or newline separated) and download them sequentially.
- **Carousel Media Selector:** Multi-image/video posts open a premium grid modal letting the user select specific media to download.
- **CORS Proxying:** Utilizes a secure, zero-dependency CORS proxy to enable direct browser downloads.
- **Simulation Mode:** Built-in offline testing toggle allows developers and users to verify user interface states and mock downloads instantly.
- **GitHub Actions Deployment:** Automatically builds and deploys to GitHub Pages on every push.

## Tech Stack

- **Framework:** React 19 + Vite
- **Styling:** Vanilla CSS (custom variables, modern transitions, glassmorphic layout)
- **Icons:** Lucide React
- **Resolver API:** Cobalt API

## Running Locally

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

## Production Build & Deploy

To build the static assets:
```bash
npm run build
```

This project is set up with GitHub Actions in `.github/workflows/deploy.yml` to automatically compile and deploy to GitHub Pages on push to `main`.
