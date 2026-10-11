/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        farm: {
          50: '#f5fbf6',
          100: '#e8f6eb',
          500: '#2d7d46',
          600: '#225f36',
          900: '#123320',
        },
      },
    },
  },
  plugins: [],
};
