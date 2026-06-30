'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DevicePreset } from '@/lib/types';

type Mode = 'iframe' | 'placeholder' | 'appetize';

interface Props {
  device: DevicePreset;
  landscape: boolean;
  mode: Mode;
  runUrl: string | null;
  appetizeKey: string | null;
  iframeRef: RefObject<HTMLIFrameElement>;
  placeholderTitle?: string;
  placeholderBody?: string;
  onScale?: (pct: number) => void;
  onIframeLoad?: () => void;
}

export default function DeviceFrame({
  device,
  landscape,
  mode,
  runUrl,
  appetizeKey,
  iframeRef,
  placeholderTitle,
  placeholderBody,
  onScale,
  onIframeLoad,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const sw = landscape ? device.height : device.width;
  const sh = landscape ? device.width : device.height;
  const bezel = device.bezel;
  const radius = device.radius;
  const outerW = sw + bezel * 2;
  const outerH = sh + bezel * 2;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const pad = 48;
      const aw = el.clientWidth - pad;
      const ah = el.clientHeight - pad;
      const s = Math.min(aw / outerW, ah / outerH, 1.4);
      const clamped = Math.max(0.15, s);
      setScale(clamped);
      onScale?.(Math.round(clamped * 100));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [outerW, outerH, onScale]);

  const showHomeBar = device.notch === 'island' || device.notch === 'punch' || device.notch === 'none';

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <div className="frame-scaler" style={{ transform: `scale(${scale})` }}>
        <div
          className="device"
          style={{
            width: outerW,
            height: outerH,
            padding: bezel,
            borderRadius: radius + 8,
          }}
        >
          <div className="screen" style={{ width: sw, height: sh, borderRadius: radius }}>
            {mode !== 'placeholder' && !landscape && (
              <div className="status-bar">
                <span>9:41</span>
                <span className="glyphs">
                  <span>▂▄▆</span>
                  <span>􀙇</span>
                  <span>􀛨</span>
                </span>
              </div>
            )}
            {device.notch === 'island' && !landscape && <div className="notch-island" />}
            {device.notch === 'punch' && !landscape && <div className="notch-punch" />}
            {device.notch === 'seam' && <div className="notch-seam" />}

            {mode === 'iframe' && runUrl && (
              <iframe
                ref={iframeRef}
                src={runUrl}
                title="device-content"
                sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin allow-pointer-lock"
                allow="camera; microphone; geolocation; accelerometer; gyroscope"
                onLoad={onIframeLoad}
              />
            )}

            {mode === 'appetize' && appetizeKey && (
              <iframe
                ref={iframeRef}
                src={`https://appetize.io/embed/${appetizeKey}?device=${device.appetizeDevice || 'pixel8'}&autoplay=true&deviceColor=black&scale=auto`}
                title="appetize-device"
                allow="camera; microphone; geolocation"
                style={{ width: '100%', height: '100%', border: 0 }}
              />
            )}

            {mode === 'placeholder' && (
              <div className="placeholder">
                <div className="card">
                  <div className="glyph">⛬</div>
                  <h3>{placeholderTitle || 'Native binary'}</h3>
                  <p>{placeholderBody || 'A browser cannot execute native code. Inspect metadata on the right, or run it on a device emulator / Appetize cloud.'}</p>
                </div>
              </div>
            )}

            {showHomeBar && mode !== 'placeholder' && !landscape && <div className="home-indicator" />}
          </div>
          {device.notch === 'home' && !landscape && <div className="home-button" />}
        </div>
      </div>
    </div>
  );
}
