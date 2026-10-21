/** Build a portable static site; installing into Octri is an explicit local step. */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve, dirname, join } from "node:path";

const destination = resolve("artifacts/web");
rmSync(destination, { recursive: true, force: true });
const paths = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile()) paths.push(path);
  }
}
collect("web");
collect("packages/browser");
paths.push("fixtures/pets.yaml");
paths.push("fixtures/openapi32.json");
const files = paths.filter(
  (path) =>
    !path.endsWith("browser-test.mjs") &&
    !path.endsWith("serve.mjs") &&
    !path.endsWith("package.json") &&
    !path.endsWith(".d.ts"),
);
files.push("LICENSE");
files.push("THIRD-PARTY-NOTICES.md");
files.push("vendor/octri-parser/schemas/OAI-LICENSE");
const manifest = {
  engineVersion: JSON.parse(readFileSync("package.json", "utf8")).version,
  rulesetVersion: "1.0.2",
  scoreMethod: "octri-10-point/1",
  files: {},
};
for (const path of files) {
  const target = resolve(destination, path);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(path, target);
  manifest.files[path] = createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}
const notices = "vendor/PARSER-THIRD-PARTY-NOTICES.md";
mkdirSync(join(destination, "vendor"), { recursive: true });
copyFileSync(notices, join(destination, notices));
manifest.files[notices] = createHash("sha256")
  .update(readFileSync(notices))
  .digest("hex");
writeFileSync(
  join(destination, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
copyFileSync("packages/web/package.json", join(destination, "package.json"));
copyFileSync("packages/web/README.md", join(destination, "README.md"));
const octriIndex = process.argv.indexOf("--install-octri");
if (octriIndex >= 0) {
  const octriRoot = resolve(process.argv[octriIndex + 1] ?? "");
  if (!existsSync(join(octriRoot, "apps/api/package.json")))
    throw new Error("Provide the Octri monorepo root after --install-octri");
  for (const app of ["marketing", "web"]) {
    const target = join(octriRoot, "apps", app, "public/spec-auditor");
    if (existsSync(target) && !existsSync(join(target, "manifest.json")))
      throw new Error(
        `Refusing to replace an unrecognized directory: ${target}`,
      );
    for (const path of [...Object.keys(manifest.files), "manifest.json"]) {
      mkdirSync(dirname(join(target, path)), { recursive: true });
      copyFileSync(join(destination, path), join(target, path));
    }
    console.log(
      `Installed verified static auditor assets in ${relative(octriRoot, target)}`,
    );
  }
}
console.log(`Portable static site: ${destination}/web/index.html`);
