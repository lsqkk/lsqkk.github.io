import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const mustExist = [
  path.join(ROOT, "dist", "index.html"),
];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const missing = [];
  for (const filePath of mustExist) {
    if (!(await exists(filePath))) {
      missing.push(path.relative(ROOT, filePath).replace(/\\/g, "/"));
    }
  }

  if (missing.length > 0) {
    console.error("verify-dist failed. Missing files:");
    for (const m of missing) console.error(`- ${m}`);
    process.exit(1);
  }

  console.log("verify-dist passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
