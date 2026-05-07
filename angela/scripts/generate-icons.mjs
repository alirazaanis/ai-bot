import { PNG } from "pngjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "teams-app");

function writePng(filename, width, height, rgba) {
  const png = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) << 2;
      png.data[i] = rgba[0];
      png.data[i + 1] = rgba[1];
      png.data[i + 2] = rgba[2];
      png.data[i + 3] = rgba[3];
    }
  }
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, filename), PNG.sync.write(png));
}

try {
  writePng("color.png", 192, 192, [99, 102, 241, 255]);
  writePng("outline.png", 32, 32, [255, 255, 255, 255]);
  console.log("[generate-icons] wrote teams-app/color.png and teams-app/outline.png");
} catch (e) {
  console.warn("[generate-icons] skipped (install deps first):", e?.message ?? e);
  process.exit(0);
}
