#!/usr/bin/env bash
# Generates the branded images used in article structured data (NewsArticle
# "image") and Open Graph tags, plus the publisher logo.
#
# Google recommends 16:9, 4:3 and 1:1 images at least 1200px wide, so every
# category gets all three. Output is committed to images/schema/ and served
# as static files; this script only needs re-running if the design changes.
#
# Requires rsvg-convert (librsvg) and the DejaVu fonts.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=images/schema
mkdir -p "$OUT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Balanced scales icon, drawn in a 100x100 box.
ICON='<g fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
  <line x1="50" y1="14" x2="50" y2="84"/><line x1="32" y1="86" x2="68" y2="86"/>
  <line x1="18" y1="26" x2="82" y2="26"/><circle cx="50" cy="14" r="4" fill="#ffffff"/>
  <path d="M18 26 L6 56 M18 26 L30 56"/><path d="M4 56 Q18 72 32 56 Z" fill="#ffffff" fill-opacity="0.18"/>
  <path d="M82 26 L70 56 M82 26 L94 56"/><path d="M68 56 Q82 72 96 56 Z" fill="#ffffff" fill-opacity="0.18"/>
</g>'

card() { # slug label width height
  local slug=$1 label=$2 w=$3 h=$4
  local cy=$((h / 2)) ix=$((w / 2 - 70)) iy=$((h / 2 - 230))
  cat > "$TMP/$slug-$w-$h.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="$w" height="$h" viewBox="0 0 $w $h">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#0b1437"/></linearGradient></defs>
  <rect width="$w" height="$h" fill="url(#g)"/>
  <rect x="24" y="24" width="$((w - 48))" height="$((h - 48))" rx="28" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
  <rect x="$ix" y="$iy" width="140" height="140" rx="36" fill="#ffffff" fill-opacity="0.10"/>
  <g transform="translate($((ix + 20)) $((iy + 20))) scale(1)">$ICON</g>
  <text x="$((w / 2))" y="$((cy + 20))" text-anchor="middle" font-family="DejaVu Serif" font-weight="bold" font-size="84" fill="#ffffff">Media Law News</text>
  <line x1="$((w / 2 - 60))" y1="$((cy + 62))" x2="$((w / 2 + 60))" y2="$((cy + 62))" stroke="#93c5fd" stroke-width="4"/>
  <text x="$((w / 2))" y="$((cy + 130))" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="44" letter-spacing="6" fill="#bfdbfe">$label</text>
  <text x="$((w / 2))" y="$((cy + 190))" text-anchor="middle" font-family="DejaVu Sans" font-size="28" fill="#ffffff" fill-opacity="0.7">Media law · First Amendment · Entertainment law</text>
</svg>
SVG
  rsvg-convert "$TMP/$slug-$w-$h.svg" -o "$OUT/$slug-$w-$h.png"
}

while IFS='|' read -r slug label; do
  for size in "1200 675" "1200 900" "1200 1200"; do card "$slug" "$label" $size; done
done <<'LIST'
default|NEWS
media-law|MEDIA LAW
first-amendment|FIRST AMENDMENT
entertainment-law|ENTERTAINMENT LAW
privacy|PRIVACY
defamation|DEFAMATION
journalism|JOURNALISM
technology-law|TECHNOLOGY LAW
scotus|SCOTUS
LIST

# Publisher logo (square, used for Organization.logo).
cat > "$TMP/logo.svg" <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#1e3a8a"/>
  <g transform="translate(76 76) scale(3.6)">$ICON</g>
</svg>
SVG
rsvg-convert "$TMP/logo.svg" -o "$OUT/logo-512.png"
echo "Wrote $(ls "$OUT" | wc -l) images to $OUT"
