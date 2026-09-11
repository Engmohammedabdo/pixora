# POSITIONING — who PyraSuite is for

> Written 2026-09-09, after crewzo.ai appeared. Revised 2026-09-11, when the free
> month became the $2 Entry plan and the marketing voice became one clear
> professional Arabic. One page. Every copy, page and pricing decision cites this
> file; if a change cannot cite it, it is out of scope.
>
> This is a **decision**, not a description. It is falsifiable, and §7 says how.

---

## 1. The one sentence

**PyraSuite turns one line about your dish into a week of Arabic Instagram posts —
for independent restaurants and shops in Dubai. Try a full campaign free; then $2
a month.**

The 2026-09-09 version said "one *photo* of your dish". The campaign studio takes
a sentence, not a photo (`app/api/studios/campaign/route.ts` InputSchema), and the
segment page's H1 repeated the claim until 2026-09-11. Photos are the photoshoot
studio's job — something a customer finds after they stay, not the door.

---

## 2. Who it is for

**An independent food or retail business in Dubai that sells through Instagram.**
One to three locations. The owner, or one person they pay, writes the posts. They
are not a marketing agency and never will be.

`messages/ar.json` (`landing.hero.definition`) already names this audience —
"للمطاعم والمتاجر والعيادات في الإمارات والخليج". This file narrows that to the
segment that will be **walked to in person**: `docs/superpowers/` records the
plan's Karama loop, twenty businesses at a time.

**Explicitly not the buyer, for now:**

| Not | Why |
|---|---|
| Agencies running client rosters | That is the fight crewzo.ai has picked (Agency $199, 10 Brand DNAs, "a full client roster under one login"). It needs volume and a seat model this product does not have. `maxProjects` supports it; nothing markets to it. |
| The whole Gulf | Saudi is the bigger market and crewzo is Riyadh-first with a named Khaleeji claim. Contesting a dialect wedge from Dubai, badly, is the worst available outcome — see §4. |
| Anyone who wants video | Not built. See §6. |

---

## 3. The one job, the one door, and the offer

**The job:** "I need this week's posts and I do not have a photographer, a
copywriter, or an hour."

**The door: the campaign studio, and only it.** One brief → nine posts with
captions and hashtags.

Everything else in the product is what they find *after* they stay. The other
eight studios are not de-emphasised in the app; they are de-emphasised in the
**pitch**. A landing page that offers nine things offers no thing.

**Why campaign and not the image creator**, which is cheaper and more impressive:
a picture is a nice moment; nine posts is a *week of work removed*. The second is
what a shop owner will pay a card for.

**The offer is the proof** — every number below is read from code, and every
surface that quotes it reads `lib/credits/offer.ts`:

- **Sign up free, no card.** A new account holds no monthly credits
  (`PLANS.free.credits` = 0, and migration 048 makes the database agree).
- **Try one full campaign on us.** `TRIAL_CREDITS` = 5, granted on finishing *or
  skipping* onboarding, against a text-only campaign's 3
  (`campaignCostBands().text`). `scripts/tests/segment-pages.test.ts` fails the
  build if a price change makes the trial smaller than one campaign, because the
  copy says it in words.
- **Then $2 a month is eight complete nine-post Arabic campaigns.** `PLANS.entry`:
  25 credits at 3 a campaign. One click from any "not enough credits" moment to the
  checkout (`components/shared/UnlockButton.tsx`).

**Why not free any more** (decided by the founder 2026-09-10): a free month was the
strongest sentence on the page and also a cost with no floor — signup is open, the
image provider bills per call, and nothing distinguished a shop owner from a
throwaway address. $2 keeps the sentence nearly as strong ("8 campaigns for $2")
and puts a card between the product and abuse. The trial keeps the part that
mattered: nobody pays before they have seen their own nine posts.

**What this repricing turned off, on purpose.** The referral reward used to be paid
at signup; at $2 that made a shared link worth the whole Entry plan for nothing.
Since migration 048 it is paid to both sides when the friend first pays.

---

## 4. The voice: ONE register — clear professional Arabic

**The marketing surface and the product speak one register: clear, professional
Arabic that a Gulf reader and an Egyptian reader both read as natural.** No
Egyptian colloquial (`دلوقتي`, `عايز`, `مش`), no Gulf colloquial (`تبي`, `إيش`,
`الحين`).

