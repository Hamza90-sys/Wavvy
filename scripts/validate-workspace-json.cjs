const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const files = [
  "package.json",
  path.join("frontend", "package.json"),
  path.join("backend", "package.json")
];

let hasError = false;

for (const relativeFile of files) {
  const fullPath = path.join(rootDir, relativeFile);
  try {
    const content = fs.readFileSync(fullPath, "utf8");
    JSON.parse(content);
    console.log(`[json-ok] ${relativeFile}`);
  } catch (error) {
    hasError = true;
    console.error(`[json-error] ${relativeFile}`);
    console.error(`  ${error.message}`);
  }
}

if (hasError) {
  console.error("");
  console.error("Start aborted: one or more JSON files are invalid.");
  process.exit(1);
}
