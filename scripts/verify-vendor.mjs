import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
export function snapshot() {
  return Object.fromEntries(
    files("vendor")
      .filter((path) => !path.endsWith("snapshot.json"))
      .sort()
      .map((path) => [
        relative("vendor", path).split(sep).join("/"),
        createHash("sha256").update(readFileSync(path)).digest("hex"),
      ]),
  );
}
const manifest = JSON.parse(readFileSync("vendor/snapshot.json", "utf8"));
if (JSON.stringify(snapshot()) !== JSON.stringify(manifest.files))
  throw new Error(
    "Vendored parser differs from the reviewed snapshot. Review the upstream change and explicitly replace the manifest.",
  );
console.log(
  `Vendored parser verified: ${Object.keys(manifest.files).length} files`,
);
