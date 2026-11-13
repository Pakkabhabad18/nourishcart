// A person's picture: their photo if they added one, otherwise their initial on a colour
// picked from their name (so each family member is recognisable at a glance).
import { clsx } from 'clsx';

const COLOURS = ['#4A2A6B', '#2F7A55', '#B87400', '#C23A22', '#3D5A99', '#7A3E6B'];

function colourFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOURS[h % COLOURS.length];
}

export function Avatar({ name, src, size = 36, className, ring }: { name: string; src?: string | null; size?: number; className?: string; ring?: boolean }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  return src ? (
    <img src={src} alt="" style={style} className={clsx('shrink-0 rounded-full object-cover', ring && 'ring-2 ring-mango ring-offset-2 ring-offset-surface', className)} />
  ) : (
    <span
      aria-hidden
      style={{ ...style, background: colourFor(name || '?') }}
      className={clsx('grid shrink-0 place-items-center rounded-full font-display font-bold text-white', ring && 'ring-2 ring-mango ring-offset-2 ring-offset-surface', className)}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Shrinks a chosen photo to a 160 px square JPEG (about 10-30 KB) in the browser, so the
 * original never leaves the phone and the profile row stays small.
 */
export async function photoToAvatar(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a photo we can read."));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
