import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Cedar Winds Timeclock',
    short_name: 'Cedar Winds',
    description: 'Your Cedar Winds workday, simplified.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f7f2',
    theme_color: '#315748',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
