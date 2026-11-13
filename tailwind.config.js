// Theme. Colour roles live in src/styles/m3-tokens.json (hand-set Jamun and Mango palette);
// class names keep Material 3 role names (bg-primary, text-on-surface-variant, ...).
import tokens from './src/styles/m3-tokens.json' with { type: 'json' };

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ...tokens.light },
      // Figtree for reading, Baloo 2 (Ek Type, an Indian foundry) for headings and numbers people glance at.
      fontFamily: {
        sans: ['"Figtree Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Baloo 2 Variable"', '"Figtree Variable"', 'system-ui', 'sans-serif'],
      },
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
      // Shape hierarchy: big friendly cards, softer controls, pill buttons.
      borderRadius: { xs: '8px', card: '24px', ctl: '16px', xl2: '32px' },
      boxShadow: {
        // M3 elevation levels 1-3
        // Plum-tinted, used only for things that float (menus, sheets, the log button).
        e1: '0 1px 2px rgba(46,23,69,.10)',
        e2: '0 8px 24px -6px rgba(46,23,69,.22)',
        e3: '0 16px 40px -8px rgba(46,23,69,.30)',
      },
      maxWidth: { prose: '68ch' },
    },
  },
  plugins: [],
};
