import { useState, useEffect, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
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
  ClipboardPaste,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import CarouselSelector from './components/CarouselSelector';
import './App.css';

// ─── Security: Whitelisted CDN & Cobalt Tunnel Domains ───────────────────────
const ALLOWED_CDN_DOMAINS = [
  'cdninstagram.com',
  'instagram.com',
  'fbcdn.net',
  'scontent.cdninstagram.com',
  'scontent.net',
  'facebook.com',
  'akamaihd.net',
  'kittycat.boo',
  'xenon.zone',
  'cjs.nz',
  'liubquanti.click',
  'meowing.de',
  'clxxped.lol',
  'squair.xyz',
  'mgytr.top',
];

// ─── Verified Fast Community Cobalt Instances ────────────────────────────────
const COBALT_INSTANCES = [
  'https://rue-cobalt.xenon.zone',
  'https://cobaltapi.kittycat.boo',
  'https://dog.kittycat.boo',
  'https://cobaltapi.cjs.nz',
  'https://api.cobalt.liubquanti.click',
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

// ─── Robust Instagram URL Extraction & Cleaning (handles mobile share text/commas) ──
function extractInstagramUrl(input) {
  if (!input || typeof input !== 'string') return '';
  const match = input.match(/https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[^\s"'<>,]+)/i);
  if (!match) return input.trim();
  let urlStr = match[0];
  // Remove any trailing punctuation commonly attached on mobile (commas, periods, brackets)
  urlStr = urlStr.replace(/[.,;:)\]}>]+$/, '');
  return urlStr;
}

// ─── Validate Instagram URL format ───────────────────────────────────────────
function validateInstagramUrl(url) {
  if (!url) return false;
  try {
    const extracted = extractInstagramUrl(url);
    const parsed = new URL(extracted);
    const isInsta = parsed.hostname.includes('instagram.com') || parsed.hostname === 'ig.me';
    if (!isInsta) return false;
    return /\/(?:p|reel|reels|tv|share|stories)\/[\w-]+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

// Clean Instagram URLs by normalizing /reels/ and removing tracking query parameters
function cleanInstagramUrl(urlStr) {
  try {
    const extracted = extractInstagramUrl(urlStr);
    const url = new URL(extracted);
    if (url.hostname.includes('instagram.com') || url.hostname === 'ig.me') {
      // Normalize /reels/ to /reel/
      url.pathname = url.pathname.replace(/\/reels\//i, '/reel/');
      url.search = '';
    }
    return url.toString();
  } catch {
    return urlStr.trim();
  }
}

// ─── Direct download via direct tunnel / blob save ────────────────────────────
async function downloadBlob(mediaUrl, filename) {
  if (!verifyHost(mediaUrl)) {
    throw new Error('Security: Media source domain is not on the approved list.');
  }

  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // 1. On mobile devices:
  // Trigger direct native download immediately.
  // Cobalt tunnels send Content-Disposition: attachment, prompting the OS download sheet directly without RAM exhaustion.
  if (isMobile) {
    try {
      const anchor = document.createElement('a');
      anchor.href = mediaUrl;
      anchor.download = filename;
      anchor.target = '_self';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    } catch (e) {
      console.warn('Mobile direct anchor click failed:', e);
    }
  }

  // 2. On desktop: Try direct fetch with a 5s timeout to stream as Blob with custom filename
  let res = null;
  try {
    res = await fetch(mediaUrl, {
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn('Direct media fetch failed (CORS or timeout), using native download trigger:', err);
  }

  // If blob fetch succeeded, create blob URL and trigger save dialog
  if (res && res.ok) {
    try {
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      return;
    } catch (blobErr) {
      console.warn('Blob conversion failed, falling back to direct navigation...', blobErr);
    }
  }

  // 3. Universal Fallback: trigger native browser download
  const anchor = document.createElement('a');
  anchor.href = mediaUrl;
  anchor.download = filename;
  anchor.target = isMobile ? '_self' : '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

// ─── Parse pasted text into individual URLs ──────────────────────────────────
function parseUrls(text) {
  if (!text) return [];
  const lines = text.split(/[\n,]/).map((u) => u.trim()).filter(Boolean);
  const result = [];
  for (const line of lines) {
    const extracted = extractInstagramUrl(line);
    if (extracted && validateInstagramUrl(extracted)) {
      result.push(cleanInstagramUrl(extracted));
    } else if (line.length > 0) {
      result.push(line);
    }
  }
  return result.length > 0 ? result : [text.trim()];
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
  } catch {
    /* ignore invalid url */
  }

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
  // PWA install prompt state
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

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

  // Handle quick paste button click (reading clipboard API directly)
  const handleQuickPaste = async (index) => {
    try {
      const pasted = await navigator.clipboard.readText();
      if (!pasted || !pasted.trim()) return;
      const parsed = parseUrls(pasted);
      if (parsed.length === 0) return;
      setUrls((prev) => {
        const copy = [...prev];
        copy.splice(index, 1, ...parsed);
        return copy;
      });
    } catch (err) {
      console.warn('Clipboard access denied or failed: ', err);
      alert('Clipboard access blocked by browser. Please paste using Ctrl+V / Cmd+V.');
    }
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

  // ── Retry handler ─────────────────────────────────────────────────────────
  const handleRetry = (id) => {
    // Reset status to queued
    setItemStatus(id, 'queued', '');
    
    // Find the item's index to restart queue from there if it's earlier than current
    const targetIdx = queueRef.current.findIndex(item => item.id === id);
    if (targetIdx === -1) return;
    
    if (!processingRef.current && !carouselOpen) {
      processingRef.current = true;
      setIsProcessing(true);
      currentIdxRef.current = targetIdx;
      setTimeout(() => runQueue(targetIdx), 80);
    }
  };

  // ── Queue runner ──────────────────────────────────────────────────────────
  const runQueue = async (startIdx) => {
    let idx = startIdx;
    let shouldPause = false;

    try {
      while (processingRef.current) {
        const currentQueue = queueRef.current;
        if (idx >= currentQueue.length) {
          break;
        }

        const item = currentQueue[idx];
        
        if (item.status === 'success' || item.status === 'resolving' || item.status === 'downloading') {
          idx++;
          continue;
        }
        
        currentIdxRef.current = idx;
        setItemStatus(item.id, 'resolving');

        try {
          const needsPause = await processItem(item);
          if (needsPause) {
            // Carousel modal is open — pause queue until user responds
            shouldPause = true;
            return;
          }
        } catch (err) {
          let friendlyError = err.message || 'Unknown error.';
          if (friendlyError.includes('error.api.fetch.empty')) {
            friendlyError = 'Instagram login-wall: This post requires authentication, or is age/region restricted. Public servers cannot access it.';
          }
          setItemStatus(item.id, 'error', friendlyError);
        }

        // Throttle between downloads to be respectful to the API
        await new Promise((r) => setTimeout(r, 800));
        idx++;
      }
    } finally {
      // Guaranteed safety: If not paused by carousel, reset processing state
      if (!shouldPause) {
        setIsProcessing(false);
        processingRef.current = false;
      }
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
            signal: AbortSignal.timeout(12000), // increased to 12s per instance
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
            } catch {
              /* ignore json parse failure */
            }
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
        setItemStatus(item.id, 'success', '', { downloadUrl: data.url, downloadName: filename });
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
          }),
          signal: AbortSignal.timeout(15000), // increased to 15s
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
          }),
          signal: AbortSignal.timeout(15000), // increased to 15s
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
        setItemStatus(item.id, 'success', '', { downloadUrl: slide.url, downloadName: filename });
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
      throw new Error(`RapidAPI fallback also failed: ${rapidErr.message} (Cobalt error: ${lastError})`, { cause: rapidErr });
    }
  };

  // ── Carousel download confirmed ───────────────────────────────────────────
  const handleCarouselDownload = async (selectedIndices) => {
    setCarouselOpen(false);

    if (!carouselQueueId) return;
    setItemStatus(carouselQueueId, 'downloading');

    try {
      const selected = selectedIndices.map((i) => carouselItems[i]);

      if (selected.length === 1) {
        // Single item, just download it directly
        const slide = selected[0];
        const ext = guessExtension(slide.url, slide.type);
        // eslint-disable-next-line react-hooks/purity
        const filename = `instagram_${Date.now()}.${ext}`;
        await downloadBlob(slide.url, filename);
        setItemStatus(carouselQueueId, 'success', '', {
          downloadUrl: slide.url,
          downloadName: filename
        });
      } else {
        // Multiple items, bundle into ZIP
        const zip = new JSZip();
        
        for (let i = 0; i < selected.length; i++) {
          const slide = selected[i];
          const ext = guessExtension(slide.url, slide.type);
          // eslint-disable-next-line react-hooks/purity
          const filename = `instagram_${Date.now()}_${i + 1}.${ext}`;
          
          // Fetch the blob to add to zip
          const response = await fetch(slide.url);
          if (!response.ok) throw new Error(`Failed to fetch media for zipping: ${response.statusText}`);
          const blob = await response.blob();
          zip.file(filename, blob);
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        // eslint-disable-next-line react-hooks/purity
        const zipFilename = `instagram_carousel_${Date.now()}.zip`;
        const zipUrl = URL.createObjectURL(zipBlob);
        
        saveAs(zipBlob, zipFilename);
        
        setItemStatus(carouselQueueId, 'success', '', {
          downloadUrl: zipUrl,
          downloadName: zipFilename
        });
      }
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
          {installPrompt && (
            <button
              type="button"
              className="chip chip-install"
              onClick={handleInstallClick}
              title="Install InstaSnip to your home screen or desktop"
            >
              <Smartphone size={13} /> Install App
            </button>
          )}
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
                  <div className="url-input-actions">
                    <button
                      type="button"
                      className="paste-url-btn"
                      onClick={() => handleQuickPaste(i)}
                      disabled={isProcessing}
                      title="Paste from clipboard"
                      aria-label="Paste URL"
                    >
                      <ClipboardPaste size={15} />
                    </button>
                    {urls.length > 1 && (
                      <button
                        type="button"
                        className="remove-url-btn"
                        onClick={() => removeUrl(i)}
                        disabled={isProcessing}
                        title="Remove URL"
                        aria-label="Remove URL"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
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
                  <>
                    <p className="error-text">{item.error}</p>
                    <div className="card-actions-error">
                      <button
                        type="button"
                        className="btn-card-retry"
                        onClick={() => handleRetry(item.id)}
                        title="Retry this download"
                      >
                        <RefreshCw size={13} /> Retry
                      </button>
                    </div>
                  </>
                )}
                {item.status === 'success' && item.downloadUrl && (
                  <div className="card-actions-success">
                    <a
                      href={item.downloadUrl}
                      download={item.downloadName || 'instagram_media'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-card-save"
                    >
                      <Download size={13} /> Save / Open File
                    </a>
                  </div>
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
