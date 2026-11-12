// Makes the files for your Drive's "Lyra Updates" folder, in build/release:
//   Lyra-<version>.apk               the phone app (signed with your key)
//   Lyra-app-<version>.lyrapack      the Windows app's code (installed on restart)
//   Lyra-<version>-win-arm64.zip     the full Windows app (with --full: when desktop/main.cjs changed)
// Run: npm run release [-- --full]
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const full = process.argv.includes("--full");
const version = readFileSync(join(root, "android/app/build.gradle"), "utf8").match(/versionName "([^"]+)"/)[1];
const minShell = Number(readFileSync(join(root, "desktop/main.cjs"), "utf8").match(/const SHELL_VERSION = (\d+);/)[1]);
const out = join(root, "build/release");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// the phone app (builds the web app too)
execFileSync("npm", ["run", "android:apk"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
copyFileSync(join(root, "android/app/build/outputs/apk/debug/app-debug.apk"), join(out, `Lyra-${version}.apk`));
// uploads from a session are capped near 3 MB, so the APK also goes up in pieces
const apk = readFileSync(join(out, `Lyra-${version}.apk`));
const PART = 3_000_000;
const total = Math.ceil(apk.length / PART);
for (let i = 0; i < total; i++) writeFileSync(join(out, `Lyra-${version}.apk.part${i + 1}of${total}`), apk.subarray(i * PART, (i + 1) * PART));

// the Windows app's code, from the same build
const dist = join(root, "web/dist");
const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files[`dist/${relative(dist, p).split("\\").join("/")}`] = readFileSync(p).toString("base64");
  }
};
walk(dist);
const pack = gzipSync(Buffer.from(JSON.stringify({ format: "lyra-pack", version, minShell, files })), { level: 9 });
writeFileSync(join(out, `Lyra-app-${version}.lyrapack`), pack);

if (full) {
  execFileSync(process.execPath, [join(root, "scripts/desktop.mjs"), "--arch=arm64"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  copyFileSync(join(root, `build/desktop/Lyra-${version}-win-arm64.zip`), join(out, `Lyra-${version}-win-arm64.zip`));
}

for (const f of readdirSync(out)) console.log(`  ${f}  ${(statSync(join(out, f)).size / 1048576).toFixed(1)} MB`);
console.log(`\nUpload these to the "Lyra Updates" folder in your Google Drive.`);
