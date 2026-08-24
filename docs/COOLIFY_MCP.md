# Coolify MCP — managing the box from Claude Code

Lets Claude Code read and operate the Coolify instance that hosts this app **and**
the self-hosted Supabase service: diagnose a failing container, tail logs, list
env var *names*, trigger a redeploy.

Server: [`@masonator/coolify-mcp`](https://github.com/StuMason/coolify-mcp) (MIT),
pinned to `2.19.4` in `.mcp.json`. Pinned rather than `@latest` on purpose — this
package holds a credential to production infrastructure, so a version bump should
be a decision, not a side effect of a restart.

## State

| Thing | State |
|-------|-------|
| `.mcp.json` — server definition | ✅ written, valid JSON |
| Coolify API reachable | ✅ verified — `GET https://coolify.pyramedia.cloud/api/v1/version` → `401 Unauthenticated`, i.e. the API is enabled and answering |
| Server boots on this Windows box | ✅ verified — plain `npx` (no `cmd /c` wrapper), clean MCP handshake, `serverInfo.name: coolify`, `version: 2.19.4` |
| `coolify` enabled in `.claude/settings.local.json` | ✅ added to `enabledMcpjsonServers` |
| Token | ✅ **set** — as the Windows **User** variable `COOLIFY_MCP_TOKEN` (50 chars). Note the name: `.mcp.json` passes it to the server *as* `COOLIFY_ACCESS_TOKEN`, which is the name the package reads. |
| Any tool call actually succeeding against the estate | ❌ never run — untestable until the token exists |

## The token

**The token is not in this repo and must never be.** `.mcp.json` holds only a
`${...}` reference, never a value — but note it is currently **untracked and not
gitignored**, so a value pasted into it directly is one `git add .` from being
committed. Keep the value in the environment.

**The two names are not the same and that is deliberate.** The `env` block's *key*
is what the child process sees and must stay `COOLIFY_ACCESS_TOKEN` — the package
reads that name. The *value* is `${COOLIFY_MCP_TOKEN}`, the variable that actually
exists on this machine. An earlier version of this doc had both sides reading
`COOLIFY_ACCESS_TOKEN`, which expanded to nothing and shipped the literal string
`${COOLIFY_ACCESS_TOKEN}` as the bearer token — a clean `401` that looks exactly
like a revoked token.

### 1. Mint it

Coolify → **Keys & Tokens → API tokens → Create New Token**. Scope:

```
[x] read      [x] deploy
[ ] read:sensitive   [ ] write   [ ] root
```

`read + deploy` covers diagnosis, logs and redeploys. It cannot delete anything,
cannot create servers, and cannot read secret *values* — so the live Stripe and
Supabase keys stay out of reach of a token sitting in a plaintext file on a laptop.

Widen it only for a specific job, then narrow it again. Setting the app service's
`EMAIL_FROM` / `SMTP_HOST` (see `docs/EMAIL_SETUP.md`) is the one known task that
would need `write` — that is a reason to issue a second token for an afternoon,
not a reason to make this one permanent.

### 2. Store it

Currently stored as a Windows **User** environment variable named
`COOLIFY_MCP_TOKEN`, which the `npx` child process inherits unconditionally:

```powershell
[Environment]::SetEnvironmentVariable('COOLIFY_MCP_TOKEN','<token>','User')
```

The alternative is an `env` block in `.claude/settings.local.json`, which
`.gitignore:45` excludes — use whichever, but only one, and make sure
`.mcp.json`'s value side names it.

Then **restart Claude Code** — the environment is read at session start, so a
running session will not pick it up.

### 3. Prove it works

Do not trust "the server is connected" — that only means the process started, not
that the token is valid. `/mcp` should list **coolify**, and then a real call must
return real data:

```
get_infrastructure_overview
```

**A bad token does not throw.** Measured against this instance with a deliberately
invalid token: the call returns a *successful* result whose counts are all zero and
whose real verdict is buried in an `errors[]` array —

```json
{ "summary": { "servers": 0, "projects": 0, "applications": 0, ... },
  "errors": ["servers: CoolifyApiError: Unauthenticated. ..."] }
```

So the pass condition is **`errors` empty AND the counts non-zero**, not "the tool
returned". An empty estate and a rejected token are the same shape otherwise.

That error text also names a trap worth knowing before you blame the scopes: on
Coolify **v4.2+ a token owned by a Member-role user is read-only regardless of the
scopes ticked on the token** — it cannot deploy, start, stop or modify. If `read`
works and `deploy` is refused, check the owning user's role, not the token.

## Rotation

Revoking is Coolify → Keys & Tokens → delete the token. Nothing in the app reads
`COOLIFY_ACCESS_TOKEN`; it is tooling-only, so revoking it cannot break production.
It is **not** part of `docs/ROTATE_SECRETS.md`'s blast radius.
