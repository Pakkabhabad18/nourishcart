// Generates Material Design 3 colour roles from one seed colour using Google's
// material-color-utilities (the engine behind Material Theme Builder).
// Run: npm run theme   (writes src/styles/m3-tokens.json)
import { argbFromHex, hexFromArgb, Hct, SchemeFidelity, MaterialDynamicColors, Blend } from '@material/material-color-utilities';
import { writeFileSync } from 'node:fs';

// Seed: a clear "trust" blue, chosen to read as a calm health utility on Android
// (where most Indian users are) and to keep food colours in recipes visually distinct.
export const SEED = '#1A73E8';
// Semantic warning colour, harmonised towards the seed so it sits in the same palette.
const WARNING = '#B26A00';
const SUCCESS = '#1E8E3E';

const scheme = new SchemeFidelity(Hct.fromInt(argbFromHex(SEED)), false, 0);
const roles = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'onSurface', 'onSurfaceVariant', 'outline', 'outlineVariant', 'inverseSurface', 'inverseOnSurface', 'inversePrimary', 'scrim',
] as const;
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const out: Record<string, string> = {};
for (const r of roles) out[kebab(r)] = hexFromArgb((MaterialDynamicColors as unknown as Record<string, { getArgb: (s: unknown) => number }>)[r].getArgb(scheme));

// Custom semantic colours (harmonised), with container tones like M3 custom colours.
function custom(name: string, hex: string) {
  const h = Hct.fromInt(Blend.harmonize(argbFromHex(hex), argbFromHex(SEED)));
  const tone = (t: number) => hexFromArgb(Hct.from(h.hue, Math.max(h.chroma, 36), t).toInt());
  out[name] = tone(40);
  out[`on-${name}`] = tone(100);
  out[`${name}-container`] = tone(90);
  out[`on-${name}-container`] = tone(10);
}
custom('warning', WARNING);
custom('success', SUCCESS);
writeFileSync('src/styles/m3-tokens.json', JSON.stringify({ seed: SEED, scheme: 'fidelity', light: out }, null, 2) + '\n');
console.log(out);
