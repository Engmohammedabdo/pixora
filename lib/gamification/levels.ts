export interface Level {
  name: string;
  nameAr: string;
  minGenerations: number;
  badge: string;
}

export const LEVELS: Level[] = [
  { name: 'Beginner', nameAr: 'مبتدئ', minGenerations: 0, badge: '🌱' },
  { name: 'Creator', nameAr: 'مبدع', minGenerations: 10, badge: '🎨' },
  { name: 'Professional', nameAr: 'محترف', minGenerations: 50, badge: '⭐' },
  { name: 'Expert', nameAr: 'خبير', minGenerations: 200, badge: '🏆' },
  { name: 'Master', nameAr: 'أسطورة', minGenerations: 500, badge: '👑' },
];

export function getUserLevel(totalGenerations: number): Level {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalGenerations >= LEVELS[i].minGenerations) return LEVELS[i];
  }
  return LEVELS[0];
}
