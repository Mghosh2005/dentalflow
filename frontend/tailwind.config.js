/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0B1522',
          900: '#132038',
          800: '#1C2E4A',
          700: '#2A3F5F',
        },
        teal: {
          600: '#2A6E68',
          500: '#3D8B84',
          100: '#E7F2F0',
        },
        clay: {
          600: '#B8483D',
          100: '#F7EAE8',
        },
        slate: {
          50: '#F7F8FA',
          100: '#EEF0F3',
          200: '#E2E5EA',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
