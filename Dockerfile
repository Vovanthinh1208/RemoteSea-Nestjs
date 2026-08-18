# ─── Base ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

# ─── Dependencies (with dev deps, for build) ───────────────────────────────
FROM base AS deps
# Toolchain for native-module compile fallback (bcrypt): on musl/alpine a
# prebuilt binary may not be available for every arch, in which case npm ci
# builds it from source. No-op layer cost when a prebuild is found.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ─── Build ──────────────────────────────────────────────────────────────────
FROM base AS build
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN NODE_OPTIONS=--max-old-space-size=8192 npm run build; \
    echo "--- build stage: /app/dist contents ---"; \
    ls -la /app/dist || echo "/app/dist does not exist"; \
    test -f /app/dist/main.js || (echo "ERROR: /app/dist/main.js was not produced by the build" && exit 1)

# ─── Production dependencies only ──────────────────────────────────────────
FROM base AS prod-deps
# Same native-module fallback as the deps stage (bcrypt) — the toolchain stays
# in this stage only; the runner copies just node_modules.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
# --ignore-scripts: package.json's postinstall runs `prisma generate`, which
# needs prisma/schema.prisma — not copied into this stage (only package.json/
# package-lock.json are, above), so it would fail with "schema not found".
# This stage is only meant to produce a clean prod node_modules; the runner
# below copies the *real* generated client from the build stage instead (see
# the COPY --from=build lines further down), so running generate here would
# be both broken and wasted work even if it were fixed by copying the schema.
RUN npm ci --omit=dev --ignore-scripts

# ─── Runner ─────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# ~75% of the production container's 1GB memory limit. Left unset, V8 sizes
# its heap from its own default heuristic instead of the container's actual
# limit, growing past it under memory pressure and getting hard OOM-killed by
# the orchestrator instead of GC-ing proactively as it approaches a
# deliberately-set ceiling. Revisit this value if the container's memory
# limit ever changes.
ENV NODE_OPTIONS=--max-old-space-size=768
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=prod-deps /app/node_modules ./node_modules
# Generated Prisma client (engine binaries + query engine) from the build stage,
# since prod-deps skips `prisma generate` (the CLI is a devDependency).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./

USER nestjs

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/main"]
