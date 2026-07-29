import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  CATALOG_EVENTS,
  EVENT,
  getCategoryImage,
} from "../src/lib/event";

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 750;
const OVERSCAN_WIDTH = 1320;
const OVERSCAN_HEIGHT = 825;
const outputDirectory = path.join(
  process.cwd(),
  "public",
  "events",
  "listings",
);

function stableSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function rgbFromHue(hue: number): string {
  const saturation = 0.78;
  const lightness = 0.53;
  const chroma =
    (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = (((hue % 360) + 360) % 360) / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  const [red, green, blue] =
    segment < 1
      ? [chroma, secondary, 0]
      : segment < 2
        ? [secondary, chroma, 0]
        : segment < 3
          ? [0, chroma, secondary]
          : segment < 4
            ? [0, secondary, chroma]
            : segment < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return `${Math.round((red + match) * 255)},${Math.round(
    (green + match) * 255,
  )},${Math.round((blue + match) * 255)}`;
}

function overlaySvg(seed: number): Buffer {
  const hue = seed % 360;
  const primary = rgbFromHue(hue);
  const secondary = rgbFromHue(hue + 58 + ((seed >>> 8) % 72));
  const circleX = 180 + (seed % 840);
  const circleY = 110 + ((seed >>> 10) % 530);
  const angle = 18 + ((seed >>> 17) % 36);

  return Buffer.from(`
    <svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle} .5 .5)">
          <stop offset="0" stop-color="rgb(${primary})" stop-opacity=".29"/>
          <stop offset=".55" stop-color="rgb(${primary})" stop-opacity=".04"/>
          <stop offset="1" stop-color="rgb(${secondary})" stop-opacity=".2"/>
        </linearGradient>
        <radialGradient id="glow">
          <stop offset="0" stop-color="rgb(${secondary})" stop-opacity=".3"/>
          <stop offset="1" stop-color="rgb(${secondary})" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="750" fill="url(#wash)"/>
      <circle cx="${circleX}" cy="${circleY}" r="310" fill="url(#glow)"/>
      <path d="M0 ${610 + (seed % 80)} L1200 ${510 + ((seed >>> 6) % 95)} L1200 750 L0 750 Z" fill="rgb(5,12,28)" fill-opacity=".12"/>
    </svg>
  `);
}

async function main(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });

  for (const event of CATALOG_EVENTS) {
    if (event.id === EVENT.id) {
      continue;
    }

    const seed = stableSeed(`${event.category}:${event.id}`);
    const source = path.join(
      process.cwd(),
      "public",
      getCategoryImage(event.category).replace(/^\//, ""),
    );
    const destination = path.join(
      outputDirectory,
      `${event.id}.webp`,
    );

    await sharp(source)
      .resize(OVERSCAN_WIDTH, OVERSCAN_HEIGHT, {
        fit: "cover",
        position: "centre",
      })
      .extract({
        left: seed % (OVERSCAN_WIDTH - OUTPUT_WIDTH + 1),
        top: (seed >>> 9) % (OVERSCAN_HEIGHT - OUTPUT_HEIGHT + 1),
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
      })
      .modulate({
        brightness: 0.97 + ((seed >>> 4) % 8) / 100,
        saturation: 0.96 + ((seed >>> 12) % 19) / 100,
        hue: 352 + ((seed >>> 20) % 17),
      })
      .composite([{ input: overlaySvg(seed), blend: "over" }])
      .webp({ quality: 82, effort: 5, smartSubsample: true })
      .toFile(destination);
  }

  console.log(
    `Generated ${CATALOG_EVENTS.length - 1} owned event-art variants in ${outputDirectory}.`,
  );
}

main().catch((error: unknown) => {
  console.error("Event-art generation failed.", error);
  process.exitCode = 1;
});
