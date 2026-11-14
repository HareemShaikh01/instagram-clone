#!/usr/bin/env bash
# End-to-end smoke test against a running app instance. Exercises the paths a
# broken release hurts most: auth, chunked media upload (init -> PUT chunks ->
# complete), byte-exact and ranged media fetches, post creation + feed read,
# and story creation + listing. Used locally against docker compose and in CI
# against the built image. Usage: container-smoke.sh <base-url>
set -euo pipefail

BASE="${1:?usage: container-smoke.sh <base-url>}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() { echo "SMOKE FAILED: $*" >&2; exit 1; }
step() { echo "== $*"; }

# --- auth: reuse the user if the DB already has it, else register ------------
step "auth (login or register smoke_user)"
CODE=$(curl -s -o "$WORK/login.json" -w '%{http_code}' -c "$WORK/jar" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"smoke_user","password":"SmokeTest123"}' \
  "$BASE/api/auth/login")
if [ "$CODE" != "200" ]; then
  CODE=$(curl -s -o "$WORK/reg.json" -w '%{http_code}' -c "$WORK/jar" \
    -H 'Content-Type: application/json' \
    -d '{"username":"smoke_user","password":"SmokeTest123","fullName":"Smoke Test","email":"smoke@test.local"}' \
    "$BASE/api/auth/register")
  [ "$CODE" = "200" ] || fail "register ($CODE): $(cat "$WORK/reg.json")"
fi
curl -sf -b "$WORK/jar" "$BASE/api/auth/session" | jq -e '.user.username == "smoke_user"' \
  >/dev/null || fail "session does not resolve to smoke_user"

# --- payload: a real PNG padded past two chunk windows -----------------------
# A 1x1 PNG embedded as base64 keeps the script dependency-free (CI runners
# have no ImageMagick); trailing random bytes stretch it over chunk windows.
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC' \
  | base64 -d > "$WORK/payload.png"
head -c $((7 * 1024 * 1024)) /dev/urandom >> "$WORK/payload.png"
SIZE=$(stat -c%s "$WORK/payload.png")
SUM=$(sha256sum "$WORK/payload.png" | cut -d' ' -f1)

# --- chunked upload: init -> PUT chunks -> complete ---------------------------
step "chunked upload of ${SIZE} bytes"
INIT=$(curl -sf -b "$WORK/jar" -H 'Content-Type: application/json' \
  -d "{\"type\":\"image/png\",\"size\":$SIZE}" "$BASE/api/media/uploads")
MEDIA_ID=$(jq -r '.media.id' <<<"$INIT")
CHUNK=$(jq -r '.chunkSize' <<<"$INIT")
[ -n "$MEDIA_ID" ] && [ "$MEDIA_ID" != "null" ] || fail "upload init returned no media id"

split -b "$CHUNK" "$WORK/payload.png" "$WORK/chunk."
OFFSET=0
for PART in "$WORK"/chunk.*; do
  LEN=$(stat -c%s "$PART")
  RESP=$(curl -sf -b "$WORK/jar" -X PUT \
    -H 'Content-Type: application/octet-stream' -H "x-media-offset: $OFFSET" \
    --data-binary "@$PART" "$BASE/api/media/uploads/$MEDIA_ID")
  GOT=$(jq -r '.size' <<<"$RESP")
  EXPECTED=$((OFFSET + LEN))
  [ "$GOT" = "$EXPECTED" ] || fail "chunk ack $GOT != expected $EXPECTED at offset $OFFSET"
  OFFSET=$EXPECTED
done

DONE=$(curl -sf -b "$WORK/jar" -X POST "$BASE/api/media/uploads/$MEDIA_ID/complete")
[ "$(jq -r '.media.id' <<<"$DONE")" = "$MEDIA_ID" ] || fail "complete returned wrong media"
[ "$(jq -r '.media.url' <<<"$DONE")" = "/api/media/$MEDIA_ID" ] || fail "complete returned wrong url"

# --- byte-exact fetch + range fetch ------------------------------------------
step "fetch media bytes and a 1 KiB range"
curl -sf -b "$WORK/jar" -o "$WORK/fetched.bin" "$BASE/api/media/$MEDIA_ID"
[ "$(sha256sum "$WORK/fetched.bin" | cut -d' ' -f1)" = "$SUM" ] || fail "fetched bytes differ from upload"

RANGE_CODE=$(curl -s -o "$WORK/range.bin" -w '%{http_code}' -b "$WORK/jar" \
  -H 'Range: bytes=1000-1999' "$BASE/api/media/$MEDIA_ID")
[ "$RANGE_CODE" = "206" ] || fail "range request status $RANGE_CODE != 206"
[ "$(stat -c%s "$WORK/range.bin")" = "1000" ] || fail "range returned $(stat -c%s "$WORK/range.bin") bytes"
dd if="$WORK/payload.png" bs=1000 skip=1 count=1 2>/dev/null | sha256sum | cut -d' ' -f1 \
  | grep -qx "$(sha256sum "$WORK/range.bin" | cut -d' ' -f1)" || fail "range bytes differ"

# --- post creation + feed read ------------------------------------------------
step "create post with the uploaded media and read it back from the feed"
POST_RESP=$(curl -sf -b "$WORK/jar" -H 'Content-Type: application/json' \
  -d "{\"caption\":\"container smoke $(date -u +%FT%TZ)\n#smoke\",\"mediaIds\":[\"$MEDIA_ID\"]}" \
  "$BASE/api/posts")
POST_ID=$(jq -r '.post.id' <<<"$POST_RESP")
[ -n "$POST_ID" ] && [ "$POST_ID" != "null" ] || fail "post creation returned no id"
curl -sf -b "$WORK/jar" "$BASE/api/posts?limit=10" \
  | jq -e --arg id "$POST_ID" '[.posts[].id] | index($id) != null' >/dev/null \
  || fail "created post missing from feed"

# --- story creation + listing --------------------------------------------------
step "create story with the uploaded media and list stories"
curl -sf -b "$WORK/jar" -H 'Content-Type: application/json' \
  -d "{\"kind\":\"image\",\"mediaId\":\"$MEDIA_ID\"}" "$BASE/api/stories" >/dev/null \
  || fail "story creation failed"
curl -sf -b "$WORK/jar" "$BASE/api/stories" \
  | jq -e --arg m "$MEDIA_ID" '[.. | strings] | any(. == $m)' >/dev/null \
  || fail "uploaded media missing from story groups"

echo "SMOKE OK: auth, chunked upload ($SIZE bytes), byte-exact + range fetch, post, story"
