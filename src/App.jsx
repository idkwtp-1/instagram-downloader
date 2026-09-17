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
  Archive,
  Sparkles,
} from 'lucide-react';
import CarouselSelector from './components/CarouselSelector';
import ElapsedTimer from './components/ElapsedTimer';
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
  'aelew.dev',
  'workers.dev',
  'kittycat.boo',
  'xenon.zone',
  'cjs.nz',
  'liubquanti.click',
  'meowing.de',
  'clxxped.lol',
  'squair.xyz',
  'mgytr.top',
];

// ─── Cloudflare Worker Edge Gateway (Zero file size limits & full CORS) ───────
const GATEWAY_ENDPOINT = 'https://instasnip-gateway.ag299842-dbe.workers.dev/resolve';
const GATEWAY_PROXY = 'https://instasnip-gateway.ag299842-dbe.workers.dev/proxy?url=';

// ─── Verified Fast Community Cobalt Instances ────────────────────────────────
const COBALT_INSTANCES = [
  'https://cobalt.aelew.dev',
  'https://api.cobalt.liubquanti.click',
  'https://cobaltapi.cjs.nz',
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
const RAPIDAPI_HOST = 'instagram-scraper-api2.p.rapidapi.com';

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

// Tracking parameters commonly added by Instagram/Facebook/Meta
const TRACKING_QUERY_PARAMS = new Set([
  'igsh',
  'igshid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'src',
  'ref',
]);

// Clean Instagram URLs by normalizing /reels/ and removing tracking query parameters while preserving functional tokens (e.g. stkn)
function cleanInstagramUrl(urlStr) {
  try {
    const extracted = extractInstagramUrl(urlStr);
    const url = new URL(extracted);
    if (url.hostname.includes('instagram.com') || url.hostname === 'ig.me') {
      // Normalize /reels/ to /reel/
      url.pathname = url.pathname.replace(/\/reels\//i, '/reel/');
      
      const searchParams = new URLSearchParams(url.search);
      const keysToDelete = [];
      for (const key of searchParams.keys()) {
        const lowerKey = key.toLowerCase();
        if (TRACKING_QUERY_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((k) => searchParams.delete(k));
      const remaining = searchParams.toString();
      url.search = remaining ? `?${remaining}` : '';
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

  // 1. Try direct fetch first
  let res = null;
  try {
    res = await fetch(mediaUrl, {
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Direct fetch blocked by CORS or timed out
  }

  // 2. If direct fetch failed (CORS), fetch through Edge Gateway streaming proxy
  if (!res || !res.ok) {
    try {
      const proxyUrl = `${GATEWAY_PROXY}${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
      res = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(30000),
      });
    } catch (proxyErr) {
      console.warn('Edge Gateway proxy fetch failed:', proxyErr);
    }
  }

  // 3. If blob fetch succeeded, create blob URL and trigger save dialog
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

  // 4. Universal Fallback: trigger browser download via proxy with Content-Disposition
  const finalUrl = `${GATEWAY_PROXY}${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(filename)}`;
  const anchor = document.createElement('a');
  anchor.href = finalUrl;
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
  const [queue, setQueue] = useState(() => {
    try {
      const saved = localStorage.getItem('instasnip_queue_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => {
            // Reset any interrupted items so they can be run or retried
            if (item.status === 'resolving' || item.status === 'downloading') {
              return { ...item, status: 'queued', error: '' };
            }
            return item;
          });
        }
      }
    } catch {
      /* ignore storage read errors */
    }
    return [];
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  // Global Drag & Drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Carousel modal state
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselItems, setCarouselItems] = useState([]);
  const [carouselQueueId, setCarouselQueueId] = useState(null);

  // Refs to avoid stale closures inside async loops
  const processingRef = useRef(false);
  const queueRef = useRef([]);
  const currentIdxRef = useRef(-1);
  const runQueueRef = useRef(null);
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

  // Sync queue to localStorage & queueRef
  useEffect(() => {
    queueRef.current = queue;
    try {
      if (queue.length > 0) {
        localStorage.setItem('instasnip_queue_v2', JSON.stringify(queue));
      } else {
        localStorage.removeItem('instasnip_queue_v2');
      }
    } catch {
      /* ignore storage write errors */
    }
  }, [queue]);

  // ── Global Drag & Drop Handler (Digital Darkroom Ingestion) ────────────────
  useEffect(() => {
    const handleDragEnter = (e) => {
      e.preventDefault();
      dragCounterRef.current += 1;
      if (e.dataTransfer && e.dataTransfer.types) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const text = e.dataTransfer.getData('text');
      if (!text) return;

      const parsed = parseUrls(text);
      if (parsed.length === 0) return;

      const validUrls = parsed.filter((u) => validateInstagramUrl(u));
      if (validUrls.length === 0) return;

      const now = Date.now();
      const newItems = validUrls.map((url, idx) => ({
        id: `${now}-${idx}-${Math.random().toString(36).slice(2)}`,
        url: cleanInstagramUrl(url),
        status: 'queued',
        error: '',
        startTime: null,
      }));

      setQueue((prev) => {
        const merged = [...prev, ...newItems];
        queueRef.current = merged;
        return merged;
      });

      if (!processingRef.current && !carouselOpen) {
        const startIdx = queueRef.current.length;
        processingRef.current = true;
        setIsProcessing(true);
        currentIdxRef.current = startIdx;
        setTimeout(() => runQueueRef.current?.(startIdx), 80);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [carouselOpen]);

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
    try {
      localStorage.removeItem('instasnip_queue_v2');
    } catch {
      /* ignore */
    }
    setIsProcessing(false);
    processingRef.current = false;
    currentIdxRef.current = -1;
  };

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = (e) => {
    e.preventDefault();
    const validUrls = urls.map((u) => u.trim()).filter((u) => u.length > 0);
    if (validUrls.length === 0) return;

    const now = Date.now();
    const newItems = validUrls.map((url, idx) => ({
      id: `${now}-${idx}-${Math.random().toString(36).slice(2)}`,
      url: cleanInstagramUrl(url),
      status: 'queued',
      error: '',
      startTime: null,
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
      setTimeout(() => runQueueRef.current?.(startIdx), 80);
    }
  };

  // ── Master Session Archive (Smart Scrapbook ZIP) ───────────────────────────
  const handleDownloadMasterArchive = async () => {
    const successItems = queue.filter((item) => item.status === 'success' && item.downloadUrl);
    if (successItems.length === 0 || isArchiving) return;

    setIsArchiving(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('InstaSnip_Media');
      const manifest = [];
      manifest.push('==================================================');
      manifest.push('InstaSnip Digital Darkroom — Session Media Archive');
      manifest.push(`Export Date  : ${new Date().toISOString()}`);
      manifest.push(`Total Items  : ${successItems.length}`);
      manifest.push('==================================================\n');

      for (let i = 0; i < successItems.length; i++) {
        const item = successItems[i];
        const ext = guessExtension(item.downloadUrl, item.downloadName);
        const filename = `frame_${String(i + 1).padStart(2, '0')}.${ext}`;

        manifest.push(`[FRAME #${String(i + 1).padStart(2, '0')}]`);
        manifest.push(`File Name   : ${filename}`);
        manifest.push(`Origin URL  : ${item.url}`);
        manifest.push(`Media Link  : ${item.downloadUrl}`);
        manifest.push('');

        try {
          const res = await fetch(item.downloadUrl);
          if (res.ok) {
            const blob = await res.blob();
            folder.file(filename, blob);
          }
        } catch (fetchErr) {
          console.warn(`Could not include direct stream blob for ${item.url}:`, fetchErr);
        }
      }

      folder.file('manifest.txt', manifest.join('\n'));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const archiveName = `InstaSnip_Session_${Date.now()}.zip`;
      saveAs(zipBlob, archiveName);
    } catch (err) {
      console.error('Master archive creation error:', err);
      alert('Failed to bundle session archive: ' + err.message);
    } finally {
      setIsArchiving(false);
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
      setTimeout(() => runQueueRef.current?.(targetIdx), 80);
    }
  };

  const handleRetryAll = () => {
    const failedItems = queueRef.current.filter(i => i.status === 'error');
    if (failedItems.length === 0) return;

    let lowestIdx = queueRef.current.length;
    
    // Reset all failed to queued and find the earliest failed index
    failedItems.forEach(item => {
      setItemStatus(item.id, 'queued', '');
      const idx = queueRef.current.findIndex(i => i.id === item.id);
      if (idx < lowestIdx) lowestIdx = idx;
    });

    if (!processingRef.current && !carouselOpen) {
      processingRef.current = true;
      setIsProcessing(true);
      currentIdxRef.current = lowestIdx;
      setTimeout(() => runQueueRef.current?.(lowestIdx), 80);
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
        setItemStatus(item.id, 'resolving', '', { startTime: Date.now() });

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

  useEffect(() => {
    runQueueRef.current = runQueue;
  });

  // ── Process a single queue item ───────────────────────────────────────────
  const processItem = async (item) => {
    // 1. Validate URL format
    if (!validateInstagramUrl(item.url)) {
      throw new Error(
        'Invalid Instagram URL. Accepted formats: /p/, /reel/, /tv/, /share/'
      );
    }

    // 1. Try Cloudflare Worker Edge Gateway first (high-speed, zero size limit, full CORS)
    let data = null;
    let cobaltSucceeded = false;
    let lastError = '';

    try {
      const gwRes = await fetch(GATEWAY_ENDPOINT, {
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
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (gwRes.ok) {
        const gwJson = await gwRes.json();
        if (gwJson && gwJson.status !== 'error') {
          data = gwJson;
          cobaltSucceeded = true;
        } else if (gwJson?.error?.code) {
          lastError = `Gateway: ${gwJson.error.code}`;
        }
      } else {
        lastError = `Gateway HTTP ${gwRes.status}`;
      }
    } catch (gwErr) {
      lastError = `Gateway unreachable: ${gwErr.message}`;
    }

    // 2. Secondary fallback: direct community instances
    if (!cobaltSucceeded) {
      for (const instance of COBALT_INSTANCES) {
        try {
          const res = await fetch(`${instance}/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'User-Agent': 'raycast-cobalt/20241120',
              'Authorization': 'Api-Key 00000000-0000-4000-a000-000000000000',
            },
            body: JSON.stringify({
              url: item.url,
              videoQuality: '1080',
              filenameStyle: 'pretty',
              downloadMode: 'auto',
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (res.ok) {
            const instJson = await res.json();
            if (instJson && instJson.status !== 'error') {
              data = instJson;
              cobaltSucceeded = true;
              break;
            }
          }
        } catch (fetchErr) {
          lastError = `${instance} unreachable: ${fetchErr.message}`;
        }
      }
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
      const targetUrl = `https://${RAPIDAPI_HOST}/v1/post_info?code_or_id_or_url=${encodeURIComponent(item.url)}`;
      let res = null;
      try {
        res = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': RAPIDAPI_HOST,
          },
          signal: AbortSignal.timeout(25000),
        });
      } catch (directErr) {
        console.warn('Direct RapidAPI fetch failed, trying Edge Gateway proxy...', directErr);
        const proxiedUrl = `${GATEWAY_PROXY}${encodeURIComponent(targetUrl)}`;
        res = await fetch(proxiedUrl, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': RAPIDAPI_KEY,
            'X-RapidAPI-Host': RAPIDAPI_HOST,
          },
          signal: AbortSignal.timeout(25000),
        });
      }

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error(`RapidAPI subscription required or key expired (${RAPIDAPI_HOST})`);
        }
        throw new Error(`RapidAPI returned status ${res.status}`);
      }

      const rapidData = await res.json();
      const slides = [];

      // Format A: Standard Instagram GraphQL/Scraper data object
      if (rapidData?.data) {
        const d = rapidData.data;
        if (Array.isArray(d.carousel_media) && d.carousel_media.length > 0) {
          for (const item of d.carousel_media) {
            const vid = item.video_versions?.[0]?.url;
            const img = item.image_versions?.items?.[0]?.url || item.image_versions2?.candidates?.[0]?.url;
            slides.push({
              type: vid ? 'video' : 'photo',
              url: vid || img,
              thumb: img || vid,
            });
          }
        } else if (d.video_versions && d.video_versions.length > 0) {
          slides.push({
            type: 'video',
            url: d.video_versions[0].url,
            thumb: d.image_versions?.items?.[0]?.url || d.video_versions[0].url,
          });
        } else if (d.image_versions?.items?.length > 0) {
          slides.push({
            type: 'photo',
            url: d.image_versions.items[0].url,
            thumb: d.image_versions.items[0].url,
          });
        }
      }

      // Format B: Legacy array format
      if (slides.length === 0 && Array.isArray(rapidData)) {
        for (const mediaItem of rapidData) {
          if (mediaItem.urls && mediaItem.urls.length > 0) {
            const targetUrl = mediaItem.urls[0].url;
            const ext = mediaItem.urls[0].extension || '';
            const type = (ext === 'mp4' || mediaItem.urls[0].name?.toLowerCase().includes('video')) ? 'video' : 'photo';
            slides.push({
              type,
              url: targetUrl,
              thumb: mediaItem.pictureUrl || targetUrl,
            });
          }
        }
      }

      if (slides.length === 0) {
        throw new Error('No download links found in fallback API response.');
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
          const filename = `instagram_${Date.now()}_${i + 1}.${ext}`;
          
          // Fetch the blob to add to zip (direct, or via edge streaming proxy if CORS-blocked)
          let blob = null;
          try {
            const response = await fetch(slide.url, { signal: AbortSignal.timeout(4000) });
            if (response.ok) {
              blob = await response.blob();
            }
          } catch {
            /* Expected CORS block from Instagram CDN */
          }

          if (!blob) {
            const proxyUrl = `${GATEWAY_PROXY}${encodeURIComponent(slide.url)}&filename=${encodeURIComponent(filename)}`;
            const proxyRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(20000) });
            if (!proxyRes.ok) throw new Error(`Failed to fetch media for zipping: ${proxyRes.statusText}`);
            blob = await proxyRes.blob();
          }

          zip.file(filename, blob);
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
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
    runQueueRef.current?.(nextIdx);
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
    runQueueRef.current?.(nextIdx);
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
      {queue.length > 0 && (() => {
        const failedCount = queue.filter(item => item.status === 'error').length;
        
        return (
          <section className="main-card queue-section" aria-label="Download queue">
            <div className="queue-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 className="queue-title">Download Queue</h3>
                <span className="media-count">
                  {completedCount} / {queue.length} done
                </span>
              </div>
              <div className="queue-header-actions">
                {completedCount >= 2 && (
                  <button
                    type="button"
                    className="btn-master-archive"
                    onClick={handleDownloadMasterArchive}
                    disabled={isArchiving}
                    title="Bundle all completed media into a single session ZIP archive"
                  >
                    {isArchiving ? (
                      <><Loader2 className="spinner" size={13} /> Archiving…</>
                    ) : (
                      <><Archive size={13} /> Download Session Archive (.zip)</>
                    )}
                  </button>
                )}
              </div>
            </div>

            <ul className="queue-list">
              {queue.map((item, idx) => (
                <li key={item.id} className={`queue-card status-${item.status}`}>
                  <div className="film-perforation-strip" aria-hidden="true">
                    <span className="film-hole" />
                    <span className="film-hole" />
                    <span className="film-hole" />
                    <span className="film-hole" />
                    <span className="film-hole" />
                    <span className="film-hole" />
                  </div>
                  <div className="card-top">
                    <div className="card-url-info">
                      <div className="card-meta-line">
                        <span className="card-index">FRAME // {String(idx + 1).padStart(2, '0')}</span>
                        {(item.status === 'resolving' || item.status === 'downloading') && (
                          <ElapsedTimer startTime={item.startTime} />
                        )}
                        {item.status === 'resolving' && (
                          <span className="telemetry-tag">TUNNEL CONNECTING</span>
                        )}
                        {item.status === 'downloading' && (
                          <span className="telemetry-tag">STREAMING CHUNKS</span>
                        )}
                      </div>
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
                      {failedCount === 1 && (
                        <div className="card-actions-error">
                          <button
                            type="button"
                            className="btn-card-retry"
                            // eslint-disable-next-line react-hooks/refs
                            onClick={() => handleRetry(item.id)}
                            title="Retry this download"
                          >
                            <RefreshCw size={13} /> Retry
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {item.status === 'success' && item.downloadUrl && (
                    <div className="card-actions-success">
                      <a
                        href={item.downloadUrl.startsWith('blob:') ? item.downloadUrl : `${GATEWAY_PROXY}${encodeURIComponent(item.downloadUrl)}&filename=${encodeURIComponent(item.downloadName || 'instagram_media')}`}
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
            
            {failedCount > 1 && (
              <div className="queue-footer-actions" style={{ marginTop: '20px', textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn-card-retry"
                  style={{ padding: '8px 24px', fontSize: '0.9rem' }}
                  onClick={handleRetryAll}
                  title="Retry all failed downloads"
                >
                  <RefreshCw size={15} /> Retry All Failed ({failedCount})
                </button>
              </div>
            )}
          </section>
        );
      })()}

      {/* ── Global Darkroom Dropzone Overlay ─────────────────────────── */}
      {isDragging && (
        <div className="darkroom-dropzone-overlay" aria-live="polite">
          <div className="darkroom-dropzone-box">
            <div className="dropzone-icon-glow">
              <Layers size={36} />
            </div>
            <h3 className="dropzone-title">Drop Instagram Links Here</h3>
            <p className="dropzone-subtitle">
              Release anywhere to ingest posts, reels, or multiple links directly into the queue.
            </p>
            <div className="dropzone-chip">
              <Sparkles size={13} />
              <span>DIGITAL DARKROOM INGESTION</span>
            </div>
          </div>
        </div>
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
