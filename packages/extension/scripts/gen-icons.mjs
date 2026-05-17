// Render public/icon.svg into public/icons/icon-{16,32,48,128}.png at
// rasterization time so we ship crisp PNGs (Chrome's extension toolbar
// uses the raster, not the SVG).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "public", "icon.svg");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(src, "utf8");
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  // Render at 2× then let resvg downscale via fitTo for cleaner small sizes.
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
    shapeRendering: 2, // geometricPrecision
    textRendering: 1,  // optimizeLegibility
    imageRendering: 0, // optimizeQuality
  });
  const png = resvg.render().asPng();
  const out = join(outDir, `icon-${size}.png`);
  writeFileSync(out, png);
  console.log(`✔ ${out} (${png.length} bytes)`);
}
