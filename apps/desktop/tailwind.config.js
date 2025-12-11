/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        background: '#000000',
        foreground: '#ffffff',
        muted: '#71717a',
        border: '#27272a',
        accent: '#18181b',
      },
    },
  },
  plugins: [],
};
