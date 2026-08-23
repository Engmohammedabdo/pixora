/**
 * Check that the address this app sends FROM can survive the domain's own DMARC
 * policy — before a launch, not after the invites vanish.
 *
 *   node scripts/check-mail-dns.js
 *
 * WHY THIS EXISTS
 *
 * `pyramedia.info` publishes `p=reject` with `adkim=s; aspf=s`. Strict alignment
 * plus reject is an unforgiving combination: a From address at a *subdomain*
 * (`support@mail.pyramedia.info`) passes SPF, passes DKIM, and is still rejected
 * outright by the receiver — not spam-foldered, rejected. From the sender's side
 * that looks exactly like success. For an invite-only launch the invite IS the
 * funnel, so "probably fine" is not a standard worth shipping on.
 *
 * This reads DNS and the SMTP banner only. It sends nothing, needs no password,
 * and cannot prove DKIM is actually SIGNING — a published key means somebody
 * generated a keypair, not that Postfix loaded the private half. Only a real
 * message read in a real inbox proves that; see docs/EMAIL_SETUP.md §5.
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');

const ROOT = path.join(__dirname, '..');
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

let failures = 0;
let warnings = 0;
const pass = (msg, detail = '') => console.log(`PASS  ${msg}${detail ? `  — ${detail}` : ''}`);
const fail = (msg, detail = '') => { failures++; console.log(`FAIL  ${msg}${detail ? `  — ${detail}` : ''}`); };
const warn = (msg, detail = '') => { warnings++; console.log(`WARN  ${msg}${detail ? `  — ${detail}` : ''}`); };

/** DNS over HTTPS, so the answer does not depend on whatever resolver this machine uses. */
async function txt(name) {
  const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`);
  const j = await r.json();
  if (j.Status !== 0 || !j.Answer) return [];
  return j.Answer.map((a) => a.data.replace(/^"|"$/g, '').replace(/" "/g, ''));
}

/** The EHLO keywords the server offers once the connection is encrypted. */
function ehloAfterStarttls(host, port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port, timeout: 10_000 });
    let buf = '';
    let stage = 0;
    const done = (v) => { try { sock.destroy(); } catch { /* already gone */ } resolve(v); };

    sock.on('data', (d) => {
      buf += d.toString();
      if (stage === 0 && /^220[ ]/m.test(buf)) { stage = 1; buf = ''; sock.write('EHLO preflight.local\r\n'); return; }
      if (stage === 1 && /^250[ ]/m.test(buf)) { stage = 2; buf = ''; sock.write('STARTTLS\r\n'); return; }
      if (stage === 2 && /^220[ ]/m.test(buf)) {
        stage = 3;
        const secure = tls.connect({ socket: sock, servername: host, rejectUnauthorized: false }, () => {
          let tb = '';
          secure.on('data', (dd) => {
            tb += dd.toString();
            if (/^250[ ]/m.test(tb)) {
              const cert = secure.getPeerCertificate();
              done({ ehlo: tb, cn: cert && cert.subject ? cert.subject.CN : null });
            }
          });
          secure.write('EHLO preflight.local\r\n');
        });
        secure.on('error', (e) => done({ error: e.message }));
      }
    });
    sock.on('timeout', () => done({ error: 'timeout' }));
    sock.on('error', (e) => done({ error: e.code || e.message }));
  });
}

(async () => {
  const from = process.env.EMAIL_FROM || '';
  const host = process.env.SMTP_HOST || '';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  if (!from) {
    console.error('EMAIL_FROM is not set — nothing to check. Set it in .env.local first.');
    process.exit(1);
  }

  // "PyraSuite <support@pyramedia.info>" -> support@pyramedia.info
  const addr = (from.match(/<([^>]+)>/) || [null, from])[1].trim();
  const fromDomain = addr.split('@')[1];
  if (!fromDomain) { console.error(`EMAIL_FROM has no domain: ${from}`); process.exit(1); }

  console.log(`from    : ${addr}`);
  console.log(`domain  : ${fromDomain}`);
  console.log(`smtp    : ${host || '(not set)'}:${port}\n`);

  // ── DMARC ────────────────────────────────────────────────────────────────
  //
  // Looked up the way a RECEIVER looks it up, not the way it is published.
  // If `_dmarc.<from-domain>` does not exist, DMARC falls back to the
  // organisational domain's record — so a subdomain sender is still governed by
  // the parent's policy. Checking only the exact From domain reports "no DMARC"
  // for precisely the case this script exists to catch, and downgrades the
  // resulting alignment failure to a warning. That bug was in the first version
  // of this file and was caught by running it against a subdomain address.
  const orgDomain = fromDomain.split('.').slice(-2).join('.');
  const isSubdomain = fromDomain !== orgDomain;

  let dmarcRecords = await txt(`_dmarc.${fromDomain}`);
  let dmarcSource = fromDomain;
  if (!dmarcRecords.some((r) => /^v=DMARC1/i.test(r)) && isSubdomain) {
    dmarcRecords = await txt(`_dmarc.${orgDomain}`);
    dmarcSource = `${orgDomain} (organisational fallback)`;
  }
  const dmarc = dmarcRecords.find((r) => /^v=DMARC1/i.test(r));

  let strictSpf = false;
  let strictDkim = false;
  let policy = 'none';

  if (!dmarc) {
    warn('no DMARC record', `receivers apply their own judgement to ${fromDomain}`);
  } else {
    const get = (k) => (dmarc.match(new RegExp(`${k}\\s*=\\s*([^;\\s]+)`, 'i')) || [])[1];
    policy = (get('p') || 'none').toLowerCase();
    strictSpf = (get('aspf') || 'r').toLowerCase() === 's';
    strictDkim = (get('adkim') || 'r').toLowerCase() === 's';
    // `sp=` overrides `p=` for subdomains when the policy came from the parent.
    const sp = (dmarc.match(/\bsp\s*=\s*([^;\s]+)/i) || [])[1];
    if (sp && isSubdomain) policy = sp.toLowerCase();

    const severity = policy === 'reject' ? 'REJECTED outright' : policy === 'quarantine' ? 'sent to spam' : 'delivered anyway';
    pass(`DMARC policy from ${dmarcSource}`, `p=${policy} (failures are ${severity}), aspf=${strictSpf ? 'strict' : 'relaxed'}, adkim=${strictDkim ? 'strict' : 'relaxed'}`);
  }

  // ── The alignment trap this script exists for ────────────────────────────
  //
  // Under strict alignment the From domain must be the ORGANISATIONAL domain
  // exactly. A subdomain is the failure that looks like success: SPF passes,
  // DKIM passes, DMARC rejects.
  if (isSubdomain && (strictSpf || strictDkim)) {
    fail(
      'EMAIL_FROM is on a SUBDOMAIN under strict DMARC alignment',
      `${fromDomain} does not align with ${orgDomain}; use an address @${orgDomain}` +
      (policy === 'reject' ? ' — with p=reject this mail is rejected, not spam-foldered' : '')
    );
  } else if (isSubdomain) {
    warn('EMAIL_FROM is on a subdomain', `relaxed alignment permits it, but @${orgDomain} is safer`);
  } else {
    pass('EMAIL_FROM aligns with the organisational domain', fromDomain);
  }

  // ── SPF ──────────────────────────────────────────────────────────────────
  const spf = (await txt(fromDomain)).find((r) => /^v=spf1/i.test(r));
  if (!spf) {
    fail('no SPF record', `add one for ${fromDomain}`);
  } else {
    pass('SPF record found', spf.length > 90 ? `${spf.slice(0, 90)}…` : spf);
    if (host && !/all/i.test(spf)) warn('SPF has no "all" mechanism', 'receivers get no instruction for unlisted senders');

    // Does the record actually cover the host we send through? `mx`, an `a:` of
    // the host, or its literal IP all count. Checked because "SPF exists" and
    // "SPF authorises THIS server" are different claims.
    if (host) {
      const covered =
        /\bmx\b/i.test(spf) ||
        new RegExp(`a:${host.replace(/\./g, '\\.')}`, 'i').test(spf) ||
        /ip4:/i.test(spf);
      if (covered) pass('SPF plausibly covers the sending host', host);
      else fail('SPF does not appear to authorise the sending host', `${host} is not matched by mx:, a: or ip4:`);
    }
  }

  // ── DKIM ─────────────────────────────────────────────────────────────────
  const selectors = ['mail', 'default', 'dkim', 'google', 's1', 'k1'];
  const found = [];
  for (const sel of selectors) {
    const recs = await txt(`${sel}._domainkey.${fromDomain}`);
    if (recs.some((r) => /v=DKIM1/i.test(r))) found.push(sel);
  }
  if (found.length === 0) {
    fail('no DKIM public key published', `checked selectors: ${selectors.join(', ')}`);
  } else {
    pass('DKIM key(s) published', `selector(s): ${found.join(', ')}`);
    warn(
      'a published key does NOT prove the server signs with it',
      'confirm dkim=pass with d=' + fromDomain + ' in a real inbox — docs/EMAIL_SETUP.md §5'
    );
  }

  // ── SMTP reachability + AUTH ─────────────────────────────────────────────
  if (!host) {
    warn('SMTP_HOST not set', 'skipping the connection check');
  } else {
    const r = await ehloAfterStarttls(host, port);
    if (r.error) {
      fail(`cannot complete STARTTLS against ${host}:${port}`, r.error +
        (port === 465 ? ' — port 465 is implicit TLS and this check speaks STARTTLS; try 587' : ''));
    } else {
      pass(`STARTTLS succeeded on ${host}:${port}`, r.cn ? `certificate CN=${r.cn}` : '');
      if (/AUTH[ =]/i.test(r.ehlo)) {
        const mechs = (r.ehlo.match(/250[- ]AUTH ([^\r\n]+)/i) || [])[1];
        pass('server offers AUTH after STARTTLS', mechs);
      } else {
        fail('server offers no AUTH even after STARTTLS', 'SMTP_USER/SMTP_PASS cannot be used against this host');
      }
    }
  }

  console.log(
    failures === 0
      ? `\n${warnings} warning(s), no failures. DNS and transport look right — now prove DKIM signing with a real message (docs/EMAIL_SETUP.md §5).`
      : `\n${failures} FAILURE(S), ${warnings} warning(s). Fix these before sending invites.`
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(`ERROR: ${e.message}`); process.exit(1); });
