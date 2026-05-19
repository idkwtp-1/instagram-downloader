import React, { useState, useEffect, useRef } from 'react';
import { 
  Instagram, 
  Download, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Settings, 
  Loader2, 
  Link, 
  ArrowRight,
  Info,
  Film
} from 'lucide-react';
import CarouselSelector from './components/CarouselSelector';
import './App.css';

// Whitelisted CDN and API Hostnames for Security
const ALLOWED_DOMAINS = [
  'cdninstagram.com',
  'instagram.com',
  'fbcdn.net',
  'tiktok.com',
  'tiktokcdn.com',
  'byteoversea.com',
  'ibyteimg.com',
  'snssdk.com',
  'cobalt.tools',
  'api.cobalt.tools',
  'co.wuk.sh'
];

function App() {
  const [activeTab, setActiveTab] = useState('instagram');
  const [inputText, setInputText] = useState('');
  const [isSimulated, setIsSimulated] = useState(false);
  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(-1);
  
  // Carousel Modal State
  const [carouselModalOpen, setCarouselModalOpen] = useState(false);
  const [carouselItems, setCarouselItems] = useState([]);
  const [carouselQueueItem, setCarouselQueueItem] = useState(null);

  // Use refs to access active states in async loop
  const processingRef = useRef(false);
  const queueRef = useRef([]);
  const currentIndexRef = useRef(-1);

  // Synchronize refs
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentIndexRef.current = currentQueueIndex;
  }, [currentQueueIndex]);

  // Handle body theme switching for ambient backgrounds
  useEffect(() => {
    document.body.className = `theme-${activeTab}`;
  }, [activeTab]);

  // URL Validation regex
  const validateUrl = (url, type) => {
    if (type === 'instagram') {
      return /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv|share)\/[\w-]+\/?/i.test(url);
    } else {
      return /^https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/[\w-./?=&]+/i.test(url);
    }
  };

  // Verify hostname is whitelisted to prevent SSRF or downloading from untrusted hosts
  const verifyHost = (urlStr) => {
    try {
      const hostname = new URL(urlStr).hostname;
      return ALLOWED_DOMAINS.some(
        allowed => hostname === allowed || hostname.endsWith('.' + allowed)
      );
    } catch (e) {
      return false;
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setInputText('');
  };

  // Helper to trigger direct browser download via CORS proxy
  const downloadFile = async (url, filename) => {
    // If url fails host whitelist, block
    if (!verifyHost(url)) {
      throw new Error('Security Error: Media source domain is not whitelisted.');
    }

    const proxiedUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxiedUrl);
    if (!response.ok) {
      throw new Error('Failed to retrieve file from CDN proxy.');
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  // Parser helper
  const parseUrls = (text) => {
    return text
      .split(/[\n,]/)
      .map(url => url.trim())
      .filter(url => url.length > 0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const urls = parseUrls(inputText);
    if (urls.length === 0) return;

    const newQueueItems = urls.map((url, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random()}`,
      url,
      status: 'queued',
      error: '',
      type: activeTab
    }));

    setQueue(prev => [...prev, ...newQueueItems]);
    setInputText('');

    // Trigger queue execution
    if (!isProcessing) {
      setIsProcessing(true);
      processingRef.current = true;
      // Start processing from next unprocessed item
      const nextIdx = queue.length;
      setCurrentQueueIndex(nextIdx);
      setTimeout(() => startQueueProcessor(nextIdx, [...queue, ...newQueueItems]), 100);
    }
  };

  const startQueueProcessor = async (startIdx, currentQueue) => {
    let index = startIdx;
    
    while (index < currentQueue.length && processingRef.current) {
      setCurrentQueueIndex(index);
      const item = currentQueue[index];
      
      // Update item status to resolving
      updateQueueItemStatus(item.id, 'resolving');
      
      try {
        await processItem(item);
      } catch (err) {
        console.error(err);
        updateQueueItemStatus(item.id, 'error', err.message);
      }

      // Add a throttle delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      index++;
    }

    setIsProcessing(false);
    processingRef.current = false;
  };

  const updateQueueItemStatus = (id, status, error = '', extra = {}) => {
    setQueue(prev => 
      prev.map(item => 
        item.id === id ? { ...item, status, error, ...extra } : item
      )
    );
  };

  const processItem = async (item) => {
    // 1. Validate Input URL
    if (!validateUrl(item.url, item.type)) {
      throw new Error(`Invalid ${item.type === 'instagram' ? 'Instagram' : 'TikTok'} URL format.`);
    }

    // 2. Resolve media
    if (isSimulated) {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // If it contains 'carousel' or 'multi', simulate a carousel selection
      if (item.type === 'instagram' && (item.url.includes('carousel') || item.url.includes('multi'))) {
        const dummySlides = [
          { type: 'photo', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500', thumb: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150' },
          { type: 'photo', url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=500', thumb: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=150' },
          { type: 'video', url: 'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4', thumb: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=150' }
        ];
        
        // Pause queue processor, launch picker modal
        processingRef.current = false;
        setCarouselItems(dummySlides);
        setCarouselQueueItem(item);
        setCarouselModalOpen(true);
        return; // We exit this call; it will resume when user triggers download in modal
      } else {
        // Simulate normal single media download
        updateQueueItemStatus(item.id, 'downloading');
        await new Promise(resolve => setTimeout(resolve, 1200));
        updateQueueItemStatus(item.id, 'success');
      }
    } else {
      // Real API Call using Cobalt
      const response = await fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          url: item.url,
          vQuality: '1080',
          filenamePattern: 'pretty'
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limited by Cobalt API. Try again in a minute, or enable offline Simulation Mode.');
        }
        throw new Error(`API resolved with status code ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(data.error?.code || 'API returned an error resolving this link.');
      }

      if (data.status === 'picker') {
        // Carousel Post
        processingRef.current = false; // Pause queue
        
        // Map Cobalt picker response to Carousel selector schema
        const slides = data.picker.map(p => ({
          type: p.type || (p.url.includes('.mp4') ? 'video' : 'photo'),
          url: p.url,
          thumb: p.thumb || p.url
        }));

        setCarouselItems(slides);
        setCarouselQueueItem(item);
        setCarouselModalOpen(true);
      } else if (data.status === 'redirect' || data.status === 'tunnel') {
        // Single file
        updateQueueItemStatus(item.id, 'downloading');
        
        const fileExt = item.type === 'tiktok' || data.url.includes('.mp4') ? 'mp4' : 'jpg';
        const filename = `${item.type}_media_${Date.now()}.${fileExt}`;
        
        await downloadFile(data.url, filename);
        updateQueueItemStatus(item.id, 'success');
      } else {
        throw new Error('Unsupported status response from resolver.');
      }
    }
  };

  // Callback when Carousel items are selected and downloaded
  const handleCarouselDownload = async (selectedIndices) => {
    setCarouselModalOpen(false);
    if (!carouselQueueItem) return;

    updateQueueItemStatus(carouselQueueItem.id, 'downloading');

    try {
      const selectedItems = selectedIndices.map(i => carouselItems[i]);

      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        const isVideo = item.type === 'video' || item.url.includes('.mp4');
        const filename = `instagram_carousel_${Date.now()}_${i + 1}.${isVideo ? 'mp4' : 'jpg'}`;
        
        if (isSimulated) {
          // Mock download delay
          await new Promise(r => setTimeout(r, 800));
          console.log(`Mocking download: ${filename}`);
        } else {
          await downloadFile(item.url, filename);
        }
      }
      
      updateQueueItemStatus(carouselQueueItem.id, 'success');
    } catch (err) {
      updateQueueItemStatus(carouselQueueItem.id, 'error', err.message);
    }

    // Resume queue processing
    setIsProcessing(true);
    processingRef.current = true;
    const nextIdx = currentIndexRef.current + 1;
    startQueueProcessor(nextIdx, queueRef.current);
  };

  const handleCarouselCancel = () => {
    setCarouselModalOpen(false);
    if (carouselQueueItem) {
      updateQueueItemStatus(carouselQueueItem.id, 'error', 'Carousel download cancelled by user.');
    }
    
    // Resume queue processing for the next item
    setIsProcessing(true);
    processingRef.current = true;
    const nextIdx = currentIndexRef.current + 1;
    startQueueProcessor(nextIdx, queueRef.current);
  };

  const clearQueue = () => {
    setQueue([]);
    setCurrentQueueIndex(-1);
    setIsProcessing(false);
    processingRef.current = false;
  };

  return (
    <>
      <header className="app-header">
        <div className="logo-container">
          <Film className="logo-icon" size={32} />
          <h1 className="app-title">Insta<span className="app-title-highlight">Snip</span></h1>
        </div>
        <p className="app-subtitle">Secure, fast, and high-quality batch media downloader</p>
      </header>

      {/* Navigation Tabs */}
      <div className="tabs-container">
        <button 
          className={`tab-btn tab-instagram ${activeTab === 'instagram' ? 'active' : ''}`}
          onClick={() => handleTabChange('instagram')}
        >
          <Instagram size={18} /> Instagram Downloader
        </button>
        <button 
          className={`tab-btn tab-tiktok ${activeTab === 'tiktok' ? 'active' : ''}`}
          onClick={() => handleTabChange('tiktok')}
        >
          <Film size={18} /> TikTok Downloader
        </button>
        <div 
          className="tab-indicator" 
          style={{ transform: `translateX(${activeTab === 'instagram' ? '0%' : '100%'})` }}
        />
      </div>

      {/* Main card */}
      <main className="main-card">
        {/* Settings Bar */}
        <div className="settings-bar">
          <div className="toggle-container">
            <Settings size={14} />
            <span>Simulation Mode (Offline Test)</span>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={isSimulated}
                onChange={(e) => setIsSimulated(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <h2 className="form-title">
            Paste {activeTab === 'instagram' ? 'Instagram' : 'TikTok'} Links
          </h2>
          <p className="form-description">
            Supports Reels, Videos, Photos, and Carousels. Put each link on a new line or separate them with commas.
          </p>

          <div className="input-container">
            <textarea
              className="batch-textarea"
              placeholder={
                activeTab === 'instagram' 
                  ? "https://www.instagram.com/p/C7XyK...\nhttps://www.instagram.com/reel/C2zYQ..."
                  : "https://www.tiktok.com/@user/video/7234...\nhttps://vm.tiktok.com/ZMYx..."
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isProcessing}
            />
            <Link className="input-icon-overlay" size={20} />
          </div>

          <div className="actions-panel">
            {queue.length > 0 && (
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={clearQueue}
                disabled={isProcessing}
              >
                <Trash2 size={16} /> Clear Queue
              </button>
            )}
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={isProcessing || !inputText.trim()}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="spinner" size={18} /> Resolving Queue...
                </>
              ) : (
                <>
                  Start Download <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      {/* Queue Section */}
      {queue.length > 0 && (
        <section className="main-card" style={{ padding: '24px' }}>
          <div className="queue-header">
            <h3 className="queue-title">Download Queue</h3>
            <span className="media-count">
              {queue.filter(i => i.status === 'success').length} of {queue.length} completed
            </span>
          </div>

          <div className="queue-container">
            {queue.map((item, idx) => (
              <div key={item.id} className={`queue-card ${item.status}`}>
                <div className="card-top">
                  <div className="card-url-info">
                    <span className="card-index">Item #{idx + 1}</span>
                    <span className="card-url">{item.url}</span>
                  </div>

                  <span className={`badge ${item.status}`}>
                    {item.status === 'queued' && 'Queued'}
                    {item.status === 'resolving' && (
                      <>
                        <Loader2 className="spinner" size={12} /> Resolving
                      </>
                    )}
                    {item.status === 'downloading' && (
                      <>
                        <Loader2 className="spinner" size={12} /> Downloading
                      </>
                    )}
                    {item.status === 'success' && (
                      <>
                        <CheckCircle size={12} /> Success
                      </>
                    )}
                    {item.status === 'error' && (
                      <>
                        <AlertCircle size={12} /> Error
                      </>
                    )}
                  </span>
                </div>

                {item.status === 'error' && (
                  <div className="card-bottom">
                    <span className="error-text">{item.error}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} InstaSnip. Built for educational and personal use.</p>
        <p style={{ marginTop: '4px', fontSize: '0.75rem' }}>
          Please respect intellectual property rights. Download content only with owner consent.
        </p>
      </footer>

      {/* Carousel Selection Modal */}
      <CarouselSelector
        isOpen={carouselModalOpen}
        items={carouselItems}
        onClose={handleCarouselCancel}
        onDownload={handleCarouselDownload}
      />
    </>
  );
}

export default App;
