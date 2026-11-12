// Builds Lyra for Windows: the same app as the phone, in an Electron window.
// Run: npm run desktop [-- --arch=arm64,x64] [-- --platform=linux] [-- --stage-only]
// Output: build/desktop/Lyra-<version>-win-<arch>.zip (unzip, then run Lyra.exe)
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")));
const platform = args.platform ?? "win32";
const arches = (args.arch ?? "arm64").split(",");

// the same version as the Android app
const gradle = readFileSync(join(root, "android/app/build.gradle"), "utf8");
const version = gradle.match(/versionName "([^"]+)"/)[1];

const build = join(root, "build");
const stage = join(build, "desktop-app");
const out = join(build, "desktop");

console.log(`Building Lyra ${version} for ${platform} ${arches.join(", ")}`);
execFileSync(process.execPath, [join(root, "node_modules/vite/bin/vite.js"), "build"], { cwd: root, stdio: "inherit" });

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of ["main.cjs", "preload.cjs", "icon.png"]) cpSync(join(root, "desktop", f), join(stage, f));
cpSync(join(root, "web/dist"), join(stage, "dist"), { recursive: true });
writeFileSync(
  join(stage, "package.json"),
  JSON.stringify({ name: "lyra", productName: "Lyra", version, description: "Lyra, your chief of staff", main: "main.cjs", author: "Lyra" }, null, 2),
);
if (args["stage-only"] !== undefined) {
  console.log(`Staged at ${stage}`);
  process.exit(0);
}

const require = createRequire(import.meta.url);
const { packager } = require("@electron/packager");
const electronVersion = require("electron/package.json").version;
mkdirSync(out, { recursive: true });

for (const arch of arches) {
  const [dir] = await packager({
    dir: stage,
    out,
    platform,
    arch,
    electronVersion,
    name: "Lyra",
    executableName: "Lyra",
    appVersion: version,
    buildVersion: version,
    icon: join(root, "desktop/icon.ico"),
    asar: true,
    overwrite: true,
    prune: false,
    win32metadata: { CompanyName: "Lyra", FileDescription: "Lyra", ProductName: "Lyra", InternalName: "Lyra", OriginalFilename: "Lyra.exe" },
  });
  const zip = join(out, `Lyra-${version}-${platform === "win32" ? "win" : platform}-${arch}.zip`);
  rmSync(zip, { force: true });
  // the zip holds one "Lyra" folder: unzip anywhere and run Lyra.exe
  const named = join(out, "Lyra");
  rmSync(named, { recursive: true, force: true });
  cpSync(dir, named, { recursive: true });
  execFileSync("zip", ["-r", "-q", "-y", zip, "Lyra"], { cwd: out });
  rmSync(named, { recursive: true, force: true });
  console.log(`  ${zip}${existsSync(zip) ? "" : " (missing!)"}`);
}
