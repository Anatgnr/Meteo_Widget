#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
build_only=false
rebuild=false
for argument in "$@"; do
  case "$argument" in
    --build-only) build_only=true ;;
    --rebuild) rebuild=true ;;
    *) printf 'Option inconnue : %s\n' "$argument" >&2; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != Linux ]]; then
  printf 'Exécuter ce script sur Linux.\n' >&2
  exit 1
fi
cd -- "$project_root"
deb="$project_root/release/WeatherGlass.deb"
appimage="$project_root/release/WeatherGlass.AppImage"
if "$rebuild" || [[ ! -f "$deb" || ! -f "$appimage" ]]; then
  for command in npm cargo pkg-config; do
    if ! command -v "$command" >/dev/null 2>&1; then
      printf 'Prérequis absent : %s. Consulter la section Linux du README.\n' "$command" >&2
      exit 1
    fi
  done
  npm ci
  npm run tauri build -- --bundles deb,appimage
  shopt -s nullglob
  deb_bundles=(src-tauri/target/release/bundle/deb/*.deb)
  appimage_bundles=(src-tauri/target/release/bundle/appimage/*.AppImage)
  if (( ${#deb_bundles[@]} != 1 || ${#appimage_bundles[@]} != 1 )); then
    printf 'Paquets absents ou ambigus dans src-tauri/target/release/bundle.\n' >&2
    exit 1
  fi
  mkdir -p -- release
  cp -- "${deb_bundles[0]}" "$deb"
  cp -- "${appimage_bundles[0]}" "$appimage"
fi
printf 'Paquets disponibles dans %s/release\n' "$project_root"
if "$build_only"; then exit 0; fi

if command -v apt-get >/dev/null 2>&1; then
  if (( EUID == 0 )); then apt-get install -y "$deb";
  else sudo apt-get install -y "$deb"; fi
else
  app_directory="${XDG_DATA_HOME:-$HOME/.local/share}/weatherglass"
  desktop_directory="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p -- "$app_directory" "$desktop_directory"
  install -m 755 -- "$appimage" "$app_directory/WeatherGlass.AppImage"
  install -m 644 -- src-tauri/icons/128x128.png "$app_directory/icon.png"
  # Desktop entries quote executable paths, including spaces in the home directory.
  executable="${app_directory//\\/\\\\}/WeatherGlass.AppImage"
  executable="${executable//\"/\\\"}"
  executable="${executable//\$/\\\$}"
  executable="${executable//\`/\\\`}"
  executable="${executable//%/%%}"
  printf '[Desktop Entry]\nType=Application\nName=WeatherGlass\nComment=Prévisions météo sur le bureau\nExec="%s"\nIcon=%s/icon.png\nTerminal=false\nCategories=Utility;\n' "$executable" "$app_directory" > "$desktop_directory/fr.weatherglass.desktop.desktop"
fi
printf 'WeatherGlass est installé. Ouvrir WeatherGlass depuis le menu des applications.\n'
