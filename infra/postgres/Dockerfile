# Keep PostgreSQL 17 and Alpine to preserve the existing volume's libc/collation environment.
FROM postgres:17-alpine AS builder
ARG PGVECTOR_VERSION=0.8.1
RUN apk add --no-cache build-base curl
RUN curl -fsSL "https://github.com/pgvector/pgvector/archive/refs/tags/v${PGVECTOR_VERSION}.tar.gz" -o /tmp/pgvector.tar.gz \
    && tar -xzf /tmp/pgvector.tar.gz -C /tmp \
    && cd "/tmp/pgvector-${PGVECTOR_VERSION}" \
    && make OPTFLAGS="" with_llvm=no \
    && make install with_llvm=no DESTDIR=/extension

FROM postgres:17-alpine
COPY --from=builder /extension/usr/local/ /usr/local/
