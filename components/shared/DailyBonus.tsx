'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Coins, Gift } from 'lucide-react';

interface DailyBonusProps {
  open: boolean;
  onClose: () => void;
  credits: number;
}

export function DailyBonus({ open, onClose, credits }: DailyBonusProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm text-center">
        <AnimatePresence>
          {open && (
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-4 py-4">
              <motion.div animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }} transition={{ duration: 0.6 }} className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Gift className="h-8 w-8 text-amber-500" />
              </motion.div>
              <h2 className="text-xl font-bold font-cairo">مكافأة يومية!</h2>
              <div className="flex items-center gap-2 text-2xl font-bold text-primary-600">
                <Coins className="h-6 w-6" />
                <span>+{credits}</span>
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">تم إضافة {credits} كريدت لحسابك. استمر بالزيارة يومياً للحصول على مكافآت أكثر!</p>
              <Button onClick={onClose} className="w-full">شكراً!</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
