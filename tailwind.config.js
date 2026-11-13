// Material Design 3 theme. Colour roles are generated from one seed colour by Google's
// material-color-utilities (npm run theme -> src/styles/m3-tokens.json). Class names use
// M3 role names (bg-primary, text-on-surface-variant, bg-secondary-container, ...).
import tokens from './src/styles/m3-tokens.json' with { type: 'json' };

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ...tokens.light },
      fontFamily: { sans: ['"Roboto Flex Variable"', 'Roboto', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      // M3 type scale (label / body / title / headline / display), rem at 16 px.
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.03em' }], // label-small/body-small
        sm: ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.016em' }], // body-medium
        base: ['1rem', { lineHeight: '1.5rem', letterSpacing: '0.009em' }], // body-large
        lg: ['1.125rem', { lineHeight: '1.5rem' }], // title-medium (slightly larger for mobile)
        xl: ['1.375rem', { lineHeight: '1.75rem' }], // title-large
        '2xl': ['1.75rem', { lineHeight: '2.25rem' }], // headline-medium
        '3xl': ['2rem', { lineHeight: '2.5rem' }], // headline-large
        '4xl': ['2.8125rem', { lineHeight: '3.25rem' }], // display-small
      },
      // M3 shape scale: extra-small 4, small 8, medium 12, large 16, extra-large 28.
      borderRadius: { xs: '4px', card: '16px', ctl: '12px', xl2: '28px' },
      boxShadow: {
        // M3 elevation levels 1-3
        e1: '0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.15)',
        e2: '0 1px 2px rgba(0,0,0,.30), 0 2px 6px 2px rgba(0,0,0,.15)',
        e3: '0 4px 8px 3px rgba(0,0,0,.15), 0 1px 3px rgba(0,0,0,.30)',
      },
      maxWidth: { prose: '68ch' },
    },
  },
  plugins: [],
};
