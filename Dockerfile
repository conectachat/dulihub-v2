# DuliHub 2 na VPS (Easypanel).
#
# Duas etapas: a primeira instala e constrói com o bun (o mesmo do CI e da
# máquina — `npm install` quebra num conflito de peer do Tailwind); a segunda
# só roda o servidor Node enxuto que o Next gera (`output: "standalone"`).
# A imagem final não leva código-fonte, testes nem dependências de build.

# ---- construir ----------------------------------------------------------------
FROM oven/bun:1.3.14 AS build
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
# senão o navegador continua com a casca antiga. Sem o hash do commit, vale
# o carimbo de data e hora do build.
ARG NEXT_PUBLIC_VERSAO
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_TELEMETRY_DISABLED=1

RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
    || (echo "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no Environment do Easypanel." && exit 1)

RUN NEXT_PUBLIC_VERSAO="${NEXT_PUBLIC_VERSAO:-$(date -u +%Y%m%d%H%M)}" bun run build

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
