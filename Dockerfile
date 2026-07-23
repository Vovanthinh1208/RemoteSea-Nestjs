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
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

# ─── Production dependencies only ──────────────────────────────────────────
FROM base AS prod-deps
# Same native-module fallback as the deps stage (bcrypt) — the toolchain stays
# in this stage only; the runner copies just node_modules.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Runner ─────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
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
