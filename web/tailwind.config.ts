import type { Config } from 'tailwindcss';

const config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        lg: '2rem',
      },
      screens: {
        '2xl': '1600px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        panel: {
          DEFAULT: '#121620',
          2: '#0e1118',
        },
        // Палитра из дизайн-системы — фиксированные hex для точного совпадения
        accent: {
          DEFAULT: '#6673ff',
          foreground: '#ffffff',
        },
        // Светлее акцента: только для текста на accent/10–accent/20 (AA).
        'accent-soft': '#9aa3ff',
        success: {
          DEFAULT: '#3dd68c',
          foreground: '#04120b',
        },
        warning: {
          DEFAULT: '#ffb020',
          foreground: '#201500',
        },
        danger: {
          DEFAULT: '#ff5f6d',
          foreground: '#ffffff',
        },
        info: {
          DEFAULT: '#54b8ff',
          foreground: '#04121f',
        },
        premium: {
          DEFAULT: '#b388ff',
          foreground: '#140b24',
        },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      letterSpacing: {
        'ultra-wide': '0.24em',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      backgroundImage: {
        'panel-gradient': 'linear-gradient(180deg, rgba(21, 26, 38, 0.94), rgba(16, 20, 29, 0.94))',
        'sidebar-gradient':
          'linear-gradient(180deg, rgba(17, 21, 30, 0.96), rgba(12, 15, 22, 0.98))',
        'modal-gradient': 'linear-gradient(180deg, rgba(22, 27, 39, 0.97), rgba(16, 20, 29, 0.98))',
        'accent-gradient': 'linear-gradient(180deg, #6d78ff 0%, #5865f2 100%)',
        'text-gradient':
          'linear-gradient(100deg, #ffffff 8%, #dfe3ff 40%, #b9c1ff 70%, #8ee8ff 100%)',
        grid: [
          'linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px)',
          'linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)',
        ].join(', '),
      },
      backgroundSize: {
        'grid-56': '56px 56px',
        shimmer: '200% 100%',
      },
      boxShadow: {
        'glow-card': '0 0 40px rgba(102, 115, 255, 0.15)',
        'glow-accent': '0 0 34px rgba(102, 115, 255, 0.32)',
        'glow-success': '0 0 30px rgba(61, 214, 140, 0.2)',
        button: '0 8px 22px rgba(88, 101, 242, 0.22)',
        modal: '0 30px 100px -20px rgba(0, 0, 0, 0.85)',
        sidebar: '12px 0 50px -30px rgba(0, 0, 0, 0.8)',
        'inner-top': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'overlay-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'overlay-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'modal-in': {
          from: {
            opacity: '0',
            transform: 'translateY(-16px) scale(0.95)',
            filter: 'blur(8px)',
          },
          to: { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
        },
        'modal-out': {
          from: { opacity: '1', transform: 'translateY(0) scale(1)', filter: 'blur(0)' },
          to: {
            opacity: '0',
            transform: 'translateY(-10px) scale(0.97)',
            filter: 'blur(4px)',
          },
        },
        'drawer-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'drawer-out': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-100%)' },
        },
        'tab-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'grid-drift': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '56px 56px' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.2s linear infinite',
        'overlay-in': 'overlay-in 0.2s ease-out',
        'overlay-out': 'overlay-out 0.2s ease-in',
        'modal-in': 'modal-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'modal-out': 'modal-out 0.18s cubic-bezier(0.4, 0, 1, 1)',
        'drawer-in': 'drawer-in 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        'drawer-out': 'drawer-out 0.22s cubic-bezier(0.4, 0, 1, 1)',
        'tab-in': 'tab-in 0.26s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        float: 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 3.4s ease-in-out infinite',
        'grid-drift': 'grid-drift 50s linear infinite',
        'spin-slow': 'spin 16s linear infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

export default config;
