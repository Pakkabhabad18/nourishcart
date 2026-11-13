// Label scan: photograph a packet's ingredients panel and see, for each person in the
// household, whether it's safe for them.
//   photo -> resized in the browser -> /api/label (an AI model only copies the label text)
//   -> src/domain/labels/check.ts decides per person with fixed word lists
// The words that caused each warning are quoted, and an unreadable label is never "safe".
import { useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Camera, CheckCircle2, CircleAlert, ImageUp, XCircle } from 'lucide-react';
import { useActiveProfile } from '../../app/hooks.ts';
import { store } from '../../lib/store/index.ts';
import { Button, Notice, PageHeader, Tag } from '../../components/ui.tsx';
import { ALLERGEN_LABELS, DIET_LABELS } from '../../domain/diet.ts';
import { parseLabelAnswer, verdictFor, type LabelReading, type PersonRules, type Verdict } from '../../domain/labels/check.ts';

const MAX_SIDE = 1600; // pixels: enough for small print, small enough to upload quickly

/** Shrink the photo and return base64 JPEG (no data: prefix). */
async function prepare(file: File): Promise<{ data: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { data: url.split(',')[1], preview: url };
}

const VERDICT_UI: Record<Verdict, { label: string; tone: 'good' | 'danger' | 'warn'; icon: typeof CheckCircle2 }> = {
  safe: { label: 'Fine for them', tone: 'good', icon: CheckCircle2 },
  avoid: { label: 'Avoid', tone: 'danger', icon: XCircle },
  check: { label: 'Check the pack', tone: 'warn', icon: CircleAlert },
};

export function ScanPage() {
  const { all } = useActiveProfile();
  const people = all.filter((p) => !p.archived);
  // Each person's diet and allergies come from their saved profile.
  const bundles = useQueries({ queries: people.map((p) => ({ queryKey: ['bundle', p.id], queryFn: () => store.getBundle(p.id) })) });
  const household: PersonRules[] = bundles.flatMap((q) => (q.data ? [{ name: q.data.profile.displayName, dietPattern: q.data.preferences.dietPattern, allergies: q.data.preferences.allergies }] : []));

  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<LabelReading | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setReading(null);
    setBusy(true);
    try {
      const img = await prepare(file);
      setPreview(img.preview);
      const r = await fetch('/api/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: img.data, mime: 'image/jpeg' }) });
      const j = (await r.json().catch(() => ({}))) as { content?: string; error?: string };
      if (!r.ok || typeof j.content !== 'string') throw new Error(r.status === 503 ? 'The label reader is busy or not set up. Try again in a minute.' : (j.error ?? 'The label reader failed.'));
      setReading(parseLabelAnswer(j.content));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Scan a packet" description="Photo of the ingredients. We'll say who at home it suits." />

      <section className="card p-5">
        {/* Camera on phones; the second input (no capture) opens the gallery or files. */}
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        <input type="file" accept="image/*" className="sr-only" id="label-photo" onChange={(e) => onFile(e.target.files?.[0])} />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" icon={<Camera className="h-5 w-5" aria-hidden />} loading={busy} onClick={() => input.current?.click()}>
            {busy ? 'Reading the label…' : preview ? 'Scan another' : 'Take a photo'}
          </Button>
          <label htmlFor="label-photo" className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-primary hover:underline">
            <ImageUp className="h-4 w-4" aria-hidden /> Choose from gallery
          </label>
        </div>
        <p className="mt-3 text-sm text-on-surface-variant">
          Get the ingredients and allergy text in the frame, in good light. Only the photo is sent, to read the text. Our own rules decide.
        </p>
        {error && <Notice className="mt-4" tone="danger">{error}</Notice>}
      </section>

      {reading && (
        <>
          <section className="card p-5">
            <div className="flex flex-col gap-4 sm:flex-row">
              {preview && <img src={preview} alt="Your label photo" className="max-h-48 w-auto rounded-ctl border border-outline-variant object-contain" />}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-medium">{reading.productName || 'Packet'}</h2>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Veg mark: {reading.vegMark === 'green' ? 'green (vegetarian)' : reading.vegMark === 'brown' ? 'brown (non-vegetarian)' : reading.vegMark === 'none' ? 'none seen' : 'unclear'}.
                </p>
                {!reading.readable && <Notice className="mt-2" tone="warn">Part of the ingredients list is cut off or blurry, so we can't say it's safe for anyone. Try a closer, straighter photo.</Notice>}
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-primary">What the label says</summary>
                  <p className="mt-1"><strong>Ingredients:</strong> {reading.ingredientsText || 'not visible'}</p>
                  {reading.containsText && <p className="mt-1"><strong>Allergen statement:</strong> {reading.containsText}</p>}
                  {reading.mayContainText && <p className="mt-1"><strong>May contain:</strong> {reading.mayContainText}</p>}
                </details>
              </div>
            </div>
          </section>

          <section className="card divide-y divide-outline-variant overflow-hidden">
            {household.length === 0 && <p className="p-5 text-sm">Finish setting up to get an answer for each person.</p>}
            {household.map((p) => {
              const v = verdictFor(reading, p);
              const ui = VERDICT_UI[v.verdict];
              const Icon = ui.icon;
              return (
                <div key={p.name} className="flex gap-3 p-4">
                  <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${v.verdict === 'safe' ? 'text-success' : v.verdict === 'avoid' ? 'text-error' : 'text-warning'}`} aria-hidden />
                  <div>
                    <p className="font-medium">
                      {p.name} <Tag tone={ui.tone}>{ui.label}</Tag>
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {p.dietPattern ? DIET_LABELS[p.dietPattern] : 'Diet not set'}
                      {p.allergies.length ? ` · allergic to ${p.allergies.map((a) => ALLERGEN_LABELS[a].toLowerCase()).join(', ')}` : ' · no allergies'}
                    </p>
                    {v.reasons.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {v.reasons.map((r, i) => (
                          <li key={i}>
                            {r.text}
                            {r.quote && <span className="text-on-surface-variant"> (label says “{r.quote}”)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
          <p className="text-xs text-on-surface-variant">A quick check, not a guarantee. With a serious allergy, always read the pack yourself.</p>
        </>
      )}
    </div>
  );
}
