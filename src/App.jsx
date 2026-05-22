import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Instagram,
  Download,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Link as LinkIcon,
  ArrowRight,
  Plus,
  X,
  Film,
  ImageIcon,
  Layers,
} from 'lucide-react';
import CarouselSelector from './components/CarouselSelector';
import './App.css';

// ─── Security: Whitelisted CDN domains ───────────────────────────────────────
const ALLOWED_CDN_DOMAINS = [
  'cdninstagram.com',
  'instagram.com',
  'fbcdn.net',
  'scontent.cdninstagram.com',
];

// ─── Security: Verify the media URL comes from a trusted CDN ─────────────────
function verifyHost(urlStr) {
  try {
    const hostname = new URL(urlStr).hostname;
    return ALLOWED_CDN_DOMAINS.some(
      (allowed) => hostname === allowed || hostname.endsWith('.' + allowed)
    );
  } catch {
    return false;
  }
}

// ─── Security: Validate Instagram URL format ─────────────────────────────────
function validateInstagramUrl(url) {
  // Accepts: /p/ /reel/ /tv/ and share links
  return /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv|share)\/[\w-]+\/?/i.test(url);
}

// ─── Direct download via CORS proxy → blob → native save dialog ──────────────
async function downloadBlob(mediaUrl, filename) {
  if (!verifyHost(mediaUrl)) {
    throw new Error('Security: Media source domain is not on the approved list.');
  }

  const proxied = `https://corsproxy.io/?url=${encodeURIComponent(mediaUrl)}`;
  const res = await fetch(proxied);
  if (!res.ok) {
    throw new Error(`CDN proxy returned ${res.status}. The link may have expired.`);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Small delay before revoking so browser can start the download
  setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
}

// ─── Parse a textarea blob into individual URLs ───────────────────────────────
function parseUrls(text) {
  return text
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

// ─── Guess file extension from URL or MIME type ───────────────────────────────
function guessExtension(url = '', type = '') {
  if (type === 'video' || url.includes('.mp4')) return 'mp4';
  if (url.includes('.webm')) return 'webm';
  return 'jpg';
}

// ═════════════════════════════════════════════════════════════════════════════
// App Component
// ═════════════════════════════════════════════════════════════════════════════
function App() {
  const [urls, setUrls] = useState(['']); // array of URL strings
  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Carousel modal state
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselItems, setCarouselItems] = useState([]);
  const [carouselQueueId, setCarouselQueueId] = useState(null);

  // Refs to avoid stale closures inside async loops
  const processingRef = useRef(false);
  const queueRef = useRef([]);
  const currentIdxRef = useRef(-1);

  useEffect(() => { queueRef.current = queue; }, [queue]);

  // ── URL input management ──────────────────────────────────────────────────
  const addUrl = () => setUrls((prev) => [...prev, '']);
  const removeUrl = (i) => setUrls((prev) => prev.filter((_, idx) => idx !== i));
  const updateUrl = (i, val) =>
    setUrls((prev) => prev.map((u, idx) => (idx === i ? val : u)));

  // Handle paste of multiple URLs into any field
  const handlePaste = (e, index) => {
    const pasted = e.clipboardData.getData('text');
    const parsed = parseUrls(pasted);
    if (parsed.length <= 1) return; // normal single-URL paste — let browser handle
    e.preventDefault();
    setUrls((prev) => {
      const copy = [...prev];
      copy.splice(index, 1, ...parsed);
      return copy;
    });
  };

  // ── Queue helpers ─────────────────────────────────────────────────────────
  const setItemStatus = useCallback((id, status, error = '', extra = {}) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status, error, ...extra } : item))
    );
  }, []);

  const clearQueue = () => {
    setQueue([]);
    setIsProcessing(false);
    processingRef.current = false;
    currentIdxRef.current = -1;
  };

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    const validUrls = urls.map((u) => u.trim()).filter((u) => u.length > 0);
    if (validUrls.length === 0) return;

    const newItems = validUrls.map((url, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}`,
      url,
      status: 'queued',
      error: '',
    }));

    const merged = [...queue, ...newItems];
    setQueue(merged);
    queueRef.current = merged;
    setUrls(['']);

    if (!processingRef.current) {
      const startIdx = queue.length;
      processingRef.current = true;
      setIsProcessing(true);
      currentIdxRef.current = startIdx;
      setTimeout(() => runQueue(startIdx, merged), 80);
    }
  };

  // ── Queue runner ──────────────────────────────────────────────────────────
  const runQueue = async (startIdx, currentQueue) => {
    let idx = startIdx;

    while (idx < currentQueue.length && processingRef.current) {
      const item = currentQueue[idx];
      currentIdxRef.current = idx;
      setItemStatus(item.id, 'resolving');

      try {
        const needsPause = await processItem(item);
        if (needsPause) {
          // Carousel modal is open — pause queue until user responds
          return;
        }
      } catch (err) {
        setItemStatus(item.id, 'error', err.message || 'Unknown error.');
      }

      // Throttle between downloads to be respectful to the API
      await new Promise((r) => setTimeout(r, 1200));
      idx++;
    }

    // Queue exhausted or stopped
    if (processingRef.current) {
      setIsProcessing(false);
      processingRef.current = false;
    }
  };

  // ── Process a single queue item ───────────────────────────────────────────
  const processItem = async (item) => {
    // 1. Validate URL format
    if (!validateInstagramUrl(item.url)) {
      throw new Error(
        'Invalid Instagram URL. Accepted formats: /p/, /reel/, /tv/, /share/'
      );
    }

    // ── Cobalt API call ──────────────────────────────────────────────────
    const apiResponse = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        url: item.url,
        videoQuality: '1080',   // correct field per Cobalt v10 API
        filenameStyle: 'pretty', // correct field per Cobalt v10 API
        downloadMode: 'auto',
        alwaysProxy: true,       // always tunnel so CDN URLs work
      }),
    });

    if (!apiResponse.ok) {
      if (apiResponse.status === 429) {
        throw new Error(
          'Rate limited by Cobalt API. Please wait a moment and try again.'
        );
      }
      throw new Error(`Cobalt API returned HTTP ${apiResponse.status}.`);
    }

    const data = await apiResponse.json();

    if (data.status === 'error') {
      const code = data.error?.code || 'unknown';
      throw new Error(`Cobalt API error: ${code}`);
    }

    if (data.status === 'picker') {
      // Carousel / slideshow — show the selector modal
      processingRef.current = false;

      const slides = data.picker.map((p) => ({
        type: p.type || (p.url?.includes('.mp4') ? 'video' : 'photo'),
        url: p.url,
        thumb: p.thumb || p.url,
      }));

      setCarouselItems(slides);
      setCarouselQueueId(item.id);
      setCarouselOpen(true);
      return true; // signals pause
    }

    if (data.status === 'redirect' || data.status === 'tunnel') {
      setItemStatus(item.id, 'downloading');
      const ext = guessExtension(data.url);
      const filename = `instagram_${Date.now()}.${ext}`;
      await downloadBlob(data.url, filename);
      setItemStatus(item.id, 'success');
      return false;
    }

    throw new Error(`Unexpected Cobalt response status: "${data.status}"`);
  };

  // ── Carousel download confirmed ───────────────────────────────────────────
  const handleCarouselDownload = async (selectedIndices) => {
    setCarouselOpen(false);

    if (!carouselQueueId) return;
    setItemStatus(carouselQueueId, 'downloading');

    try {
      const selected = selectedIndices.map((i) => carouselItems[i]);

      for (let i = 0; i < selected.length; i++) {
        const slide = selected[i];
        const ext = guessExtension(slide.url, slide.type);
        const filename = `instagram_${Date.now()}_${i + 1}.${ext}`;

        await downloadBlob(slide.url, filename);
      }

      setItemStatus(carouselQueueId, 'success');
    } catch (err) {
      setItemStatus(carouselQueueId, 'error', err.message);
    }

    // Resume the queue from the next item
    const nextIdx = currentIdxRef.current + 1;
    processingRef.current = true;
    setIsProcessing(true);
    runQueue(nextIdx, queueRef.current);
  };

  // ── Carousel cancelled ────────────────────────────────────────────────────
  const handleCarouselCancel = () => {
    setCarouselOpen(false);
    if (carouselQueueId) {
      setItemStatus(carouselQueueId, 'error', 'Carousel selection was cancelled.');
    }

    const nextIdx = currentIdxRef.current + 1;
    processingRef.current = true;
    setIsProcessing(true);
    runQueue(nextIdx, queueRef.current);
  };

  // ── Derived UI state ──────────────────────────────────────────────────────
  const hasValidInput = urls.some((u) => u.trim().length > 0);
  const completedCount = queue.filter((i) => i.status === 'success').length;

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="logo-container">
          <div className="logo-icon-wrap">
            <Instagram className="logo-icon" size={30} />
          </div>
          <h1 className="app-title">
            Insta<span className="app-title-highlight">Snip</span>
          </h1>
        </div>
        <p className="app-subtitle">
          Download Instagram Videos, Reels &amp; Photos — fast and secure
        </p>
        <div className="feature-chips">
          <span className="chip"><Film size={13} /> Videos &amp; Reels</span>
          <span className="chip"><ImageIcon size={13} /> Photos</span>
          <span className="chip"><Layers size={13} /> Carousels</span>
        </div>
      </header>

      {/* ── Main Input Card ─────────────────────────────────────────────── */}
      <main className="main-card">
        <form onSubmit={handleSubmit} noValidate>
          <h2 className="form-title">Paste Instagram Links</h2>
          <p className="form-description">
            Paste one or more links — Reels, Videos, Photos, or Carousels.
            For carousels, you&apos;ll pick which slides to save.
          </p>

          {/* Dynamic URL inputs */}
          <div className="url-inputs" role="list">
            {urls.map((url, i) => (
              <div className="url-row" key={i} role="listitem">
                <div className="url-input-wrap">
                  <LinkIcon className="url-input-icon" size={16} />
                  <input
                    type="url"
                    className="url-input"
                    placeholder="https://www.instagram.com/reel/..."
                    value={url}
                    onChange={(e) => updateUrl(i, e.target.value)}
                    onPaste={(e) => handlePaste(e, i)}
                    disabled={isProcessing}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {urls.length > 1 && (
                    <button
                      type="button"
                      className="remove-url-btn"
                      onClick={() => removeUrl(i)}
                      disabled={isProcessing}
                      aria-label="Remove URL"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add URL button */}
          <button
            type="button"
            className="add-url-btn"
            onClick={addUrl}
            disabled={isProcessing}
          >
            <Plus size={15} /> Add Another Link
          </button>

          {/* Actions */}
          <div className="actions-panel">
            {queue.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={clearQueue}
                disabled={isProcessing}
              >
                <Trash2 size={15} /> Clear Queue
              </button>
            )}
            <button
              type="submit"
              className="btn-primary"
              id="download-btn"
              disabled={isProcessing || !hasValidInput}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="spinner" size={18} /> Processing…
                </>
              ) : (
                <>
                  <Download size={18} /> Download
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      {/* ── Queue Section ───────────────────────────────────────────────── */}
      {queue.length > 0 && (
        <section className="main-card queue-section" aria-label="Download queue">
          <div className="queue-header">
            <h3 className="queue-title">Download Queue</h3>
            <span className="media-count">
              {completedCount} / {queue.length} done
            </span>
          </div>

          <ul className="queue-list">
            {queue.map((item, idx) => (
              <li key={item.id} className={`queue-card status-${item.status}`}>
                <div className="card-top">
                  <div className="card-url-info">
                    <span className="card-index">#{idx + 1}</span>
                    <span className="card-url" title={item.url}>{item.url}</span>
                  </div>
                  <span className={`badge badge-${item.status}`}>
                    {item.status === 'queued' && 'Queued'}
                    {item.status === 'resolving' && <><Loader2 className="spinner" size={12} /> Resolving</>}
                    {item.status === 'downloading' && <><Loader2 className="spinner" size={12} /> Downloading</>}
                    {item.status === 'success' && <><CheckCircle size={12} /> Done</>}
                    {item.status === 'error' && <><AlertCircle size={12} /> Error</>}
                  </span>
                </div>
                {item.status === 'error' && (
                  <p className="error-text">{item.error}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} InstaSnip &mdash; for personal and educational use.</p>
        <p>Please respect creators&apos; intellectual property. Only download content you own or have permission to download.</p>
      </footer>

      {/* ── Carousel Picker Modal ───────────────────────────────────────── */}
      <CarouselSelector
        isOpen={carouselOpen}
        items={carouselItems}
        onClose={handleCarouselCancel}
        onDownload={handleCarouselDownload}
      />
    </>
  );
}

export default App;
