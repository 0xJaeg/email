# syntax=docker/dockerfile:1

# One image for the whole pnpm + Turbo monorepo. compose.coolify.yaml runs this
# same image as three services (web / api / worker) with different start
# commands, so it carries every workspace's deps + build output. Dev deps are
# kept on purpose: web needs them to build, and api/worker run via `tsx`.
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Non-interactive corepack so the pinned pnpm version downloads without a prompt.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# 1. Fetch deps into the pnpm store keyed only on the lockfile, so this layer is
#    cached across source-only changes. The manifest is copied first so corepack
#    pins pnpm@<packageManager>.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# 2. Copy the source and link from the already-fetched store, offline.
COPY . .
RUN pnpm install --offline --frozen-lockfile

# 3. Build @workspace/actions (tsc -> dist) + apps/web (next build) via turbo.
#    NEXT_PUBLIC_* inline into the browser bundle at build time, so they must be
#    present here — Coolify passes them as build args (see compose.coolify.yaml).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
RUN pnpm build

# web -> 3000, api -> 3001 (each service sets its own command + PORT in compose).
EXPOSE 3000 3001

# Sensible default; every compose service overrides `command`.
CMD ["pnpm", "--filter", "web", "start"]
