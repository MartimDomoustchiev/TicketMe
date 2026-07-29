export type TicketColor = readonly [number, number, number];

export type TicketPattern = "orbit" | "rays" | "grid" | "pulse";

export type TicketDesign = {
  id: string;
  pattern: TicketPattern;
  background: TicketColor;
  backgroundAlt: TicketColor;
  accent: TicketColor;
  accentAlt: TicketColor;
  tint: TicketColor;
  ink: TicketColor;
  muted: TicketColor;
  line: TicketColor;
  eventSeed: number;
  ticketSeed: number;
  motifOffset: number;
};

type TicketPalette = Pick<
  TicketDesign,
  | "id"
  | "background"
  | "backgroundAlt"
  | "accent"
  | "accentAlt"
  | "tint"
  | "ink"
  | "muted"
  | "line"
>;

const PALETTES: readonly TicketPalette[] = [
  {
    id: "electric",
    background: [0.027, 0.071, 0.184],
    backgroundAlt: [0.055, 0.122, 0.294],
    accent: [0.063, 0.4, 1],
    accentAlt: [0.133, 0.827, 0.933],
    tint: [0.925, 0.953, 1],
    ink: [0.027, 0.055, 0.118],
    muted: [0.31, 0.373, 0.482],
    line: [0.82, 0.863, 0.925],
  },
  {
    id: "violet",
    background: [0.102, 0.047, 0.216],
    backgroundAlt: [0.192, 0.086, 0.4],
    accent: [0.486, 0.227, 0.929],
    accentAlt: [0.925, 0.282, 0.6],
    tint: [0.961, 0.945, 1],
    ink: [0.075, 0.043, 0.137],
    muted: [0.35, 0.302, 0.443],
    line: [0.855, 0.824, 0.925],
  },
  {
    id: "ember",
    background: [0.184, 0.043, 0.035],
    backgroundAlt: [0.353, 0.075, 0.047],
    accent: [0.937, 0.267, 0.22],
    accentAlt: [1, 0.69, 0.125],
    tint: [1, 0.949, 0.925],
    ink: [0.137, 0.047, 0.035],
    muted: [0.392, 0.314, 0.286],
    line: [0.929, 0.831, 0.788],
  },
  {
    id: "jade",
    background: [0.024, 0.145, 0.114],
    backgroundAlt: [0.035, 0.259, 0.192],
    accent: [0, 0.659, 0.471],
    accentAlt: [0.553, 0.816, 0.365],
    tint: [0.925, 0.984, 0.957],
    ink: [0.024, 0.11, 0.09],
    muted: [0.271, 0.388, 0.353],
    line: [0.784, 0.898, 0.855],
  },
  {
    id: "gold",
    background: [0.125, 0.082, 0.035],
    backgroundAlt: [0.263, 0.157, 0.047],
    accent: [0.718, 0.475, 0.122],
    accentAlt: [1, 0.796, 0.278],
    tint: [1, 0.976, 0.91],
    ink: [0.118, 0.078, 0.035],
    muted: [0.396, 0.341, 0.247],
    line: [0.918, 0.863, 0.729],
  },
  {
    id: "lagoon",
    background: [0.031, 0.165, 0.192],
    backgroundAlt: [0.039, 0.286, 0.337],
    accent: [0.055, 0.455, 0.565],
    accentAlt: [0.176, 0.831, 0.749],
    tint: [0.925, 0.98, 0.984],
    ink: [0.027, 0.118, 0.137],
    muted: [0.278, 0.373, 0.392],
    line: [0.788, 0.886, 0.898],
  },
] as const;

const PATTERNS: readonly TicketPattern[] = [
  "orbit",
  "rays",
  "grid",
  "pulse",
] as const;

function mixColor(
  left: TicketColor,
  right: TicketColor,
  amount: number,
): TicketColor {
  const mix = (index: 0 | 1 | 2) =>
    left[index] + (right[index] - left[index]) * amount;
  return [mix(0), mix(1), mix(2)];
}

/**
 * A small runtime-independent FNV-1a hash. It deliberately avoids Node-only
 * crypto APIs because the PDF renderer also runs in the OpenNext worker.
 */
export function stableTicketSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value.normalize("NFKC")) {
    const codePoint = character.codePointAt(0) ?? 0;
    hash ^= codePoint;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getTicketDesign(
  eventId: string,
  ticketId: string,
): TicketDesign {
  const eventSeed = stableTicketSeed(eventId || "ticketme-event");
  const ticketSeed = stableTicketSeed(
    `${eventId || "ticketme-event"}:${ticketId || "ticketme-ticket"}`,
  );
  const palette = PALETTES[eventSeed % PALETTES.length];
  const eventVariant = ((eventSeed >>> 6) % 997) / 997;
  const backgroundMix = 0.05 + eventVariant * 0.18;
  const accentMix = 0.08 + eventVariant * 0.34;
  const patternIndex = (eventSeed >>> 3) % PATTERNS.length;
  const pattern = PATTERNS[patternIndex];

  return {
    ...palette,
    id: `${palette.id}-${eventSeed.toString(36)}`,
    background: mixColor(
      palette.background,
      palette.backgroundAlt,
      backgroundMix,
    ),
    backgroundAlt: mixColor(
      palette.backgroundAlt,
      palette.background,
      0.03 + eventVariant * 0.09,
    ),
    accent: mixColor(palette.accent, palette.accentAlt, accentMix),
    accentAlt: mixColor(
      palette.accentAlt,
      palette.accent,
      0.04 + eventVariant * 0.13,
    ),
    pattern,
    eventSeed,
    ticketSeed,
    motifOffset: (ticketSeed % 997) / 997,
  };
}
