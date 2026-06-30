'use client';

import type { NetEntry } from '@/lib/types';

interface Props {
  net: NetEntry[];
  onClear: () => void;
}

export default function NetworkPane({ net, onClear }: Props) {
  return (
    <div>
      <div className="filter-row">
        <span style={{ flex: 1 }} className="hint">
          {net.length} request{net.length === 1 ? '' : 's'}
        </span>
        <button className="btn" onClick={onClear}>
          Clear
        </button>
      </div>
      {net.length === 0 ? (
        <div className="empty">No network activity captured yet.</div>
      ) : (
        <div className="net-list">
          {net.map((n, i) => (
            <div key={i} className="net-row" title={n.url}>
              <span className="method">{n.method}</span>
              <span className={`status ${n.ok ? 'ok' : 'err'}`}>{n.status || (n.error ? 'ERR' : '—')}</span>
              <span className="url">{n.url}</span>
              <span className="ms">{n.ms}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
