/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './views/**/*.ejs',
    './public/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        brand:   { DEFAULT: '#0D9488', 700: '#0F766E' },
        navy:    { DEFAULT: '#0A2342', 700: '#0B1E3D' },
        danger:  { DEFAULT: '#EF4444' },
        success: { DEFAULT: '#22C55E' },
        warning: { DEFAULT: '#F97316' },
        body:    { DEFAULT: '#475569' },
      },
      fontFamily: {
        sora: ['Sora', 'sans-serif'],
        dm:   ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: { card: '12px', cardLg: '16px', pill: '20px' },
      boxShadow:    { soft: '0 1px 4px rgba(0,0,0,0.08)' },
    },
  },
  plugins: [],
};
