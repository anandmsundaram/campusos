import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.campusos.app',
  appName: 'CampusOS',
  // webDir is required by Capacitor but is bypassed by server.url at runtime.
  // Pointing to public/ (always committed, always present) avoids needing a build artifact.
  // If static export ever becomes viable: remove server.url, set webDir: 'out', run next build.
  webDir: 'public',
  server: {
    // Load the live Vercel deployment in the native WebView.
    // This means auth, API routes, and server components all work unchanged.
    url: 'https://campusos-three.vercel.app',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
