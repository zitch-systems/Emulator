'use client';

import type { ReportSections, Shot } from '@/lib/types';

interface Props {
  sections: ReportSections;
  setSection: (key: keyof ReportSections, value: boolean) => void;
  shots: Shot[];
  removeShot: (id: string) => void;
  preview: string | null;
  onPreview: () => void;
  onDownloadMd: () => void;
  onDownloadZip: () => void;
}

const LABELS: { key: keyof ReportSections; label: string }[] = [
  { key: 'metadata', label: 'App metadata' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'contents', label: 'Package contents' },
  { key: 'errors', label: 'Errors & warnings' },
  { key: 'fullConsole', label: 'Full console log' },
  { key: 'network', label: 'Network log' },
  { key: 'screenshots', label: 'Screenshots' },
];

export default function ReportPane({
  sections,
  setSection,
  shots,
  removeShot,
  preview,
  onPreview,
  onDownloadMd,
  onDownloadZip,
}: Props) {
  return (
    <div>
      <div className="section-h">Sections to include</div>
      <div className="check-grid">
        {LABELS.map(({ key, label }) => (
          <label key={key} className="check">
            <input type="checkbox" checked={sections[key]} onChange={(e) => setSection(key, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div className="section-h">Screenshots</div>
      {shots.length === 0 ? (
        <div className="empty">No screenshots yet — hit ◉ in the device toolbar.</div>
      ) : (
        <div className="shot-strip">
          {shots.map((s) => (
            <div key={s.id} className="shot" title={s.label}>
              <img src={s.dataUrl} alt={s.label} />
              <button className="rm" onClick={() => removeShot(s.id)} aria-label="remove">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="btn-row">
        <button className="btn" onClick={onPreview}>
          Preview
        </button>
        <button className="btn btn-primary" onClick={onDownloadMd}>
          ↓ report.md
        </button>
        <button className="btn" onClick={onDownloadZip}>
          ↓ .zip (md + shots)
        </button>
      </div>

      {preview !== null && (
        <>
          <div className="section-h">Preview</div>
          <pre className="preview-pre">{preview}</pre>
        </>
      )}
    </div>
  );
}
