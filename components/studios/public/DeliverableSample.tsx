import planFile from '@/public/examples/studios/deliverable-plan.json';
import analysisFile from '@/public/examples/studios/deliverable-analysis.json';
import storyboardFile from '@/public/examples/studios/deliverable-storyboard.json';
import promptBuilderFile from '@/public/examples/studios/deliverable-prompt-builder.json';

/**
 * The four text studios' samples — rendered as HTML, from the JSON a real run
 * got back from the live product.
 *
 * ── WHY HTML AND NOT A SCREENSHOT ──────────────────────────────────────────
 * A screenshot of a marketing plan is an image of text: not indexable, not
 * quotable by an answer engine, not selectable, and it needs a second asset
 * pipeline. This renders the deliverable itself — which is also, exactly, what
 * the customer receives.
 *
 * ── WHY THE JSON IS IMPORTED HERE AND TYPED ON ASSIGNMENT ──────────────────
 * Every `const X: XDeliverable = xFile;` below is a COMPILE-TIME check that the
 * file scripts/build-studio-examples.mjs writes still has the shape this
 * component reads. The alternative — a `data: unknown` prop narrowed at
 * runtime — turns a shape change into a silently blank section on a public
 * page, which is the failure class this repo keeps paying for. A missing field
 * now fails `tsc`.
 *
 * Labels come in as props, never from a hook: the page owns every string, the
 * way every other component under components/studios/public/ does.
 */

/** The fields the build script records about the run every sample came from. */
interface Provenance {
  sourceRun: string;
  generatedOn: string;
  /** The language the run ASKED the studio for. Deliberately `string`, not a
   *  union: it comes out of JSON, and a union would need a cast that asserts
   *  what it cannot check. `mixed` is prompt-builder, bilingual by design. */
  lang: string;
}

interface PlanDeliverable extends Provenance {
  data: {
    objectives: { goal: string; kpi: string; target: string }[];
    channels: { name: string; budget_pct: number; strategy: string }[];
    calendar: { week: number; content: string[]; channel: string }[];
  };
}

interface AnalysisDeliverable extends Provenance {
  data: {
    swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
    kpis: { metric: string; target: string; timeframe: string }[];
  };
}

interface StoryboardDeliverable extends Provenance {
  data: { scene_number: number; camera_angle: string; dialogue: string }[];
}

interface PromptBuilderDeliverable extends Provenance {
  /** The customer's rough sentence. It is the whole argument of that page — the
   *  distance between what you type and what comes back — and it is not part of
   *  the response, so the build script records it from the request. */
  input: string;
  data: { prompt: string; style: string; tip: string }[];
}

const PLAN: PlanDeliverable = planFile;
const ANALYSIS: AnalysisDeliverable = analysisFile;
const STORYBOARD: StoryboardDeliverable = storyboardFile;
const PROMPT_BUILDER: PromptBuilderDeliverable = promptBuilderFile;

/** The four studios whose sample is text. The page asks this before rendering,
 *  so the component is never reached with a slug it has no file for. */
export const TEXT_DELIVERABLE_SLUGS = ['plan', 'analysis', 'storyboard', 'prompt-builder'] as const;
export type TextDeliverableSlug = (typeof TEXT_DELIVERABLE_SLUGS)[number];

export function hasDeliverableSample(slug: string): slug is TextDeliverableSlug {
  return (TEXT_DELIVERABLE_SLUGS as readonly string[]).includes(slug);
}

export interface DeliverableLabels {
  objectives: string;
  goal: string;
  kpi: string;
  target: string;
  channels: string;
  calendar: string;
  week: string;
  swot: string;
  strengths: string;
  weaknesses: string;
  opportunities: string;
  threats: string;
  kpis: string;
  timeframe: string;
  scenes: string;
  scene: string;
  camera: string;
  brief: string;
  prompts: string;
  style: string;
  tip: string;
}

interface DeliverableSampleProps {
  title: string;
  note: string;
  /** Shown ONLY when the sample's own language differs from the page's. There
   *  is no Arabic plan artifact in any live run — every `plan_*.json` on disk
   *  is `plan_en` — so the Arabic plan page would otherwise imply this product
   *  answers in English. The studio takes a `locale` and honours it
   *  (lib/ai/prompts/plan.ts:36); the sample simply predates that need. */
  langNote: string;
  locale: 'ar' | 'en';
  slug: TextDeliverableSlug;
  labels: DeliverableLabels;
}

const CARD = 'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]';
const H3 = 'text-sm font-bold uppercase tracking-wide text-[var(--color-text-muted)]';

