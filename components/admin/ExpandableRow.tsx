'use client';

import { useState } from 'react';
import { Copy, Check, Image as ImageIcon } from 'lucide-react';

interface ExpandableRowProps {
  data: Record<string, unknown>;
  imageUrl?: string | null;
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url) || url.includes('supabase') || url.includes('storage');
}

function extractImageUrls(obj: unknown): string[] {
  const urls: string[] = [];
  if (typeof obj === 'string' && (obj.startsWith('http://') || obj.startsWith('https://')) && isImageUrl(obj)) {
    urls.push(obj);
  } else if (Array.isArray(obj)) {
    obj.forEach(item => urls.push(...extractImageUrls(item)));
  } else if (obj && typeof obj === 'object') {
    Object.values(obj).forEach(val => urls.push(...extractImageUrls(val)));
  }
  return urls;
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-amber-600'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-indigo-600'; // key
        } else {
          cls = 'text-emerald-600'; // string
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-blue-600'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-slate-400'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export default function ExpandableRow({ data, imageUrl }: ExpandableRowProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);
  const images = imageUrl ? [imageUrl] : extractImageUrls(data);

  function handleCopy() {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.slice(0, 4).map((url, i) => (
            <div key={i} className="relative">
              <div className="flex items-center gap-1 mb-1 text-xs text-slate-500">
                <ImageIcon className="h-3 w-3" />
                Output Preview
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Generation output"
                className="max-w-xs rounded-lg border border-slate-200 shadow-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          ))}
        </div>
      )}

      {/* JSON display */}
      <div className="relative">
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-white/80 px-2 py-1 text-xs text-slate-600 shadow-sm transition-colors hover:bg-white"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <pre
          className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-300"
          dangerouslySetInnerHTML={{ __html: syntaxHighlight(jsonString) }}
        />
      </div>
    </div>
  );
}
