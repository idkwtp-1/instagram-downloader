# InstaSnip — Premium Instagram Downloader

InstaSnip is a high-fidelity, secure, and responsive batch media downloader for **Instagram**. It features a modern dark-first design, fluid transitions, and a customized carousel media picker for multi-media posts.

## Features

- **Instagram Downloader:** Resolves photo, video, Reel, and Carousel posts.
- **Batch Processing:** Paste multiple URLs (comma or newline separated) and download them sequentially.
- **Carousel Media Selector:** Multi-image/video posts open a premium grid modal letting the user select specific media to download.
- **CORS Proxying:** Utilizes a secure, zero-dependency CORS proxy to enable direct browser downloads.

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

## Production Build

To build the static assets:
```bash
npm run build
```

