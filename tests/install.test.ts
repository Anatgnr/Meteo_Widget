import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

describe.skipIf(process.platform === 'win32' && !existsSync(bash))('installation Linux avec commandes simulées', () => {
  it.each(['deb', 'appimage', 'build-only', 'failure'])('%s', mode => {
    const directory = mkdtempSync(join(tmpdir(), 'weatherglass-linux-'));
    try {
      mkdirSync(join(directory, 'scripts'));
      mkdirSync(join(directory, 'src-tauri/icons'), { recursive: true });
      copyFileSync('scripts/install.sh', join(directory, 'scripts/install.sh'));
      copyFileSync('src-tauri/icons/128x128.png', join(directory, 'src-tauri/icons/128x128.png'));
      writeFileSync(join(directory, 'check.sh'), `#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
export XDG_DATA_HOME="$PWD/data with spaces"
uname() { printf 'Linux\\n'; }
cargo() { :; }
pkg-config() { :; }
apt-get() { printf '%s\\n' "$@" > apt-call; }
sudo() { "$@"; }
npm() {
  if [[ "$1" == run ]]; then
    if [[ "${mode}" == failure ]]; then return 17; fi
    mkdir -p src-tauri/target/release/bundle/{deb,appimage}
    printf deb > src-tauri/target/release/bundle/deb/WeatherGlass.deb
    printf appimage > src-tauri/target/release/bundle/appimage/WeatherGlass.AppImage
  fi
}
command() {
  if [[ "${mode}" == appimage && "$*" == '-v apt-get' ]]; then return 1; fi
  builtin command "$@"
}
export -f uname cargo pkg-config apt-get sudo npm command
bash scripts/install.sh ${mode === 'build-only' ? '--build-only' : ''}
`);
      if (mode === 'failure') {
        expect(() => execFileSync(bash, [join(directory, 'check.sh')], { stdio: 'pipe' })).toThrow();
        expect(existsSync(join(directory, 'release/WeatherGlass.deb'))).toBe(false);
        expect(existsSync(join(directory, 'apt-call'))).toBe(false);
        return;
      }
      execFileSync(bash, [join(directory, 'check.sh')], { stdio: 'pipe' });
      expect(readFileSync(join(directory, 'release/WeatherGlass.deb'), 'utf8')).toBe('deb');
      expect(readFileSync(join(directory, 'release/WeatherGlass.AppImage'), 'utf8')).toBe('appimage');
      if (mode === 'deb') expect(readFileSync(join(directory, 'apt-call'), 'utf8')).toContain('WeatherGlass.deb');
      else expect(existsSync(join(directory, 'apt-call'))).toBe(false);
      if (mode === 'appimage') {
        expect(readFileSync(join(directory, 'data with spaces/weatherglass/WeatherGlass.AppImage'), 'utf8')).toBe('appimage');
        expect(readFileSync(join(directory, 'data with spaces/applications/fr.weatherglass.desktop.desktop'), 'utf8')).toContain('Exec="');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
