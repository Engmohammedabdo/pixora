interface StudioStepsProps {
  title: string;
  steps: readonly string[];
}

/**
 * Numbered because these ARE a sequence — the customer does them in this order.
 * Do not reuse this shape for anything that is merely a list.
 */
export function StudioSteps({ title, steps }: StudioStepsProps): React.ReactElement {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <ol className="mt-6 space-y-5">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-sm font-bold text-[var(--color-text-primary)]">
              {i + 1}
            </span>
            <p className="pt-1 text-[var(--color-text-secondary)]">{step}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
