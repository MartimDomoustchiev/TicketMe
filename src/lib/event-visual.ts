import type { CatalogEvent } from "@/lib/event";

export type EventVisual = {
  accent: string;
  imageFilter: string;
  objectPosition: string;
  overlay: string;
};

function stableVisualSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Gives every listing a deterministic art direction while the underlying
 * photography stays within Tiketko's owned, category-matched asset library.
 * The treatment is deliberately subtle so artist photography is never
 * fabricated or confused with official event artwork.
 */
export function getEventVisual(
  event: Pick<CatalogEvent, "id" | "category">,
): EventVisual {
  const seed = stableVisualSeed(`${event.category}:${event.id}`);
  const hue = seed % 360;
  const secondaryHue = (hue + 42 + ((seed >>> 8) % 76)) % 360;
  const x = 34 + ((seed >>> 11) % 33);
  const y = 36 + ((seed >>> 17) % 29);
  const hueRotation = ((seed >>> 23) % 17) - 8;
  const saturation = 102 + ((seed >>> 4) % 14);
  const contrast = 101 + ((seed >>> 13) % 8);

  return {
    accent: `hsl(${hue} 84% 56%)`,
    imageFilter: `saturate(${saturation}%) contrast(${contrast}%) hue-rotate(${hueRotation}deg)`,
    objectPosition: `${x}% ${y}%`,
    overlay: [
      `radial-gradient(circle at ${24 + (seed % 58)}% ${18 + ((seed >>> 7) % 62)}%, hsl(${secondaryHue} 92% 60% / 0.3), transparent 38%)`,
      `linear-gradient(${112 + (seed % 44)}deg, hsl(${hue} 90% 48% / 0.26), transparent 58%)`,
    ].join(", "),
  };
}
