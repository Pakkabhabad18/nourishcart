/** Design tokens from PRD 11.1. Named by role, not by hue, so components read as intent. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F9F7',
        surface: '#FFFFFF',
        forest: { DEFAULT: '#174F43', 700: '#123F35', 50: '#EEF5F2' },
        mint: '#E8F4EF',
        teal: { DEFAULT: '#2D7A69', 300: '#8FBFB3' },
        ink: '#17212B',
        muted: '#65736E',
        line: '#DCE5E1',
        warn: { DEFAULT: '#B7791F', bg: '#FBF3E4' },
        danger: { DEFAULT: '#B54747', bg: '#FBECEC' },
      },
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      // Type scale (≈1.2 ratio) for a calm data-dense product.
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.15rem' }],
        sm: ['0.875rem', { lineHeight: '1.3rem' }],
        base: ['0.9375rem', { lineHeight: '1.45rem' }],
        lg: ['1.0625rem', { lineHeight: '1.55rem' }],
        xl: ['1.25rem', { lineHeight: '1.7rem' }],
        '2xl': ['1.625rem', { lineHeight: '2.05rem', letterSpacing: '-0.015em' }],
        '3xl': ['2.125rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em' }],
        '4xl': ['2.75rem', { lineHeight: '3.1rem', letterSpacing: '-0.025em' }],
      },
      borderRadius: { card: '14px', ctl: '10px' },
      maxWidth: { prose: '68ch' },
    },
  },
  plugins: [],
};
