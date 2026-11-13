// Nutrion, NourishCart's guide. An original character: a round jamun-plum body, a
// curry-leaf sprout, big eyes and mango cheeks. Pure SVG + CSS animations (index.css),
// so it costs almost nothing to draw and stops moving when "reduce motion" is on.
//
// Moods:
//   idle       gentle bob and blink
//   talking    mouth opens and closes (while the app speaks)
//   listening  leaf wiggles fast, ears-up look (while the mic is on)
//   thinking   three dots (while waiting for an answer or a page)
//   happy      two hops and a sparkle (after something is done)
import { clsx } from 'clsx';
import { useId } from 'react';

export type NutrionMood = 'idle' | 'talking' | 'listening' | 'thinking' | 'happy';

export function Nutrion({ mood = 'idle', size = 72, className, title = 'Nutrion' }: { mood?: NutrionMood; size?: number; className?: string; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={clsx('shrink-0 overflow-visible', `nutrion-${mood}`, className)}
    >
      <defs>
        <radialGradient id={`body-${id}`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#8E5FB8" />
          <stop offset="55%" stopColor="#5B3483" />
          <stop offset="100%" stopColor="#3A1F57" />
        </radialGradient>
        <linearGradient id={`leaf-${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#2F7A55" />
          <stop offset="100%" stopColor="#5DBB84" />
        </linearGradient>
      </defs>
      {/* soft ground shadow */}
      <ellipse cx="60" cy="112" rx="30" ry="5" fill="#2E1745" opacity="0.12" />
      <g className="nutrion-body">
        {/* curry-leaf sprout */}
        <g className="nutrion-leaf">
          <path d="M60 26 C 58 18, 58 12, 60 6" stroke="#2F7A55" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M60 14 C 48 4, 36 8, 34 16 C 44 20, 54 20, 60 14 Z" fill={`url(#leaf-${id})`} />
          <path d="M61 10 C 70 0, 84 2, 86 10 C 78 16, 68 16, 61 10 Z" fill={`url(#leaf-${id})`} />
        </g>
        {/* body */}
        <path d="M60 22 C 90 22, 104 46, 102 70 C 100 94, 82 108, 60 108 C 38 108, 20 94, 18 70 C 16 46, 30 22, 60 22 Z" fill={`url(#body-${id})`} />
        {/* belly highlight */}
        <ellipse cx="60" cy="82" rx="26" ry="18" fill="#FFFFFF" opacity="0.10" />
        <ellipse cx="44" cy="40" rx="9" ry="5" fill="#FFFFFF" opacity="0.28" transform="rotate(-25 44 40)" />
        {/* eyes */}
        <g>
          <ellipse cx="45" cy="62" rx="10" ry="11" fill="#FFFFFF" />
          <ellipse cx="75" cy="62" rx="10" ry="11" fill="#FFFFFF" />
          <g className="nutrion-eye">
            <circle cx={mood === 'thinking' ? 47 : 46} cy={mood === 'thinking' ? 58 : 63} r="5.2" fill="#1E1530" />
            <circle cx={mood === 'thinking' ? 77 : 76} cy={mood === 'thinking' ? 58 : 63} r="5.2" fill="#1E1530" />
            <circle cx={mood === 'thinking' ? 48.6 : 47.8} cy={mood === 'thinking' ? 56.2 : 61} r="1.7" fill="#FFFFFF" />
            <circle cx={mood === 'thinking' ? 78.6 : 77.8} cy={mood === 'thinking' ? 56.2 : 61} r="1.7" fill="#FFFFFF" />
          </g>
          {mood === 'listening' && (
            <>
              <path d="M34 47 Q 45 41 54 47" stroke="#1E1530" strokeWidth="2.4" strokeLinecap="round" fill="none" />
              <path d="M66 47 Q 75 41 86 47" stroke="#1E1530" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            </>
          )}
        </g>
        {/* mango cheeks */}
        <ellipse cx="34" cy="77" rx="7" ry="4.5" fill="#FFB21A" opacity="0.75" />
        <ellipse cx="86" cy="77" rx="7" ry="4.5" fill="#FFB21A" opacity="0.75" />
        {/* mouth */}
        {mood === 'talking' ? (
          <ellipse className="nutrion-mouth-talk" cx="60" cy="82" rx="7" ry="5" fill="#2E1745" />
        ) : mood === 'happy' ? (
          <path d="M48 78 Q 60 92 72 78 Z" fill="#2E1745" />
        ) : mood === 'thinking' ? (
          <path d="M53 83 Q 60 80 67 83" stroke="#2E1745" strokeWidth="3" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M51 79 Q 60 88 69 79" stroke="#2E1745" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        )}
        {/* little arms */}
        <path d={mood === 'happy' ? 'M20 66 Q 8 52 12 42' : 'M20 74 Q 10 80 12 88'} stroke="#3A1F57" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d={mood === 'happy' ? 'M100 66 Q 112 52 108 42' : 'M100 74 Q 110 80 108 88'} stroke="#3A1F57" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
      {mood === 'thinking' && (
        <g fill="#5B3483">
          <circle className="nutrion-dot" cx="94" cy="20" r="3.5" />
          <circle className="nutrion-dot" cx="104" cy="12" r="4.5" />
          <circle className="nutrion-dot" cx="116" cy="4" r="5.5" />
        </g>
      )}
      {mood === 'happy' && (
        <g fill="#FFB21A">
          <path className="sparkle" d="M14 18 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
          <path className="sparkle" style={{ animationDelay: '150ms' }} d="M104 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        </g>
      )}
    </svg>
  );
}

/** Nutrion with a speech bubble: the friendly voice for hints, empty states and next steps. */
export function NutrionSays({ children, mood = 'idle', size = 56, className }: { children: React.ReactNode; mood?: NutrionMood; size?: number; className?: string }) {
  return (
    <div className={clsx('flex items-end gap-3', className)}>
      <Nutrion mood={mood} size={size} />
      <div className="relative mb-2 rounded-[20px] rounded-bl-md bg-primary-container px-4 py-2.5 text-on-primary-container">{children}</div>
    </div>
  );
}
