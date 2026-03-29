'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { Download, FileText, Image as ImageIcon } from 'lucide-react';

interface ExportMenuProps {
  onExportPdf?: () => void;
  onExportImages?: () => void;
  onExportZip?: () => void;
  disabled?: boolean;
}

export function ExportMenu({ onExportPdf, onExportImages, onExportZip, disabled }: ExportMenuProps): React.ReactElement {
  const t = useTranslations('export');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1" disabled={disabled}>
          <Download className="h-3 w-3" />
          {t('export')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {onExportPdf && (
          <DropdownMenuItem onClick={onExportPdf} className="gap-2 cursor-pointer">
            <FileText className="h-4 w-4" /> {t('exportPdf')}
          </DropdownMenuItem>
        )}
        {onExportImages && (
          <DropdownMenuItem onClick={onExportImages} className="gap-2 cursor-pointer">
            <ImageIcon className="h-4 w-4" /> {t('downloadImages')}
          </DropdownMenuItem>
        )}
        {onExportZip && (
          <DropdownMenuItem onClick={onExportZip} className="gap-2 cursor-pointer">
            <Download className="h-4 w-4" /> {t('downloadZip')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
