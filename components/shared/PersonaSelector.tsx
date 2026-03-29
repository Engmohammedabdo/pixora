'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Palette, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fadeInUp, staggerContainer } from '@/lib/animations';

interface PersonaSelectorProps {
  onSelect: (persona: string) => void;
}

const PERSONAS = [
  {
    id: 'marketer',
    icon: Briefcase,
    title: 'مسوّق / مدير تسويق',
    description: 'أحتاج إنتاج محتوى تسويقي بسرعة لشركتي أو عملائي',
    studios: ['campaign', 'creator', 'analysis'],
    color: 'from-blue-500/10 to-blue-500/5 border-blue-200 dark:border-blue-800',
  },
  {
    id: 'freelancer',
    icon: Palette,
    title: 'فريلانسر / مستقل',
    description: 'أخدم عملاء متعددين وأحتاج أدوات سريعة ومتنوعة',
    studios: ['photoshoot', 'storyboard', 'prompt-builder'],
    color: 'from-purple-500/10 to-purple-500/5 border-purple-200 dark:border-purple-800',
  },
  {
    id: 'business_owner',
    icon: Store,
    title: 'صاحب عمل / متجر',
    description: 'عندي مشروع وأبي تسويق احترافي بدون فريق كبير',
    studios: ['creator', 'campaign', 'voiceover'],
    color: 'from-green-500/10 to-green-500/5 border-green-200 dark:border-green-800',
  },
];

export function PersonaSelector({ onSelect }: PersonaSelectorProps): React.ReactElement {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
      <p className="text-sm text-center text-[var(--color-text-secondary)] mb-4">اختر الأقرب لك عشان نخصص تجربتك</p>
      {PERSONAS.map((persona) => (
        <motion.button
          key={persona.id}
          variants={fadeInUp}
          onClick={() => { setSelected(persona.id); onSelect(persona.id); }}
          className={cn(
            'w-full text-start rounded-xl border p-4 transition-all bg-gradient-to-r',
            persona.color,
            selected === persona.id ? 'ring-2 ring-primary-500 shadow-md' : 'hover:shadow-sm'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-[var(--color-surface)] flex items-center justify-center flex-shrink-0">
              <persona.icon className="h-5 w-5 text-primary-500" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{persona.title}</h3>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{persona.description}</p>
            </div>
          </div>
        </motion.button>
      ))}
    </motion.div>
  );
}
