#!/bin/sh
# Build the pinned upstream commit plus vendor/jax-js/patches, or compare every artifact.
# JAX_FORK_WORKDIR=<dir> reuses a clone at <dir>/jax-js; its checkout is never changed.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
VENDOR="$ROOT/vendor/jax-js"
. "$VENDOR/build.env"
case "${1:-}" in
  '') CHECK=false ;;
  --check) CHECK=true ;;
  *) echo 'Usage: build-jax-fork.sh [--check]' >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { echo 'Usage: build-jax-fork.sh [--check]' >&2; exit 2; }
if [ "$(node --version)" != "v$JAX_NODE_VERSION" ] || [ "$(pnpm --version)" != "$JAX_PNPM_VERSION" ]; then
  echo "The fork build requires Node $JAX_NODE_VERSION and pnpm $JAX_PNPM_VERSION (vendor/jax-js/build.env)." >&2
  exit 1
fi
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT HUP INT TERM
CACHE="${JAX_FORK_WORKDIR:-$SCRATCH/cache}/jax-js"
if [ ! -d "$CACHE/.git" ]; then
  mkdir -p "$(dirname "$CACHE")"
  git clone --quiet https://github.com/ekzhang/jax-js.git "$CACHE"
fi
# A reused clone is just an object cache. Do not reset a developer's checkout or apply patches
# to it, and fetch only when it does not already have the pinned source.
if ! git -C "$CACHE" cat-file -e "$JAX_BASE_COMMIT^{commit}" 2>/dev/null; then
  git -C "$CACHE" fetch --quiet origin "$JAX_BASE_COMMIT"
fi
git clone --quiet --no-hardlinks --no-checkout "$CACHE" "$SCRATCH/source"
cd "$SCRATCH/source"
git checkout --quiet --detach "$JAX_BASE_COMMIT"
[ "$(git rev-parse "$JAX_BASE_TAG^{commit}")" = "$JAX_BASE_COMMIT" ] || {
  echo "$JAX_BASE_TAG does not name pinned commit $JAX_BASE_COMMIT." >&2; exit 1;
}
[ "$(node -p 'JSON.parse(require("fs").readFileSync("package.json")).packageManager')" = "pnpm@$JAX_PNPM_VERSION" ] || {
  echo 'The upstream packageManager differs from vendor/jax-js/build.env.' >&2; exit 1;
}
GIT_COMMITTER_NAME="build-jax-fork" GIT_COMMITTER_EMAIL="build-jax-fork@localhost" \
  git am --quiet --committer-date-is-author-date "$VENDOR"/patches/*.patch
pnpm install --silent --filter @jax-js/jax --frozen-lockfile
pnpm exec tsdown --silent >/dev/null

# Keep the entire output, including chunks, declarations and any assets/maps the build emits.
# --check only reads the vendor directory: LICENSE is part of the comparison too.
if "$CHECK"; then
  status=0
  diff -rq dist "$VENDOR/dist" || status=1
  diff -q LICENSE "$VENDOR/LICENSE" || status=1
  [ "$status" -eq 0 ] || { echo 'Vendored artifacts differ from the pinned build.' >&2; exit 1; }
  echo "vendor/jax-js/dist and LICENSE match $JAX_BASE_COMMIT + patches."
else
  rm -rf "$VENDOR/dist"
  cp -R dist "$VENDOR/dist"
  cp LICENSE "$VENDOR/LICENSE"
  echo "Rebuilt vendor/jax-js from $JAX_BASE_COMMIT + patches."
fi
