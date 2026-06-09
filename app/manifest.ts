import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CampusOS',
    short_name: 'CampusOS',
    description: 'Campus help from verified students',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      { src: '/icons/icon-192.webp', sizes: '192x192', type: 'image/webp', purpose: 'any' },
      { src: '/icons/icon-192.webp', sizes: '192x192', type: 'image/webp', purpose: 'maskable' },
      { src: '/icons/icon-512.webp', sizes: '512x512', type: 'image/webp', purpose: 'any' },
      { src: '/icons/icon-512.webp', sizes: '512x512', type: 'image/webp', purpose: 'maskable' },
    ],
  }
}
