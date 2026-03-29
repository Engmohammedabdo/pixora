'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Users, UserPlus, Crown, Shield, User, Mail, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string | null;
}

const MOCK_MEMBERS: TeamMember[] = [
  { id: '1', name: 'أنت', email: 'you@example.com', role: 'owner', joinedAt: '2024-01-01' },
];

const roleIcons: Record<string, React.ReactNode> = {
  owner: <Crown className="h-3 w-3 text-amber-500" />,
  admin: <Shield className="h-3 w-3 text-primary-500" />,
  member: <User className="h-3 w-3 text-[var(--color-text-muted)]" />,
};

const roleLabels: Record<string, string> = {
  owner: 'مالك',
  admin: 'مدير',
  member: 'عضو',
};

const roleBadgeVariants: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
};

export default function TeamPage(): React.ReactElement {
  const t = useTranslations();
  const [members] = useState<TeamMember[]>(MOCK_MEMBERS);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');

  const handleInvite = (): void => {
    if (!inviteEmail) return;
    // UI-only: would call API in production
    alert(`سيتم إرسال دعوة إلى ${inviteEmail} كـ ${roleLabels[inviteRole]}`);
    setInviteEmail('');
    setShowInvite(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-cairo">{t('nav.team')}</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">إدارة فريقك والصلاحيات</p>
        </div>
        <Button onClick={() => setShowInvite(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          دعوة عضو
        </Button>
      </div>

      {/* Team Info */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-500" />
              فريقك
            </CardTitle>
            <Badge variant="secondary">{members.length} / 5 أعضاء</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{member.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={roleBadgeVariants[member.role]} className="gap-1 text-xs">
                    {roleIcons[member.role]}
                    {roleLabels[member.role]}
                  </Badge>
                  {member.role !== 'owner' && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-[var(--color-error)]">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Plan Note */}
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">ميزة الفريق متاحة في خطة Business وأعلى</p>
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
              ترقّى لخطة Business ($59/شهر) للحصول على فريق حتى 5 أعضاء مع كريدت مشترك.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>دعوة عضو جديد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[var(--color-text-muted)]" />
                <Input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  type="email"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الصلاحية</Label>
              <div className="flex gap-2">
                {(['admin', 'member'] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => setInviteRole(role)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                      inviteRole === role
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-[var(--color-border)] hover:border-primary-300'
                    )}
                  >
                    {roleIcons[role]}
                    {roleLabels[role]}
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            <Button onClick={handleInvite} disabled={!inviteEmail} className="w-full gap-2">
              <UserPlus className="h-4 w-4" />
              إرسال الدعوة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
