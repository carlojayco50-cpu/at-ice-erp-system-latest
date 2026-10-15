import { defineConfig } from 'vite'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// This computer's address on the Wi-Fi/LAN (e.g. 192.168.1.20), so a phone on
// the same network can open the dev server. Used for the Application QR code
// in HRIS > Interviews while testing locally (src/lib/positions.js).
// Virtual adapters (WSL, Hyper-V, VirtualBox, VPNs) are skipped.
function lanAddress() {
  const isPrivate = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  const virtual = /vethernet|virtualbox|vmware|wsl|hyper-v|docker|tailscale|zerotier|vpn|loopback/i
  const found = Object.entries(os.networkInterfaces())
    .filter(([name]) => !virtual.test(name))
    .flatMap(([, list]) => list || [])
    .filter((a) => a.family === 'IPv4' && !a.internal && isPrivate(a.address))
    .map((a) => a.address)
  return found.find((ip) => ip.startsWith('192.168.')) || found[0] || ''
}

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src'),
    },
  },
  // Only the dev server gets the LAN address; a production build uses the
  // site's own address.
  define: command === 'serve' ? { 'import.meta.env.VITE_LAN_HOST': JSON.stringify(lanAddress()) } : {},
  server: {
    // Listen on the LAN too, not only localhost, so phones can open /apply.
    host: true,
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
}))
