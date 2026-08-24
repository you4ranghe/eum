import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#ffffff',
        'surface-muted': '#f7f8fa',
        border: '#e5e7eb',
        brand: { DEFAULT: '#2563eb', soft: '#dbeafe' },
      },
    },
  },
  plugins: [],
} satisfies Config;
