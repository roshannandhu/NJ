import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, Plus, Check, Edit3, LayoutTemplate } from 'lucide-react';
import { useAppContext } from '../AppContext';
import './MobilePageViewport.css';

export const MobileViewportContext = createContext(null);
export const useMobileViewport = () => useContext(MobileViewportContext);

export default function MobilePageViewport({
  children,
  initialEditMode = false,
  onAddItem,
  documentType = 'quotation',
  onDone,
}) {
  const { registerBackHandler } = useAppContext();
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const wrapperRef = useRef(null);

  const [isEditMode, setIsEditMode] = useState(initialEditMode);
  const [scale, setScale] = useState(1);
  const [fitWidthScale, setFitWidthScale] = useState(1);
  const [fitPageScale, setFitPageScale] = useState(0.4);
  const [contentHeight, setContentHeight] = useState(1123);
  const [fitMode, setFitMode] = useState('width'); // 'width' | 'full' | 'custom'

  // Dynamically observe content height changes (multi-page, adding rows, etc.)
  useEffect(() => {
    if (!wrapperRef.current) return;
    const updateHeight = () => {
      if (wrapperRef.current) {
        const h = wrapperRef.current.scrollHeight || wrapperRef.current.offsetHeight || 1123;
        if (h > 0) setContentHeight(h);
      }
    };
    updateHeight();
    const ro = new ResizeObserver(() => {
      updateHeight();
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // Pinch touch state
  const pinchRef = useRef({
    startDist: 0,
    startScale: 1,
    isPinching: false,
  });

  // Calculate fit width & fit full page scales
  const updateScales = useCallback(() => {
    if (!rootRef.current) return;
    const cw = rootRef.current.clientWidth || window.innerWidth;
    const ch = window.innerHeight;

    // Fit Width (A4 width 794px)
    const fw = Math.min(1.0, (cw - 12) / 794);
    setFitWidthScale(fw);

    // Fit Full Page (A4 height 1123px).
    // Subtract: floating-bar(~70) + scroll-padding(24) + breathing room = ~94px
    // Cap at fitWidthScale so the document never overflows horizontally.
    // Below 0.28 a whole A4 page is unreadable, so there is no honest full-page
    // fit on a short screen (landscape): fall back to the width fit rather than
    // shrinking the sheet to a stamp — the toggle then hides itself.
    const availH = ch - 52; // subtract phone header (52px) from total viewport height
    const rawFp = (availH - 94) / 1123;
    const fp = rawFp < 0.28 ? fw : Math.min(fw, rawFp);
    setFitPageScale(fp);

    return { fw, fp };
  }, []);

  // Initialize scale — start with full-page fit so the document fills the
  // screen height and there is no large dark void below the A4 sheet.
  useEffect(() => {
    const s = updateScales();
    if (s) {
      // Use full-page fit on first render: this removes the huge dark gap
      // below the document that appeared in width-fit mode on phones.
      setScale(s.fp);
      setFitMode('full');
    }
    window.addEventListener('resize', updateScales);
    return () => window.removeEventListener('resize', updateScales);
  }, [updateScales]);

  // A viewport change (rotation, soft keyboard, URL-bar collapse) moves the fit
  // constants. A document parked in a fit mode has to follow them, or it stays
  // at the old size — landscape leaves an A4 sheet at 45% in a full-width
  // screen — while the zoom pill reports a percentage that no longer matches.
  // A hand-pinched ('custom') zoom is the user's and is left alone.
  useEffect(() => {
    if (fitMode === 'width') setScale(fitWidthScale);
    else if (fitMode === 'full') setScale(fitPageScale);
  }, [fitWidthScale, fitPageScale, fitMode]);

  // Sync body class for edit mode styling
  useEffect(() => {
    if (isEditMode) {
      document.body.classList.add('mpv-edit-active');
    } else {
      document.body.classList.remove('mpv-edit-active');
    }
    return () => {
      document.body.classList.remove('mpv-edit-active');
    };
  }, [isEditMode]);

  // Set scale with wrapper height compensation
  const applyScale = useCallback((nextScale, mode = 'custom') => {
    const clamped = Math.min(2.5, Math.max(0.25, nextScale));
    setScale(clamped);
    setFitMode(mode);
  }, []);

  const toggleFit = useCallback(() => {
    if (fitMode === 'width') {
      applyScale(fitPageScale, 'full');
    } else {
      applyScale(fitWidthScale, 'width');
    }
  }, [fitMode, fitWidthScale, fitPageScale, applyScale]);

  // Toggle edit mode with ergonomic auto-zoom:
  // Zoom in to 85-90% so text and numbers are comfortable for mobile thumbs,
  // then zoom back out to fitWidth overview on Done.
  const toggleEditMode = useCallback(() => {
    if (isEditMode) {
      setIsEditMode(false);
      applyScale(fitWidthScale, 'width');
      onDone?.();
    } else {
      setIsEditMode(true);
      const editScale = Math.min(1.0, Math.max(0.85, fitWidthScale * 1.85));
      applyScale(editScale, 'custom');
    }
  }, [isEditMode, fitWidthScale, applyScale, onDone]);

  // Smoothly zoom in and center onto a tapped field
  const focusOnElement = useCallback((el) => {
    if (!el || !scrollRef.current) return;
    applyScale(1.15, 'custom');
    setTimeout(() => {
      try {
        const rect = el.getBoundingClientRect();
        const container = scrollRef.current;
        if (container) {
          const cRect = container.getBoundingClientRect();
          const target = container.scrollTop + (rect.top - cRect.top) - (cRect.height / 3);
          container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
        }
      } catch (_e) {
        // element scroll calculation fallback
        void _e;
      }
      el.classList.add('q-editable-focused');
      setTimeout(() => el.classList.remove('q-editable-focused'), 2500);
    }, 120);
  }, [applyScale]);

  // Hardware back button integration:
  // If zoomed in/out from default fitWidth, reset to fitWidth first!
  // If in Edit Mode, switch back to view mode!
  // Then goBack() pops the view stack.
  useEffect(() => {
    const isZoomed = Math.abs(scale - fitWidthScale) > 0.06;
    if (isZoomed) {
      return registerBackHandler(() => {
        applyScale(fitWidthScale, 'width');
        return true;
      });
    }
    if (isEditMode) {
      return registerBackHandler(() => {
        setIsEditMode(false);
        applyScale(fitWidthScale, 'width');
        return true;
      });
    }
  }, [scale, fitWidthScale, isEditMode, registerBackHandler, applyScale]);

  // Pinch-to-zoom gesture handling
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchRef.current = {
        startDist: dist,
        startScale: scale,
        isPinching: true,
      };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current.isPinching) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / (pinchRef.current.startDist || 1);
      const nextScale = pinchRef.current.startScale * ratio;
      applyScale(nextScale, 'custom');
    }
  };

  const handleTouchEnd = () => {
    pinchRef.current.isPinching = false;
  };

  // Click on editable field in canvas triggers auto-focus zoom
  const handleCanvasClick = (e) => {
    if (!isEditMode) return;
    const editable = e.target.closest('.q-editable') || e.target.closest('.wc-editable');
    if (editable) {
      focusOnElement(editable);
    }
  };

  // Adjust scrollable spacer height so the document can be scrolled all the way
  const naturalWidth = 794;
  const naturalHeight = contentHeight || 1123;
  const scaledWidth = Math.round(naturalWidth * scale);
  const scaledHeight = Math.round(naturalHeight * scale);

  const zoomPercent = Math.round((scale / (fitWidthScale || 1)) * 100);

  return (
    <MobileViewportContext.Provider value={{ isEditMode, setIsEditMode, focusOnElement, applyScale, scale, fitWidthScale, fitPageScale }}>
      <div className="mpv-root" ref={rootRef}>
        <div
          className="mpv-scroll-container"
          ref={scrollRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleCanvasClick}
        >
          <div
            className="mpv-stage"
            style={{
              width: `${scaledWidth}px`,
              height: `${scaledHeight}px`,
              minWidth: `${scaledWidth}px`,
              minHeight: `${scaledHeight}px`,
              margin: '0 auto',
              position: 'relative',
              overflow: 'visible',
              flexShrink: 0,
            }}
          >
            <div
              className="mpv-canvas-wrapper"
              ref={wrapperRef}
              style={{
                width: '794px',
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            >
              {children}
            </div>
          </div>
        </div>

        {/* ── Floating Mobile Action Bar ── */}
        <div className="mpv-floating-bar" onClick={(e) => e.stopPropagation()}>
          {/* Mode Switcher */}
          <button
            type="button"
            className={`mpv-btn ${isEditMode ? 'mpv-btn-primary' : 'mpv-btn-secondary'}`}
            onClick={toggleEditMode}
          >
            {isEditMode ? (
              <>
                <Check size={15} /> <span>Done</span>
              </>
            ) : (
              <>
                <Edit3 size={15} /> <span>Edit Page</span>
              </>
            )}
          </button>

          {/* Add Item (in edit mode) */}
          {isEditMode && onAddItem && (
            <button
              type="button"
              className="mpv-btn mpv-btn-success"
              onClick={onAddItem}
            >
              <Plus size={15} /> <span>Add Item</span>
            </button>
          )}

          {/* Toggle between Fit Width and Full Page Height.
              On a portrait phone the screen is narrower relative to A4 than it
              is short, so fitting the width already fits the whole page and
              fitPageScale is capped to the same number — the button would flip
              its own label and change nothing. Only offer it where the two
              fits actually differ (landscape, tablets). */}
          {Math.abs(fitPageScale - fitWidthScale) > 0.01 && (
          <button
            type="button"
            className="mpv-btn mpv-btn-secondary"
            onClick={toggleFit}
            title={fitMode === 'width' ? 'Fit Full Page Height' : 'Fit Page Width'}
          >
            {fitMode === 'width' ? (
              <>
                <Minimize2 size={14} /> <span>Full Page</span>
              </>
            ) : (
              <>
                <Maximize2 size={14} /> <span>Fit Width</span>
              </>
            )}
          </button>
          )}

          {/* Zoom Level Indicator */}
          <div className="mpv-zoom-pill">
            <button
              type="button"
              className="mpv-zoom-btn"
              onClick={() => applyScale(scale * 0.85, 'custom')}
              title="Zoom out"
            >
              <ZoomOut size={13} />
            </button>
            <span className="mpv-zoom-label">{zoomPercent}%</span>
            <button
              type="button"
              className="mpv-zoom-btn"
              onClick={() => applyScale(scale * 1.25, 'custom')}
              title="Zoom in"
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>
    </MobileViewportContext.Provider>
  );
}