function Section({ heading, children }: { heading: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="mt-8 first:mt-0">
      <h3 className={H3}>{heading}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function PlanSample({ labels }: { labels: DeliverableLabels }): React.ReactElement {
  const { objectives, channels, calendar } = PLAN.data;
  return (
    <>
      <Section heading={labels.objectives}>
        {/* The one horizontally scrollable thing on the page: three columns of
            prose do not fit a 360px phone, and the alternative is a body that
            scrolls sideways. */}
        <div className={`overflow-x-auto ${CARD}`}>
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="px-4 py-3 text-start font-medium">{labels.goal}</th>
                <th className="px-4 py-3 text-start font-medium">{labels.kpi}</th>
                <th className="px-4 py-3 text-start font-medium">{labels.target}</th>
              </tr>
            </thead>
            <tbody>
              {objectives.map((o) => (
                <tr key={o.goal} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-4 py-3 text-[var(--color-text-primary)]">{o.goal}</td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{o.kpi}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--color-text-secondary)]">{o.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section heading={labels.channels}>
        <ul className="space-y-3">
          {channels.map((c) => (
            <li key={c.name} className={`${CARD} p-4`}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium text-[var(--color-text-primary)]">{c.name}</span>
                <span className="shrink-0 tabular-nums text-sm text-[var(--color-text-muted)]">{c.budget_pct}%</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{c.strategy}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section heading={labels.calendar}>
        <div className="grid gap-3 sm:grid-cols-2">
          {calendar.slice(0, 2).map((w) => (
            <div key={w.week} className={`${CARD} p-4`}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {labels.week} <span className="tabular-nums">{w.week}</span>
                </span>
                <span className="shrink-0 text-sm text-[var(--color-text-muted)]">{w.channel}</span>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
                {w.content.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function AnalysisSample({ labels }: { labels: DeliverableLabels }): React.ReactElement {
  const { swot, kpis } = ANALYSIS.data;
  const quadrants: { heading: string; items: string[] }[] = [
    { heading: labels.strengths, items: swot.strengths },
    { heading: labels.weaknesses, items: swot.weaknesses },
    { heading: labels.opportunities, items: swot.opportunities },
    { heading: labels.threats, items: swot.threats },
  ];
  return (
    <>
      <Section heading={labels.swot}>
        <div className="grid gap-3 sm:grid-cols-2">
          {quadrants.map((q) => (
            <div key={q.heading} className={`${CARD} p-4`}>
              <h4 className="font-medium text-[var(--color-text-primary)]">{q.heading}</h4>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {q.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section heading={labels.kpis}>
        <div className="grid gap-3 sm:grid-cols-3">
          {kpis.map((k) => (
            <div key={k.metric} className={`${CARD} p-4`}>
              {/* The headline number first and largest. Every KPI card rendered
                  a blank headline until 2026-08-24, when the prompt asked for
                  target_30d/target_90d and everything downstream read
                  target/timeframe; this is the field that was missing. */}
              <p className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">{k.target}</p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{k.metric}</p>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                {labels.timeframe}: {k.timeframe}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function StoryboardSample({ labels }: { labels: DeliverableLabels }): React.ReactElement {
  return (
    <Section heading={labels.scenes}>
      <div className="grid gap-3 sm:grid-cols-3">
        {STORYBOARD.data.slice(0, 3).map((sc) => (
          <div key={sc.scene_number} className={`${CARD} p-4`}>
            <span className="text-sm font-bold text-[var(--color-text-primary)]">
              {labels.scene} <span className="tabular-nums">{sc.scene_number}</span>
            </span>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {labels.camera}: {sc.camera_angle}
            </p>
            <p className="mt-3 leading-relaxed text-[var(--color-text-primary)]">{sc.dialogue}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function PromptBuilderSample({ labels }: { labels: DeliverableLabels }): React.ReactElement {
  return (
    <>
      <Section heading={labels.brief}>
        <p className={`${CARD} p-4 leading-relaxed text-[var(--color-text-primary)]`}>{PROMPT_BUILDER.input}</p>
      </Section>
      <Section heading={labels.prompts}>
        <ul className="space-y-3">
          {PROMPT_BUILDER.data.map((p) => (
            <li key={p.prompt} className={`${CARD} p-4`}>
              <p className={H3}>
                {labels.style}: {p.style}
              </p>
              {/* dir is set on the code block itself, not on the section: the
                  prompts are English by design and the tips are Arabic, in the
                  one deliverable that asks for both (lib/ai/prompts/prompt-builder.ts:44). */}
              <code
                dir="ltr"
                className="mt-2 block whitespace-pre-wrap break-words rounded-lg bg-[var(--color-surface-2)] p-3 text-start text-xs leading-relaxed text-[var(--color-text-secondary)]"
              >
                {p.prompt}
              </code>
              <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                {labels.tip}: {p.tip}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

const SAMPLES: Record<TextDeliverableSlug, Provenance> = {
  plan: PLAN,
  analysis: ANALYSIS,
  storyboard: STORYBOARD,
  'prompt-builder': PROMPT_BUILDER,
};

export function DeliverableSample({
  title,
  note,
  langNote,
  locale,
  slug,
  labels,
}: DeliverableSampleProps): React.ReactElement {
  const meta = SAMPLES[slug];
  // `mixed` is a deliberate third state, not an unknown one: it never disagrees
  // with the page, because both languages are in the deliverable on purpose.
  const otherLanguage = meta.lang !== 'mixed' && meta.lang !== locale;
  // The sample carries its OWN direction. A right-to-left English plan is not a
  // stylistic quibble — it is the bidi-mangled mixed text the two-<html> defect
  // shipped for months. `mixed` keeps the page's direction and sets dir on the
  // English blocks only.
  const dir = meta.lang === 'ar' ? 'rtl' : meta.lang === 'en' ? 'ltr' : undefined;

  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{note}</p>
      {otherLanguage ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{langNote}</p> : null}
      {/* The provenance of the sample, in the only form that cannot be prose:
          the deployment it ran against and the day it ran. Both values come
          from the run's own report.json. */}
      <p className="mt-1 text-start text-xs text-[var(--color-text-muted)]" dir="ltr">
        {meta.generatedOn.replace(/^https?:\/\//, '')} · {meta.sourceRun.slice(0, 10)}
      </p>
      <div className="mt-6" dir={dir}>
        {slug === 'plan' ? <PlanSample labels={labels} /> : null}
        {slug === 'analysis' ? <AnalysisSample labels={labels} /> : null}
        {slug === 'storyboard' ? <StoryboardSample labels={labels} /> : null}
        {slug === 'prompt-builder' ? <PromptBuilderSample labels={labels} /> : null}
      </div>
    </section>
  );
}
