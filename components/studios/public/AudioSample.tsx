import sampleFile from '@/public/examples/studios/voiceover-gulf-sample.json';

/**
 * The voiceover studio's sample — a native <audio controls> and the script
 * beside it as text.
 *
 * ── WHY A SERVER COMPONENT ─────────────────────────────────────────────────
 * `<audio controls>` is a complete player with no JavaScript at all, so this
 * needs no client island. The rule these pages are built on is that their whole
 * job is HTML a crawler and an answer engine can read.
 *
 * ── WHY THE TRANSCRIPT IS BESIDE IT ────────────────────────────────────────
 * A crawler cannot listen. The Arabic script is the only part of this section
 * an answer engine can read, and it is also the only part a visitor with the
 * sound off can judge.
 *
 * It is the script we SENT, and the label says so — see `scriptAsSpoken` below
 * for the measurement that made that wording the only honest one.
 *
 * ── WHY THE JSON IS IMPORTED HERE AND TYPED ON ASSIGNMENT ──────────────────
 * `const VOICEOVER_SAMPLE: VoiceoverSample = sampleFile;` below is a
 * COMPILE-TIME check that the file scripts/make-voiceover-sample.ts:139-153
 * writes still has the shape this page reads. The same rule
 * DeliverableSample.tsx states: a shape change must fail `tsc`, not render a
 * blank section on a public page.
 */

/** What scripts/make-voiceover-sample.ts:139-153 records about the run. */
interface VoiceoverSample {
  file: string;
  /** The duration the STUDIO reported for this run — an estimate from
   *  `estimateVoiceoverDuration` (voiceover/route.ts), not a measurement of the
   *  file. It is deliberately not printed anywhere: the player prints the real
   *  length, and two numbers that disagree on the same page is the failure this
   *  page exists to avoid. Kept in the type because the file carries it — and
   *  because it is the measurement that decides which script this page may
   *  claim to be showing (see `scriptAsSpoken`). */
  durationSeconds: number;
  /** 'openai' | 'elevenlabs' at the source. Typed as `string` because it comes
   *  out of JSON and a union here would be an assertion, not a check — the
   *  page decides which of the two tier labels to print by comparing it. */
  provider: string;
  voice: string;
  dialect: string;
  tone: string;
  /** The script this sample was generated FROM. It is what the page renders,
   *  and its label says exactly that. */
  scriptAsWritten: string;
  /**
   * NOT what was spoken, despite the name, and this page must never label it
   * as such. Two facts, both measured rather than reasoned about:
   *
   *  - `POST /api/studios/voiceover` returns no rewritten text, so
   *    make-voiceover-sample.ts:148 falls through its `?? SCRIPT` and writes
   *    the SUBMITTED script into this field, always. The two fields in the
   *    file are byte-identical for that reason, not because nothing was
   *    rewritten.
   *  - A rewrite demonstrably WAS spoken here. The route reports
   *    `estimateVoiceoverDuration(synthesizedChars, speed, ratePlan)` — the
   *    text actually handed to the provider — and the file records 15s at
   *    speed 1 on the premium path, i.e. ~150 characters at 10 chars/sec
   *    (voiceover-costs.ts `PROVIDER_CHARS_PER_SECOND`). The script is 93
   *    characters, which would have reported 9s. The 258 kB of MP3 agrees:
   *    ~16s at 128 kbps, not ~10s.
   *
   * So a "what is spoken" label on this text would be a claim the artifact
   * itself refutes. Kept in the type because the file carries the field.
   */
  scriptAsSpoken: string;
  generatedAt: string;
  generatedOn: string;
}

export const VOICEOVER_SAMPLE: VoiceoverSample = sampleFile;

/**
 * The five dialects the studio sells — lib/credits/voiceover-costs.ts:58 lists
 * exactly these for the plans that get all of them, and messages'
 * `voiceover.dialects` already carries a label for each.
 *
 * The guard exists so the page reads the sample's dialect LABEL from the
 * product's own translations instead of a second copy written into this page's
 * copy. A dialect the product does not sell resolves to no label rather than to
 * a missing-message key rendered on a public page.
 */
export const SAMPLE_DIALECTS = ['saudi', 'emirati', 'egyptian', 'gulf', 'formal'] as const;
export type SampleDialect = (typeof SAMPLE_DIALECTS)[number];

export function isSampleDialect(value: string): value is SampleDialect {
  return (SAMPLE_DIALECTS as readonly string[]).includes(value);
}

interface AudioSampleProps {
  title: string;
  note: string;
  src: string;
  transcript: string;
  transcriptLabel: string;
  meta: string;
  /** The deployment the sample ran against and the day it ran, already
   *  formatted by the page. Same line, same reason, as DeliverableSample. */
  provenance: string;
}

export function AudioSample({
  title,
  note,
  src,
  transcript,
  transcriptLabel,
  meta,
  provenance,
}: AudioSampleProps): React.ReactElement {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{note}</p>
      <p className="mt-1 text-start text-xs text-[var(--color-text-muted)]" dir="ltr" lang="en">
        {provenance}
      </p>
      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <audio controls preload="none" src={src} className="w-full" />
        <p className="mt-4 text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
          {transcriptLabel}
        </p>
        {/* The script is Arabic whatever language the page is in, so it carries
            its OWN direction AND its own language — the rule DeliverableSample
            states for its English samples, applied the other way round. Without
            the direction the English page renders Arabic in a left-to-right
            paragraph and mangles the punctuation at both ends; without the
            language a screen reader on /en/studios/voiceover reads Arabic
            aloud in an English voice (WCAG 2.1 SC 3.1.2). `transcriptLabel`
            above stays outside it, in the page's language, because it is the
            page's word and not the sample's. */}
        <p className="mt-1 text-start text-[var(--color-text-secondary)]" dir="rtl" lang="ar">
          {transcript}
        </p>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">{meta}</p>
      </div>
    </section>
  );
}
