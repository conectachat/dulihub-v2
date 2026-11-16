# DuliHub 2 na VPS (Easypanel).
#
# Duas etapas: a primeira instala com o bun (o mesmo do CI e da máquina —
# `npm install` quebra num conflito de peer do Tailwind) e monta com o Node; a
# segunda só roda o servidor Node enxuto que o Next gera (`output:
# "standalone"`). A imagem final não leva código-fonte, testes nem
# dependências de build.
#
# Montar com o Node, e não com o bun: na imagem só do bun, o `next build`
# corria inteiro e o bun caía ao encerrar ("Segmentation fault", 16/nov, no
# primeiro deploy). Com o Node instalado, o `bun run` chama o Node de verdade
# para o Next, e o bun só instala os pacotes e empacota o service worker.

# ---- construir ----------------------------------------------------------------
FROM node:24-slim AS build
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# As duas chaves públicas do Supabase entram no código do navegador **na hora
# do build** — por isso chegam como argumento, e não só no ambiente de
# execução. São públicas por design (protegidas pela RLS).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# A versão nomeia o cache do service worker: cada deploy precisa de uma nova,
# senão o navegador continua com a casca antiga. O Easypanel manda o hash do
# commit em `GIT_SHA`; sem ele, vale o carimbo de data e hora do build.
ARG GIT_SHA
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_TELEMETRY_DISABLED=1

RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    || (echo "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no Environment do Easypanel." && exit 1)

# O mesmo que `bun run build`, com o Node chamado pelo nome: não depende de o
# bun escolher o Node pelo cabeçalho do script do Next.
RUN bun run sw     && NEXT_PUBLIC_VERSAO="${GIT_SHA:-$(date -u +%Y%m%d%H%M)}" node node_modules/next/dist/bin/next build

# ---- rodar --------------------------------------------------------------------
FROM node:24-alpine AS app
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Usuário sem privilégio: se algo der errado no app, não é root no container.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public

USER app
EXPOSE 3000
CMD ["node", "server.js"]
