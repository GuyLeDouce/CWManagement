import type { Metadata, Viewport } from 'next';
import { Pwa } from '@/components/pwa';
import './globals.css';
export const metadata: Metadata = {
  title: 'Cedar Winds Timeclock',
  description: 'Employee time, projects, and approvals for Cedar Winds Design~Build.',
  applicationName: 'Cedar Winds Timeclock',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Cedar Winds' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#315748' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Pwa />
        {children}
      </body>
    </html>
  );
}
