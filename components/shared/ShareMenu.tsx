'use client';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Share2, MessageCircle, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface ShareMenuProps {
  url?: string;
  text?: string;
  className?: string;
}

export function ShareMenu({ url, text, className }: ShareMenuProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const shareText = text || 'شوف إيش سويت بـ PyraSuite!';

  const handleCopy = async (): Promise<void> => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = (): void => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`, '_blank');
  };

  const handleTwitter = (): void => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  const handleLinkedIn = (): void => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Share2 className="h-3 w-3 me-1" /> مشاركة
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleWhatsApp} className="gap-2 cursor-pointer text-green-600">
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleTwitter} className="gap-2 cursor-pointer">
          <Share2 className="h-4 w-4" /> X / Twitter
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLinkedIn} className="gap-2 cursor-pointer text-blue-600">
          <Share2 className="h-4 w-4" /> LinkedIn
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopy} className="gap-2 cursor-pointer">
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          {copied ? 'تم النسخ!' : 'نسخ الرابط'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
