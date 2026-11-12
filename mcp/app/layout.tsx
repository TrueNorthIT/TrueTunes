import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'TrueTunes MCP',
  description: 'Control the TrueNorth office Sonos from chat.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          font: '16px/1.6 system-ui, -apple-system, Segoe UI, sans-serif',
          maxWidth: '40rem',
          margin: '10vh auto',
          padding: '0 16px',
        }}
      >
        {children}
      </body>
    </html>
  );
}
