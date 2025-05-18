// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        // Dark mode theme colors
        background: '#121826',
        surface: '#1A2235',
        panel: '#232F46',
        border: '#2C3C55',
        text: {
          primary: '#E4E8F1',
          secondary: '#94A3B8',
          muted: '#64748B',
        },
        accent: '#3B82F6',
        success: '#10B981',
        danger: '#EF4444',
        warning: '#F59E0B',
        buy: '#22C55E',
        sell: '#EF4444',
        chart: {
          grid: '#2C3C55',
          up: '#22C55E',
          down: '#EF4444',
          volume: '#3B82F6',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}