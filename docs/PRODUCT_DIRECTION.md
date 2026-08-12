# Product direction — the "should Pyra become an agent?" question

**Status: DISCUSSED, NOT DECIDED. Nothing here is built.**

This file records a conversation from **2026-08-12**, so it can be picked up later
without re-deriving it. It is a discussion record, not a plan and not a commitment.
That distinction matters in this repo: the July 2026 audit found 100 documented
claims of which 62 were wrong, almost all because someone wrote down an intention and
a later reader took it for a fact. **If any of this ever gets built, it moves to
`docs/CHANGELOG.md` with proof. Until then it is an idea.**

---

## The question, as asked

> The project is built around the user writing a prompt. Should we evolve it into an
> AI agent? We call it "Pyra AI" but really it is prompts. If we developed the system
> into an agent — what do you think?

---

## What the code actually is today

Verified by reading it on 2026-08-12, not from documentation.

| | State | Proof |
|---|---|---|
| Each studio | **One model call** (campaign makes two) — no loop, no planning, no tool use | `app/api/studios/*/route.ts` |
| Model routing | Real multi-provider router with automatic fallback | `lib/ai/router.ts` |
| Brand **colours + name + voice** | ✅ reach the model | `lib/ai/prompts/creator.ts:22-25` |
| Brand **logo + fonts** | ❌ never reach any prompt | no reference anywhere in `lib/ai/` |
| Text inside generated images | ❌ **actively forbidden** | `lib/ai/prompts/creator.ts:36` |
| Memory between generations | ❌ none | — |
| Job queue / background execution | ❌ none — every route is synchronous request/response | no queue library anywhere |

So "it is just prompts" is unfair to it: a multi-model router with fallback is real
engineering. But it is accurate that **nothing in the system plans, decides, or
iterates.** There is no agent.

---

## The reframe that matters

The interesting finding is not about architecture. It is this:

> **The product's promise is already agentic — and the user is the one executing it.**

The pitch is "turns any idea into a complete marketing campaign". To actually get that
today, the user must know that a campaign needs: analysis → plan → images → product
shots → voiceover. They must sequence those studios themselves, and carry the output
of each into the next by hand.

**That knowledge is the product's value, and it currently lives in the customer's head
rather than in the platform.**

### On the branding question specifically

Calling a model router "Pyra AI" is not dishonest. Every AI product is a wrapper
around models; the `CLAUDE.md` branding rules are sound and worth keeping. What would
be dishonest is claiming a capability that does not exist — and "transforms any idea
into a complete campaign" is close to that line while the assembly is manual.

The fix for that is either **build the orchestration** or **describe the product as
what it is: nine strong tools**. Both are honest. Doing neither is not.

---

## What an agent would break here

Not generic risks — these are specific to this codebase.

### 1. It breaks the credit model, which was just hardened

Billing is built on a **fixed price per action**: campaign 12, photoshoot 8,
storyboard 14, plan 5 (`lib/credits/costs.ts`). The whole reserve → deduct → refund
chain assumes the cost is known before the work starts.

An agent that chooses its own steps has a **non-deterministic cost**. A customer who
pays 12 credits today might pay 60. That destroys trust faster than any bug, and it
undoes the money-path work from 2026-07-21 and 2026-08-02.

### 2. There is no infrastructure to run it

Every API route is synchronous. An agent doing 5–10 steps takes minutes; a Next.js
route handler and a browser waiting on `fetch` cannot hold that. It needs a job queue,
step-level state, and a polling or streaming UI. **That is infrastructure work, not a
feature.**

### 3. Failure handling multiplies

Today: generation fails → refund. With an agent: step 3 of 7 fails — refund
everything? Partially? The campaign studio already does partial refunds and that alone
was intricate (`app/api/studios/campaign/route.ts:234`).

### 4. Arabic reasoning is the weak axis

Agent loops lean hard on the model's planning quality, and Arabic reasoning is weaker
than English across the board. An agent that plans in Arabic and is subtly wrong is
worse than a prompt that reliably produces one good output.

---

## The middle path (the actual suggestion)

Not "agent" versus "prompts". **A planner that asks permission:**

```
User: "I'm launching a breakfast restaurant in Dubai"
   ↓
Pyra proposes:  competitor analysis → content plan → 6 images → voiceover
                Cost: 31 credits                    [edit]  [start]
   ↓
User approves → runs in order, each step feeding the next
```

Why this shape:

- **Agentic where it counts** — it plans, selects tools, and carries context between
  steps. That is the part the customer cannot do for themselves.
- **Cost is quoted before execution**, so the fixed-price credit model survives intact.
  This is the key insight: approval is what makes agentic behaviour compatible with
  prepaid credits.
- **Reuses all nine studios unchanged.** No rebuild.

---

## The bigger gap, which is not the agent

`lib/ai/prompts/creator.ts:36` instructs the model:

```
NO extra text, logos, or watermarks unless specified
```

**An Arabic marketing product cannot put Arabic text on an image.** A marketer in Dubai
wants a poster with Arabic on it. That is the thing they would pay for.

Honestly assessed, this is a sharper gap than the absence of an agent — and a stronger
differentiator. No global competitor handles Arabic typography in generated images
well. "We have an agent" differentiates from nobody in 2026; everyone claims it.

---

## Recommendation

**Do not build the agent now.** Not because it is wrong — because the timing is.

- Zero paying customers.
- The invite-only MVP shipped 2026-08-06.
- **The information that decides this question is what the first cohort actually does**,
  and that information does not exist yet.

They may only ever use one studio, in which case orchestration is not their problem.
Or they may ask for Arabic text on day one.

Suggested order:

1. **Now** — invite the cohort, watch. Free.
2. **Next, regardless of what they say** — Arabic text inside images, and the brand
   logo reaching the model. Smallest work, largest visible difference.
3. **Then, only if usage supports it** — the approval-based planner above.
4. **Later** — memory and critique loops ("make it more luxurious" without starting over).

---

## Open questions — answer these before deciding

1. **What does "agent" mean to you concretely?** One that runs a whole campaign
   autonomously, or one you converse with and steer? These are completely different
   builds.
2. **Who is the target user?** A professional marketer who wants control, or a shop
   owner who does not understand marketing and wants it done for them? **The first
   type dislikes agents; the second needs them.** This single answer changes the
   recommendation.
3. **Has the founder used the product end to end as a customer** — built one complete
   campaign start to finish? If not, that is the cheapest and most informative thing
   to do before any architectural decision.
