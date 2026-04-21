import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0A0A0B',
          2: '#111113',
          3: '#18181B',
          4: '#232327',
        },
        smoke: {
          DEFAULT: '#F5F4F0',
          dim: '#B8B7B0',
          faint: '#6B6A65',
        },
        ember: {
          DEFAULT: '#E8452A',
          dim: '#7A2518',
          bright: '#FF5A3D',
        },
        gold: {
          DEFAULT: '#C9A96E',
          dim: '#6B5330',
        },
        cyber: {
          DEFAULT: '#00D4FF',
          dim: '#003D4D',
          glow: 'rgba(0,212,255,0.15)',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Neue Haas Grotesk Display Pro', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem', letterSpacing: '0.12em' }],
      },
      animation: {
        'fade-up': 'fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) forwards',
        'fade-in': 'fadeIn 0.6s ease forwards',
        'scan': 'scan 3s linear infinite',
        'pulse-ember': 'pulseEmber 3s ease-in-out infinite',
        'pulse-cyber': 'pulseCyber 3s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'holo-sweep': 'holoSweep 4s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        pulseEmber: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.7' },
        },
        pulseCyber: {
          '0%, 100%': { opacity: '0.2', boxShadow: '0 0 8px rgba(0,212,255,0.1)' },
          '50%': { opacity: '0.8', boxShadow: '0 0 24px rgba(0,212,255,0.3)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(0,212,255,0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(0,212,255,0.5), 0 0 40px rgba(0,212,255,0.15)' },
        },
        holoSweep: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
