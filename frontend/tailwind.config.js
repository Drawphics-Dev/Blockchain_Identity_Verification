/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        // Serif display for institutional gravitas
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        // Oxford navy — the institutional brand
        navy: {
          50: '#eef3f8',
          100: '#dae6f1',
          200: '#b6cbe0',
          300: '#89a8c9',
          400: '#5680ac',
          500: '#345f8c',
          600: '#234a72',
          700: '#183a5c',
          800: '#122d48',
          900: '#0c2038',
          950: '#071528',
        },
        // Restrained academic gold — the single accent
        gold: {
          50: '#fbf7ec',
          100: '#f5eccf',
          200: '#ead79f',
          300: '#dcbf68',
          400: '#cfab45',
          500: '#b8912e',
          600: '#9c7826',
          700: '#7c5e21',
          800: '#674e21',
          900: '#584220',
        },
        // Warm paper canvas
        canvas: '#f7f5f0',
        parchment: '#fbfaf6',
      },
      boxShadow: {
        card: '0 1px 2px rgba(12, 32, 56, 0.04), 0 1px 3px rgba(12, 32, 56, 0.05)',
        elevated: '0 16px 48px -18px rgba(12, 32, 56, 0.22)',
        gold: '0 0 0 1px rgba(184, 145, 46, 0.35)',
      },
      borderRadius: {
        lg: '0.625rem',
        xl: '0.75rem',
        '2xl': '1rem',
      },
      letterSpacing: {
        institutional: '0.18em',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.6s ease both',
      },
    },
  },
  plugins: [],
}
