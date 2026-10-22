/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'JetBrains Mono', 'ui-monospace', 'monospace'],
        body: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        barcamp: {
          bg0: 'var(--color-bg-0)',
          bg1: 'var(--color-bg-1)',
          bg2: 'var(--color-bg-2)',
          ink0: 'var(--color-ink-0)',
          ink1: 'var(--color-ink-1)',
          ink2: 'var(--color-ink-2)',
          ink3: 'var(--color-ink-3)',
          red0: 'var(--color-red-0)',
          red1: 'var(--color-red-1)',
          red2: 'var(--color-red-2)',
          red3: 'var(--color-red-3)',
          gold: 'var(--tier-geek-gold)',
          silver: 'var(--tier-geek-silver)',
          black: '#0a0707',
          dark: '#110c0c',
          card: '#1a1212',
          red: '#ED2917',
          crimson: '#D61211',
          burgundy: '#BA1513',
          wine: '#B60604',
        },
      },
      borderRadius: {
        '2xl': 'var(--radius-2xl, 44px)',
        xl: 'var(--radius-xl, 32px)',
        lg: 'var(--radius-lg, 24px)',
        md: 'var(--radius-md, 16px)',
        sm: 'var(--radius-sm, 10px)',
      },
    },
  },
  plugins: [],
};
