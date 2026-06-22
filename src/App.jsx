import { useState, useEffect, useRef, useCallback } from 'react';
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

// ─── Community Cobalt instances (ordered by score from cobalt.directory) ──────
// api.cobalt.tools is locked down for programmatic use (requires Turnstile auth)
const COBALT_INSTANCES = [
  'https://apicobalt.mgytr.top',
  'https://dog.kittycat.boo',
  'https://cobaltapi.squair.xyz',
  'https://fox.kittycat.boo',
  'https://cobaltapi.kittycat.boo',
  'https://api.cobalt.liubquanti.click',
  'https://api.cobalt.blackcat.sweeux.org',
  'https://cobaltapi.cjs.nz',
  'https://melon.clxxped.lol',
  'https://lime.clxxped.lol',
  'https://grapefruit.clxxped.lol',
  'https://rue-cobalt.xenon.zone',
  'https://nuko-c.meowing.de',
];

// Extract hostnames from Cobalt instances to allow proxied/tunneled downloads
const COBALT_HOSTS = COBALT_INSTANCES.map((url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}).filter((h) => h.length > 0);

// ─── RapidAPI Fallback Config ───────────────────────────────────────────────
const RAPIDAPI_KEY = '535dfdf4e1msh2ab83333db11e44p1bbe3djsn8c8b360cb723';
const RAPIDAPI_HOST = 'instagram120.p.rapidapi.com';


// ─── Security: Verify the media URL comes from a trusted CDN or Cobalt instance ──
function verifyHost(urlStr) {
  try {
    const hostname = new URL(urlStr).hostname;
    const allWhitelisted = [...ALLOWED_CDN_DOMAINS, ...COBALT_HOSTS];
    return allWhitelisted.some(
      (allowed) => hostname === allowed || hostname.endsWith('.' + allowed)
    );
  } catch {
    return false;
  }
}

