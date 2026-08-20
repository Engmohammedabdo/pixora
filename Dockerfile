FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args for env vars needed at build time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_DEFAULT_LOCALE=ar

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Fonts for the free-plan watermark. lib/image/watermark.ts paints "PyraSuite"
# as SVG <text>, which sharp rasterises through librsvg -> pango -> fontconfig.
# On a bare node:*-alpine there is not one font file on the system, and pango
# does not treat that as an error: it renders every character as .notdef — an
# empty box — and returns success. So the watermark WAS being composited, and
# every free-plan image shipped with a row of meaningless rectangles instead of
# the product name. Verified against a real production asset before this line
# existed; the same code on a host with fonts renders correctly, which is what
# made it invisible in development.
#
# ttf-dejavu covers the Latin text we draw and is what fontconfig resolves the
# `sans-serif` fallback to, so the family list in watermark.ts keeps working.
# assertTextRenderingAvailable() in that file fails the request closed if this
# layer is ever dropped, rather than going back to shipping boxes.
RUN apk add --no-cache fontconfig ttf-dejavu && fc-cache -f
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
