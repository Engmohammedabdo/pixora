# PyraSuite

The domain glossary. One entry per concept, defining what it **is** — never how it is
built, stored or resolved. Implementation lives in the code; state lives in `CLAUDE.md`.

If a term here and a term in the code disagree, that is a defect in one of them. Say so.

## Language

### The customer's work

**Brand Kit**:
The identity of one business a customer produces work for — its name, look, voice and
the facts about the business itself. A customer may hold several.
_Arabic_: براند كِت
_Avoid_: brand, brand profile, identity kit

**Project**:
A named workspace for one client of the customer's, which a Brand Kit may be attached to.
Agencies use it to keep one client's work apart from another's.
_Arabic_: مشروع
_Avoid_: workspace, client, folder

**Business Context**:
The subset of a Brand Kit that describes the business rather than its appearance —
industry, description, target audience, city. It is what makes one customer's output
differ from another's.
_Arabic_: بيانات النشاط
_Avoid_: brand context, business info, brand DNA

**Working Identity**:
The Brand Kit a single Generation actually ran under. A customer picks it, inherits it
from the Project they are in, or falls back to their default — but exactly one Brand Kit,
or none, is in force for any Generation, and the customer is entitled to see which.
_Arabic_: الهوية الشغّالة
_Avoid_: selected kit, active brand, current brand
> Provisional. Named 2026-09-01 while designing the module that decides it; rename here
> first if a better word is found.

### Producing work

**Studio**:
One tool the customer generates with — creator, campaign, edit, photoshoot, voiceover,
plan, analysis, storyboard, prompt-builder. Each has its own price and its own output.
_Arabic_: استوديو
_Avoid_: tool, feature, generator

**Generation**:
One run of one Studio: the customer's request, what it cost, and what came back. It is
the unit the ledger, the refund and the customer's history are all keyed to.
_Arabic_: عملية توليد
_Avoid_: job, run, request, task

**Asset**:
A finished file a Generation produced — an image or an audio file — kept so the customer
can find it again after the tab closes.
_Arabic_: ملف
_Avoid_: output, artifact, file, media

**Pyra**:
The single character the customer deals with for everything generated. Pyra is one
identity to the customer regardless of how many engines answer behind her.
_Arabic_: بايرا 🦊
_Avoid_: the AI, the model, the engine, any provider's name

### Money

**Credit**:
The unit a customer spends on a Generation and the only currency inside the product.
_Arabic_: كريدت
_Avoid_: token, point, unit

**Reservation**:
Credits taken from the balance when a Generation starts, before any work is delivered.
_Arabic_: حجز
_Avoid_: hold, deduction, charge

**Refund**:
Credits returned to the balance because the work was not delivered. A Refund is only real
once it has landed.
_Arabic_: استرجاع
_Avoid_: reversal, rollback, credit back

**Charge**:
What the customer was finally billed for a Generation: the Reservation less a Refund that
landed. Never an intention.
_Arabic_: المبلغ المخصوم
_Avoid_: cost, price, credits used

**Plan**:
The subscription tier a customer holds, which decides their monthly Credits, the
resolution they receive, whether their images carry a watermark, and which voice serves
them.
_Arabic_: الباقة
_Avoid_: tier, subscription, package
> Collides with the **plan** Studio. When ambiguous, write "the customer's Plan" or
> "the plan Studio".
