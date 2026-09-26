# consoled: the BFF, with the SPA embedded in it.
#
# Three stages: the UI is compiled into the Go binary, so the web build has to
# finish before the Go build starts, and neither toolchain belongs in the
# runtime image. Debian-based build stages match the Debian-derived runtime and
# remove a class of musl-vs-glibc "works on my builder" differences.
#
# The web stage is a static Vite build that lands in web/dist.

# --- 1. the SPA ------------------------------------------------------------
FROM node:24-bookworm-slim AS web
WORKDIR /src/web
# The private @riseaicloud/* registry auth is passed as a build secret, never
# baked into a layer: --mount=type=secret,id=npmrc,target=/src/web/.npmrc
COPY web/package.json web/package-lock.json* web/pnpm-lock.yaml* ./
# @riseaicloud/* resolve to file:./vendor/..., so the install needs them present.
COPY web/vendor ./vendor
RUN --mount=type=secret,id=npmrc,target=/src/web/.npmrc \
    corepack enable && (pnpm install --frozen-lockfile || npm ci --no-audit --no-fund)
COPY web/ ./
RUN npm run build

# --- 2. the binary ---------------------------------------------------------
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# web/dist ships a placeholder so `go build` works without node; the real build
# lands here and is what gets embedded.
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
      -o /out/consoled ./cmd/consoled

# --- 3. runtime ------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/consoled /consoled
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/consoled"]
CMD ["--config", "/etc/consoled/console.yaml"]
