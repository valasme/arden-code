#!/usr/bin/env bash
# Gathers the Linux packages a release publishes (ADR 0062), with their update signatures, into
# release/, and writes release/latest-linux.json: the part of latest.json that lists them.
#
#   scripts/linux-release.sh <version> <download address of the release> [<trusted public key>]
#
# Each package updates itself through the same signed updater as Windows: the AppImage is also the
# entry for a Linux copy that was installed some other way (`linux-x86_64`).
set -euo pipefail

version="$1"
base_url="$2"
trusted_key="${3:-}"
bundle="target/release/bundle"
mkdir -p release

# Copies one package and its signature into release/, and prints its file name.
take() {
  local found
  found="$(find "$bundle/$1" -maxdepth 1 -name "$2" -print -quit)"
  if [ -z "$found" ]; then
    echo "No $2 was made in $bundle/$1" >&2
    exit 1
  fi
  if [ ! -f "$found.sig" ]; then
    echo "$(basename "$found") has no update signature" >&2
    exit 1
  fi
  cp "$found" "$found.sig" release/
  basename "$found"
}

deb="$(take deb '*.deb')"
rpm="$(take rpm '*.rpm')"
appimage="$(take appimage '*.AppImage')"

check=()
if [ -n "$trusted_key" ]; then check=(--trusted-key "$trusted_key"); fi

# The address of a file of the release, with the characters an address cannot hold escaped.
address() {
  node -e 'console.log(process.argv[1] + "/" + encodeURIComponent(process.argv[2]))' "$base_url" "$1"
}

node scripts/latest-json.ts --version "$version" --platform linux-x86_64-deb \
  --url "$(address "$deb")" --signature-file "release/$deb.sig" "${check[@]}" > release/latest-deb.json
node scripts/latest-json.ts --version "$version" --platform linux-x86_64-rpm \
  --url "$(address "$rpm")" --signature-file "release/$rpm.sig" "${check[@]}" > release/latest-rpm.json
node scripts/latest-json.ts --version "$version" --platform linux-x86_64-appimage,linux-x86_64 \
  --url "$(address "$appimage")" --signature-file "release/$appimage.sig" \
  --merge release/latest-deb.json,release/latest-rpm.json "${check[@]}" > release/latest-linux.json
rm release/latest-deb.json release/latest-rpm.json

ls -l release
cat release/latest-linux.json
