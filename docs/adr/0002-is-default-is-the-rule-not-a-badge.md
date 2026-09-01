# `brand_kits.is_default` is the rule, not a badge

The last step of resolving the Working Identity is "the account default". We are making
`is_default` actually mean that: `NOT NULL DEFAULT false`, a partial unique index so one owner
cannot hold two defaults, and the first Brand Kit a customer creates is promoted on insert.

## Why this needed deciding at all

It had never once worked, and that was measured rather than suspected. On the live database:
**zero rows carry `is_default = true`**, of two rows total. Nothing in the product sets it on
create — the form submits thirteen columns and that is not one of them, the POST route inserts
`{ user_id, ...input }` with no promotion, and the `002:29` trigger only ever *clears* the flag on
other rows, never sets one. So both resolvers fell through to their tiebreaker, and their
tiebreaker is `created_at DESC`.

**"The default kit" has therefore always meant "the newest kit."** Create a second Brand Kit for a
one-off client and every Studio silently switches identity. Nothing says so, and the paid Plans
sell 3 and 10 kits.

The column being nullable also made the two resolvers disagree in a way a comment in the code
explicitly claimed was impossible. Postgres orders a boolean `DESC` as `NULLS FIRST`, and
supabase-js emits no nulls directive when `nullsFirst` is undefined, so the server ranks a
`NULL` row **above** a genuinely `true` one — while the client's `find(kit => kit.is_default)`
skips the `NULL` and lands on the true one. Same customer, same data, two identities.

## Considered options

- **Make it a badge and write "newest wins" down as the rule.** Rejected. It is defensible only
  until a customer has two kits, and then it means creating a kit for a one-off client steals the
  identity of all their other work. A behaviour nobody would choose on purpose does not become
  correct by being documented.
- **Leave it.** Rejected: the divergence above is live, and `lib/supabase/types.ts` declares the
  column `boolean` while the database allows `NULL`, so TypeScript is asserting something the data
  can violate.

## Consequences

- Pay the migration now, at two rows. `SET NOT NULL` needs a backfill, and the backfill is a
  production write; at 500 customers it is a data migration with a rollback plan.
- Ordering on the column stops needing a nulls directive, which removes a footgun rather than
  documenting one, and `types.ts:99` becomes true.
- Promotion happens on insert, in the POST route — the onboarding journey the whole brand-context
  work was built for is currently carried entirely by `|| brandKits[0]`.
