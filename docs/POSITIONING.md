# POSITIONING — who PyraSuite is for

> Written 2026-09-09, after crewzo.ai appeared. One page. Every copy, page and
> pricing decision cites this file; if a change cannot cite it, it is out of scope.
>
> This is a **decision**, not a description. It is falsifiable, and §7 says how.

---

## 1. The one sentence

**PyraSuite turns one photo of your dish into a week of Arabic Instagram posts —
for independent restaurants and shops in Dubai, free to try with no card.**

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

## 3. The one job, and the one door

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

**The free tier is the proof, and it is the strongest true sentence available:**
a text-only campaign costs **3 credits** (`lib/credits/campaign-cost.ts`, charged
at `campaign/route.ts`) against the free plan's **25** (`lib/stripe/plans.ts`).
That is **eight complete nine-post Arabic campaigns a month, with no card.**
crewzo's cheapest entry is $3 and a card. Say this everywhere; it was on no
surface as of 2026-09-09.

---

## 4. The voice: ONE register, Egyptian-leaning

**The marketing surface speaks in one dialect. It is Egyptian-leaning — the
founder's own.**

Measured 2026-09-09 on the shipped `/ar`: the page mixes both registers, with
unmistakably Egyptian phrasing ("طب وأنا ليه ما أستخدمش", "دلوقتي") sitting beside
unmistakably Gulf phrasing ("سؤال عدل", "إيش تبي", "أبي صورة"). A Gulf reader
clocks a register switch faster than an English loanword, and crewzo's entire
wedge is a named Khaleeji claim.

Three reasons this resolves toward Egyptian rather than toward Khaleeji:

1. **Faking a dialect badly against someone who has named it is worse than
   conceding it.** Concede Riyadh deliberately.
2. Dubai's independent-SMB owner base is heavily Egyptian and Levantine
   expatriate — the people actually being walked to.
3. It is the founder's own register, so it stays consistent without effort. A
   voice that needs checking drifts back.

**This governs the marketing surface only.** Dialect stays a *product feature the
customer picks*: `DIALECT_PROMPTS` in `lib/ai/tts-router.ts` and the campaign
route both carry the real five-value set (`formal, saudi, emirati, egyptian,
gulf`). Selling in one voice and generating in five is not a contradiction — it
is the product working.

**There is no Levantine voice.** Removed from the public copy 2026-09-09; it was
never in the code.

---

## 5. What must be true of every public string

1. **A price is code.** No credit figure is typed into a translation
   (`scripts/tests/studio-pages.test.ts` fails the build; scope widened
   2026-09-09 to `landing` and `pricingPage`, which is where sixteen were hiding).
2. **A capability claim names a file.** The repo rule, applied to copy: if a
   sentence promises something, a `file:line` must prove it. Four claims failed
   this on 2026-09-09 — a Levantine voice, the brand logo reaching the model,
   the voiceover rate, and the flat photoshoot/campaign prices — and all four
   were deleted or corrected rather than built.
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
generation on **two different calendar days** in 30 days, from `user_events`.

**Target: 5.**

| Result | Reading |
|---|---|
| ≥ 5 | The segment is right. Pour more of the same people in. |
| 1–4 | The segment is plausible; the second session is broken. Fix that first. |
| 0, with 20+ conversations held | **This file is wrong.** Change the segment, keep the loop, do not change the product. |
| 0, with fewer than 20 | The plan was not run. |

Record the conversations held alongside it — without that input the output is
unreadable.

**A note on what this file is not.** It records a decision taken on measured
evidence about a competitor and about this codebase. It records **no evidence
about customers**, because as of 2026-09-09 nothing in this repository evidences
a single non-founder user. §7 exists to change that, and until it returns a
number this file is a hypothesis with a deadline.
