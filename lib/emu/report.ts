// Markdown report builder. Port of emu/report.js, extended with native-log
// sections. Pure + isomorphic (runs in browser and on the server).

import type { AppInfo, LogEntry, NetEntry, ReportInput } from '@/lib/types';

function fmtBytes(n?: number): string {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isoDate(ts: number): string {
  return new Date(ts).toISOString();
}

function metadataTable(app: AppInfo): string {
  const rows: [string, string | undefined][] =
    app.platform === 'ios'
      ? [
          ['Name', app.name],
          ['Bundle ID', app.packageId],
          ['Version', app.version],
          ['Build', app.build],
          ['Min iOS', app.minOS],
          ['Device family', app.deviceFamily?.join(', ')],
          ['Frameworks', app.frameworks.join(', ')],
          ['Size', fmtBytes(app.sizeBytes)],
          ['Runnable in-browser', app.runnable ? 'yes (hybrid web)' : 'no (native)'],
        ]
      : [
          ['Name', app.name],
          ['Package', app.packageId],
          ['Version', app.version],
          ['Version code', app.build],
          ['Min SDK', app.minSdk],
          ['Target SDK', app.targetSdk],
          ['ABIs', app.abis?.join(', ')],
          ['Frameworks', app.frameworks.join(', ')],
          ['Size', fmtBytes(app.sizeBytes)],
          ['Runnable in-browser', app.runnable ? 'yes (hybrid web)' : 'no (native)'],
        ];
  const body = rows
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `| ${k} | ${escapePipes(String(v))} |`)
    .join('\n');
  return `| Field | Value |\n| --- | --- |\n${body}`;
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function logLine(l: LogEntry): string {
  const t = new Date(l.ts).toLocaleTimeString('en-US', { hour12: false });
  return `- \`${t}\` **[${l.level}]** ${l.message.replace(/\n/g, ' ')}`;
}

export function buildReport(input: ReportInput): string {
  const { app, source, device, logs, net, shots, sections } = input;
  const errors = logs.filter((l) => l.level === 'error');
  const warnings = logs.filter((l) => l.level === 'warn');
  const out: string[] = [];

  out.push(`# EMulator Studio — Test Report`);
  out.push('');
  out.push(`> Generated ${isoDate(input.generatedAt)} · device **${device.name}** (${device.width}×${device.height}@${device.dpr})`);
  out.push('');
  out.push(
    `**Source:** \`${source.kind}\`${source.ref ? ` — ${source.ref}` : ''}  `,
  );
  out.push(
    `**Result:** ${errors.length} error(s), ${warnings.length} warning(s), ${logs.length} log line(s), ${net.length} network call(s).`,
  );
  out.push('');

  if (sections.metadata && app) {
    out.push('## App metadata');
    out.push('');
    out.push(metadataTable(app));
    out.push('');
    if (app.notes.length) {
      out.push('**Notes**');
      out.push('');
      for (const n of app.notes) out.push(`- ${n}`);
      out.push('');
    }
  }

  if (sections.permissions && app?.permissions?.length) {
    out.push('## Permissions');
    out.push('');
    for (const p of app.permissions) out.push(`- \`${p}\``);
    out.push('');
  }

  if (sections.contents && app?.dirSizes?.length) {
    out.push('## Package contents');
    out.push('');
    out.push(`Total files: **${app.fileCount ?? '—'}**`);
    out.push('');
    out.push('| Directory | Size |');
    out.push('| --- | --- |');
    for (const d of app.dirSizes) out.push(`| \`${d.name}\` | ${fmtBytes(d.bytes)} |`);
    out.push('');
  }

  if (sections.errors) {
    out.push('## Errors & warnings');
    out.push('');
    if (errors.length === 0 && warnings.length === 0) {
      out.push('_No errors or warnings captured._');
    } else {
      for (const l of [...errors, ...warnings]) {
        out.push(logLine(l));
        if (l.stack) {
          out.push('');
          out.push('  ```');
          out.push(l.stack.split('\n').map((s) => '  ' + s).join('\n'));
          out.push('  ```');
        }
      }
    }
    out.push('');
  }

  if (sections.fullConsole && logs.length) {
    out.push('## Full console log');
    out.push('');
    out.push('```log');
    for (const l of logs) {
      const t = new Date(l.ts).toLocaleTimeString('en-US', { hour12: false });
      out.push(`${t} [${l.level}] ${l.message}`);
    }
    out.push('```');
    out.push('');
  }

  if (sections.network && net.length) {
    out.push('## Network log');
    out.push('');
    out.push('| Method | Status | URL | ms |');
    out.push('| --- | --- | --- | --- |');
    for (const n of net) {
      out.push(`| ${n.method} | ${n.status || (n.error ? 'ERR' : '—')} | ${escapePipes(n.url)} | ${n.ms} |`);
    }
    out.push('');
  }

  if (sections.screenshots && shots.length) {
    out.push('## Screenshots');
    out.push('');
    for (const s of shots) {
      // Relative path used when bundled in the .zip export.
      out.push(`### ${s.label}`);
      out.push('');
      out.push(`![${s.label}](screenshots/${s.id}.png)`);
      out.push('');
    }
  }

  out.push('---');
  out.push('');
  out.push('_Report produced by EMulator Studio — universal Android / iOS / PWA test lab._');
  out.push('');
  return out.join('\n');
}

/** Convenience used by the server probe + native runners to fold device logs in. */
export function netSummary(net: NetEntry[]): { failed: number; total: number } {
  return { failed: net.filter((n) => !n.ok).length, total: net.length };
}