// ─── Security: Validate Instagram URL format ─────────────────────────────────
function validateInstagramUrl(url) {
  // Accepts: /p/ /reel/ /tv/ and share links, optionally followed by query params
  return /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv|share)\/[\w-]+\/?(?:\?[\w-=&.%#+]*)?$/i.test(url.trim());
}

// Clean Instagram URLs by removing tracking query parameters
function cleanInstagramUrl(urlStr) {
  try {
    const url = new URL(urlStr.trim());
    if (url.hostname.includes('instagram.com')) {
      url.search = '';
    }
    return url.toString();
  } catch {
    return urlStr.trim();
  }
}

// ─── Direct download via CORS proxy → blob → native save dialog ──────────────
async function downloadBlob(mediaUrl, filename) {
  if (!verifyHost(mediaUrl)) {
    throw new Error('Security: Media source domain is not on the approved list.');
  }

  let res = null;
  const hostname = new URL(mediaUrl).hostname;
  const isCobaltHost = COBALT_HOSTS.some(
    (h) => hostname === h || hostname.endsWith('.' + h)
  );

  if (isCobaltHost) {
    try {
      // Direct fetch from Cobalt (it sets Access-Control-Allow-Origin: *)
      res = await fetch(mediaUrl);
    } catch (err) {
      console.warn('Direct Cobalt fetch failed, falling back to CORS proxy...', err);
    }
  }

  if (!res || !res.ok) {
    // Try Codetabs CORS proxy (supports binary media files)
    const proxied = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(mediaUrl)}`;
    try {
      res = await fetch(proxied);
      if (!res.ok) {
        throw new Error(`Codetabs proxy returned status ${res.status}`);
      }
    } catch (err) {
      console.warn('Codetabs proxy failed, trying AllOrigins fallback...', err);
      // Secondary fallback to AllOrigins raw proxy
      const backupProxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(mediaUrl)}`;
      try {
        res = await fetch(backupProxied);
      } catch (backupErr) {
        console.warn('All CORS proxy attempts failed. Attempting direct browser download via new tab...', backupErr);
        window.open(mediaUrl, '_blank');
        return;
      }
    }
  }

  if (!res || !res.ok) {
    console.warn('Proxy download failed. Attempting direct browser download via new tab...');
    window.open(mediaUrl, '_blank');
    return;
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
function guessExtension(url = '', filenameOrType = '', type = '') {
  let filename = '';
  let finalType = type;
  
  if (filenameOrType) {
    if (filenameOrType === 'video' || filenameOrType === 'photo') {
      finalType = filenameOrType;
    } else {
      filename = filenameOrType;
    }
  }

  // 1. Try extracting from filename
  if (filename) {
    const parts = filename.split('.');
    if (parts.length > 1) {
      const ext = parts.pop().toLowerCase();
      if (['mp4', 'webm', 'jpg', 'jpeg', 'png'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
  }

  // 2. Try extracting from URL path
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('.');
    if (parts.length > 1) {
      const ext = parts.pop().toLowerCase();
      if (['mp4', 'webm', 'jpg', 'jpeg', 'png'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
  } catch {}

  // 3. Fallbacks
  if (finalType === 'video' || url.includes('.mp4')) return 'mp4';
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
      url: cleanInstagramUrl(url),
      status: 'queued',
      error: '',
    }));

    const merged = [...queue, ...newItems];
    setQueue(merged);
    queueRef.current = merged;
    setUrls(['']);

    if (!processingRef.current && !carouselOpen) {
      const startIdx = queue.length;
      processingRef.current = true;
      setIsProcessing(true);
      currentIdxRef.current = startIdx;
      setTimeout(() => runQueue(startIdx), 80);
    }
  };

  // ── Queue runner ──────────────────────────────────────────────────────────
  const runQueue = async (startIdx) => {
    let idx = startIdx;

    while (processingRef.current) {
      const currentQueue = queueRef.current;
      if (idx >= currentQueue.length) {
        break;
      }

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
        let friendlyError = err.message || 'Unknown error.';
        if (friendlyError.includes('error.api.fetch.empty') || friendlyError.includes('error.api.auth.jwt.missing')) {
          friendlyError = 'Instagram login-wall: This post requires authentication, or is age/region restricted. Public servers cannot access it.';
        }
        setItemStatus(item.id, 'error', friendlyError);
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

    // Try Cobalt first
    let data = null;
    let cobaltSucceeded = false;
    let lastError = '';

    try {
      let apiResponse = null;
      for (const instance of COBALT_INSTANCES) {
        try {
          const res = await fetch(`${instance}/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              url: item.url,
              videoQuality: '1080',
              filenameStyle: 'pretty',
              downloadMode: 'auto',
              alwaysProxy: true,
            }),
            signal: AbortSignal.timeout(15000), // 15s timeout per instance
          });

          if (res.status === 429) {
            lastError = `Rate limited by ${instance}. Trying next…`;
            continue;
          }

          if (!res.ok) {
            let cobaltMsg = '';
            try {
              const errBody = await res.clone().json();
              cobaltMsg = errBody?.error?.code || errBody?.text || '';
            } catch {}
            lastError = cobaltMsg
              ? `${instance} → ${cobaltMsg}`
              : `${instance} returned HTTP ${res.status}.`;
            continue;
          }

          apiResponse = res;
          break;
        } catch (fetchErr) {
          lastError = `${instance} unreachable: ${fetchErr.message}`;
        }
      }

      if (apiResponse) {
        data = await apiResponse.json();
        if (data && data.status !== 'error') {
          cobaltSucceeded = true;
        } else if (data && data.status === 'error') {
          lastError = `Cobalt API error: ${data.error?.code || 'unknown'}`;
        }
      } else {
        lastError = lastError || 'All Cobalt instances failed to respond.';
      }
    } catch (e) {
      lastError = e.message;
    }

    if (cobaltSucceeded && data) {
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
        const ext = guessExtension(data.url, data.filename);
        const filename = `instagram_${Date.now()}.${ext}`;
        await downloadBlob(data.url, filename);
        setItemStatus(item.id, 'success');
        return false;
      }

      throw new Error(`Unexpected Cobalt response status: "${data.status}"`);
    }

    // Cobalt failed, fallback to RapidAPI
    console.log(`Cobalt failed: ${lastError}. Falling back to RapidAPI...`);
    
    try {
      const targetUrl = `https://${RAPIDAPI_HOST}/api/instagram/links?rapidapi-key=${RAPIDAPI_KEY}`;
      let res = null;
      try {
        // Try direct fetch first (may succeed from localhost or if CORS is supported)
        res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: item.url
          })
        });
      } catch (directErr) {
        console.warn('Direct RapidAPI fetch failed, trying corsproxy.io...', directErr);
        const proxiedUrl = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
        res = await fetch(proxiedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: item.url
          })
        });
      }

      if (!res.ok) {
        throw new Error(`RapidAPI returned status ${res.status}`);
      }

      const rapidData = await res.json();

      // Parse RapidAPI format
      if (!Array.isArray(rapidData) || rapidData.length === 0) {
        throw new Error('RapidAPI returned invalid or empty data.');
      }

      const slides = [];
      for (const mediaItem of rapidData) {
        if (mediaItem.urls && mediaItem.urls.length > 0) {
          const targetUrl = mediaItem.urls[0].url;
          const ext = mediaItem.urls[0].extension || '';
          const type = (ext === 'mp4' || mediaItem.urls[0].name?.toLowerCase().includes('video')) ? 'video' : 'photo';

          slides.push({
            type,
            url: targetUrl,
            thumb: mediaItem.pictureUrl || targetUrl
          });
        }
      }

      if (slides.length === 0) {
        throw new Error('No download links found in RapidAPI response.');
      }

      if (slides.length === 1) {
        setItemStatus(item.id, 'downloading');
        const slide = slides[0];
        const ext = guessExtension(slide.url, slide.type);
        const filename = `instagram_${Date.now()}.${ext}`;
        await downloadBlob(slide.url, filename);
        setItemStatus(item.id, 'success');
        return false;
      } else {
        // Carousel / slideshow — show the selector modal
        processingRef.current = false;
        setCarouselItems(slides);
        setCarouselQueueId(item.id);
        setCarouselOpen(true);
        return true; // signals pause
      }
    } catch (rapidErr) {
      throw new Error(`RapidAPI fallback also failed: ${rapidErr.message} (Cobalt error: ${lastError})`);
    }
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
    runQueue(nextIdx);
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
    runQueue(nextIdx);
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
      </footer>

      {/* ── Carousel Picker Modal ───────────────────────────────────────── */}
      {carouselOpen && (
        <CarouselSelector
          key={carouselQueueId || 'carousel'}
          isOpen={carouselOpen}
          items={carouselItems}
          onClose={handleCarouselCancel}
          onDownload={handleCarouselDownload}
        />
      )}
    </>
  );
}

export default App;
