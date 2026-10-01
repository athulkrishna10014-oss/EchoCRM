/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core design system tokens: Warm Ivory + Terracotta
        ivory: {
          50: '#FAF8F4',
          100: '#F7F4EE', // Main background
          200: '#EFEAE0',
          300: '#E8E1D8', // Borders
          400: '#D8CEBF',
          500: '#B5A895',
        },
        surface: {
          DEFAULT: '#FFFDF9', // Cards / surfaces
          warm: '#FBF8F2',
          muted: '#F5F0E6',
        },
        ink: {
          primary: '#292522',   // Primary text
          secondary: '#817A72', // Secondary text
          muted: '#A8A199',
          faint: '#CFC8BE',
        },
        terracotta: {
          50: '#FAF3EF',
          100: '#F0D8CA', // Accent light
          200: '#E5BEAA',
          300: '#D69D83',
          400: '#C77C5C',
          500: '#B85C38', // Primary accent
          600: '#A14F2E',
          700: '#874024',
          800: '#6E321B',
          900: '#552513',
        },
        // Alias brand to terracotta so all existing brand-500/600 references look terracotta
        brand: {
          50: '#FAF3EF',
          100: '#F0D8CA',
          200: '#E5BEAA',
          300: '#D69D83',
          400: '#C77C5C',
          500: '#B85C38',
          600: '#A14F2E',
          700: '#874024',
          800: '#6E321B',
          900: '#552513',
          950: '#3D1B0D',
        },
        gold: {
          50: '#FDFBF7',
          100: '#FBF3E6',
          200: '#F5E4C7',
          300: '#E2CA9E',
          500: '#C59A5F', // Secondary accent
          600: '#AB8249',
          700: '#8C6831',
        },
        sage: {
          50: '#F5F8F6',
          100: '#EBF1EC',
          200: '#D6E2D8',
          300: '#A6C1AB',
          500: '#64866A', // Success
          600: '#527057',
          700: '#3D5C43',
        },
        amber: {
          50: '#FEFAF3',
          100: '#FBF3E6',
          500: '#C28A3D', // Warning
          600: '#A8742F',
          700: '#8C5E20',
        },
        crimson: {
          50: '#FCF5F5',
          100: '#F9ECEC',
          500: '#B94A48', // Danger
          600: '#A33B39',
          700: '#8D2F2E',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Manrope', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
