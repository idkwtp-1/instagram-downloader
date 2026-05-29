import { useState } from 'react';
import { X, Check, Film, Image, CheckSquare, Square } from 'lucide-react';

const CarouselSelector = ({ isOpen, onClose, items = [], onDownload }) => {
  const [selectedIndices, setSelectedIndices] = useState(() => items.map((_, index) => index));

  if (!isOpen) return null;

  const toggleSelect = (index) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter((i) => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIndices.length === items.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(items.map((_, index) => index));
    }
  };

  const handleDownloadClick = () => {
    if (selectedIndices.length === 0) return;
    onDownload(selectedIndices);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <span className="modal-title-logo">📸</span> Instagram Carousel Post
          </h3>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-controls">
            <button className="select-all-btn" onClick={handleSelectAll}>
              {selectedIndices.length === items.length ? (
                <>
                  <Square size={16} /> Deselect All
                </>
              ) : (
                <>
                  <CheckSquare size={16} /> Select All
                </>
              )}
            </button>
            <span className="media-count">
              {selectedIndices.length} of {items.length} selected
            </span>
          </div>

          <div className="thumbnail-grid">
            {items.map((item, index) => {
              const isSelected = selectedIndices.includes(index);
              const isVideo = item.type === 'video' || (item.url && item.url.includes('.mp4'));
              const mediaUrl = item.thumb || item.url;

              return (
                <div
                  key={index}
                  className={`grid-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelect(index)}
                >
                  <div className="media-type-badge">
                    {isVideo ? <Film size={14} /> : <Image size={14} />}
                  </div>
                  
                  <div className="custom-checkbox">
                    <Check size={14} strokeWidth={3} />
                  </div>

                  {isVideo && !item.thumb ? (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#1a1d24',
                        color: '#646876',
                      }}
                    >
                      <Film size={32} />
                    </div>
                  ) : (
                    <>
                      <img
                        src={mediaUrl}
                        alt={`Slide ${index + 1}`}
                        className="grid-image"
                        loading="lazy"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          const fallbackNode = e.target.nextSibling;
                          if (fallbackNode) fallbackNode.style.display = 'flex';
                        }}
                      />
                      <div
                        className="grid-image-fallback"
                        style={{
                          display: 'none',
                          width: '100%',
                          height: '100%',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: '#2a2e39',
                          color: '#646876',
                        }}
                      >
                        {isVideo ? <Film size={32} /> : <Image size={32} />}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={selectedIndices.length === 0}
            onClick={handleDownloadClick}
          >
            Download Selected ({selectedIndices.length})
          </button>
        </div>
      </div>
    </div>
  );
};

export default CarouselSelector;
