'use client';

import type { LogEntry, LogLevel } from '@/lib/types';
import { clockTime } from '@/lib/format';

interface Props {
  logs: LogEntry[];
  filters: Record<LogLevel, boolean>;
  toggleFilter: (lv: LogLevel) => void;
  onClear: () => void;
  onProbe: () => void;
  probing: boolean;
  canProbe: boolean;
}

const LEVELS: LogLevel[] = ['log', 'info', 'warn', 'error'];

export default function ConsolePane({ logs, filters, toggleFilter, onClear, onProbe, probing, canProbe }: Props) {
  const errors = logs.filter((l) => l.level === 'error').length;
  const warnings = logs.filter((l) => l.level === 'warn').length;
  const hideClasses = LEVELS.filter((lv) => !filters[lv]).map((lv) => `hide-${lv}`).join(' ');

  return (
    <div>
      <div className="filter-row">
        {LEVELS.map((lv) => (
          <button
            key={lv}
            className={`fchip ${filters[lv] ? '' : 'off'}`}
            onClick={() => toggleFilter(lv)}
          >
            {lv}
          </button>
        ))}
        <span className="spacer" style={{ flex: 1 }} />
        {canProbe && (
          <button className="btn" onClick={onProbe} disabled={probing}>
            {probing ? 'Probing…' : '⟲ Headless probe'}
          </button>
        )}
        <button className="btn" onClick={onClear}>
          Clear
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="empty">
          No console output yet. Same-origin builds &amp; the demo are captured live; for a
          cross-origin URL use <strong>Headless probe</strong> to capture errors server-side.
        </div>
      ) : (
        <div className={`log-list ${hideClasses}`}>
          {logs.map((l, i) => (
            <div key={i} className={`log-row ${l.level}`}>
              <span className="lv">{clockTime(l.ts)} [{l.level}]</span>
              <span>{l.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="console-footer">
        <span>● {errors} errors</span>
        <span>● {warnings} warnings</span>
        <span>Σ {logs.length} logs</span>
      </div>
    </div>
  );
}
