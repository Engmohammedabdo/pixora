import { Badge } from '@/components/ui/badge';

interface StudioHeroProps {
  name: string;
  tagline: string;
  definition: string;
  costLabel: string;
  costValue: string;
}

/**
 * The definition paragraph is a plain <p> directly under the H1 and is not
 * behind any interaction: it is the sentence an answer engine lifts when
 * someone asks what this studio does.
 */
export function StudioHero({ name, tagline, definition, costLabel, costValue }: StudioHeroProps): React.ReactElement {
  return (
    <header className="mx-auto max-w-3xl px-6 pt-16 pb-10 text-center">
      <h1 className="font-cairo text-3xl sm:text-4xl font-bold text-[var(--color-text-primary)]">{name}</h1>
      <p className="mt-3 text-lg text-[var(--color-text-secondary)]">{tagline}</p>
      <p className="mt-6 text-base leading-relaxed text-[var(--color-text-secondary)]">{definition}</p>
      <div className="mt-6 flex items-center justify-center gap-2 text-sm">
        <span className="text-[var(--color-text-muted)]">{costLabel}</span>
        <Badge variant="secondary">{costValue}</Badge>
      </div>
    </header>
  );
}
