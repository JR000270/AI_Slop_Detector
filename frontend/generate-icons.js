// Run with: node generate-icons.js
// Requires the `canvas` npm package: npm install canvas
// Generates icons/icon16.png, icon48.png, icon128.png

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 48, 128];

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#6c47ff";
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.18);
  ctx.fill();

  // Simple "eye" / detector glyph
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.28;

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = size * 0.09;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
  ctx.fill();

  const out = path.join(__dirname, "icons", `icon${size}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log("wrote", out);
}
