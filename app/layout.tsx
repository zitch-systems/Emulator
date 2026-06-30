import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'EMulator Studio — device test lab',
  description:
    'Universal Android / iOS / PWA test lab. Test any .apk, iOS build or PWA in real device frames, capture console & network errors, screenshot, export a Markdown report, and push it to your repo.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

// Apply the persisted theme before first paint to avoid a flash.
const themeInit = `(function(){try{var t=localStorage.getItem('emu.theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