The 2026-09-09 version of this section chose "Egyptian-leaning, the founder's own".
The founder reversed it the same day: colloquial Egyptian reads as careless to the
Gulf customer this product is sold to, and a register that needs the founder to
check it drifts the moment someone else writes a string. Measured then: 278
colloquial occurrences across the product; after the sweep, 0 against the gate's
list — and the 2026-09-11 review found 18 more constructions the list had never
named (`قولها`, `اللي`, `تقدر`, `على كيفك`…), including in the `/ar` headline. They
are in `scripts/tests/one-dialect.test.ts` now, and so is the rule: a token list
that reports zero proves only that the listed tokens are absent.

**This governs what PyraSuite says, not what it writes for the customer.** Dialect
stays a *product feature the customer picks*: the campaign route and
`DIALECT_PROMPTS` carry the real five-value set (`formal, saudi, emirati,
egyptian, gulf`). Selling in one voice and generating in five is not a
contradiction — it is the product working.

**There is no Levantine voice.** Removed from the public copy 2026-09-09; it was
never in the code.

---

## 5. What must be true of every public string

1. **A price is code.** No credit figure is typed into a translation
   (`scripts/tests/studio-pages.test.ts` fails the build; scope widened
   2026-09-09 to `landing` and `pricingPage`, and 2026-09-11 to `auth`, where the
   signup subtitle said "25 credits"). The landing cards' price badges are
   computed since 2026-09-11 — the campaign card said a typed "12" beside an FAQ
   saying 3.
2. **A capability claim names a file.** The repo rule, applied to copy: if a
   sentence promises something, a `file:line` must prove it. Four claims failed
   this on 2026-09-09 — a Levantine voice, the brand logo reaching the model,
   the voiceover rate, and the flat photoshoot/campaign prices — and all four
   were deleted or corrected rather than built. A fifth, "one photo of your dish",
   on 2026-09-11.
3. **No superlative that cannot be checked.** "المنصة العربية الأولى" is gone.
   "مبنية بالعربي" replaces it and is provable.
4. **When copy and code disagree, the copy loses.** Every time. Deleting takes
   five minutes; the alternative is a multi-week build to make a sentence true.

---

## 6. What we do not build to match a competitor

Recorded here so the answer is already decided when the temptation arrives.

- **Video.** `reconcile_orphaned_generations()` runs a 30-minute window
  (`028:142`), so any render longer than that is an orphan by the system's own
  definition and gets refunded from the ledger. `video: 10` at Pro is $0.29 a
  generation against a Veo-class render costing multiples. Job rows, polling,
  large-file storage and a split credit lifecycle are 4–8 weeks for one person.
- **Carousel, motion graphics, logo generator, lead magnets, trend research.**
  Nine studios and zero customers; a tenth changes nothing. Matching a
  competitor's tool count *is* the disorganisation, in product clothing.
- **A data-sovereignty pitch.** The box is in Kuala Lumpur, outside the GCC, and
  generation fans out to Google, OpenAI, Replicate and ElevenLabs. This would be
  the first genuinely misleading claim on the site.
- **`/compare/crewzo`.** Manufactures demand for a competitor nobody searches for
  and hands them a backlink.

---

## 7. How this file is proved wrong

**The number:** distinct people, excluding the founder, who completed a
generation on **two different calendar days** (Dubai time) in 30 days, from
`user_events` — read it at `/admin/activation`.

**Target: 5.**

| Result | Reading |
|---|---|
| ≥ 5 | The segment is right. Pour more of the same people in. |
| 1–4 | The segment is plausible; the second session is broken. Fix that first. |
| 0, with 20+ conversations held | **This file is wrong.** Change the segment, keep the loop, do not change the product. |
| 0, with fewer than 20 | The plan was not run. |

**Since 2026-09-11 read it together with a second number:** Entry checkouts
started (`InitiateCheckout`) against Entry subscriptions granted. The trial pays
for the FIRST generation, so the metric above still measures the product — but the
second day now usually needs $2, and a zero with many started-and-abandoned
checkouts means **the price or the checkout**, not the segment. The decision table
above assumes a free second session; do not read a price failure as a segment
failure.

Record the conversations held alongside it — without that input the output is
unreadable.

**A note on what this file is not.** It records a decision taken on measured
evidence about a competitor and about this codebase. It records **no evidence
about customers**, because as of 2026-09-11 nothing in this repository evidences
a single non-founder user. §7 exists to change that, and until it returns a
number this file is a hypothesis with a deadline.
