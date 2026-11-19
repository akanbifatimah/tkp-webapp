/**
 * Welcome's fixed meanings (TKP Connect assets/js/itg-charts.js).
 * Service-type colours: the TKP Hub brand family, validated for colour-blind
 * separation and contrast (dataviz validator: all checks pass). Fixed order, never cycled.
 */
export const SERVICE_TYPES = [
  { full: "Sunday 1st Service", short: "1st service", color: "#2E6CA8" },
  { full: "Sunday 2nd Service", short: "2nd service", color: "#9B2A31" },
  { full: "Tuesday Bible Study", short: "Bible study", color: "#B8861B" },
] as const;
export const KNOWN_TYPES = SERVICE_TYPES.map((s) => s.full);
export const OTHER_TYPE_COLOR = "#9A9893";

/** Cell groups and their data colours (design guide §2.3). */
export const CELLS = ["Red", "Yellow", "Blue", "Green"] as const;
export const CELL_COLOR: Record<string, string> = {
  Red: "#B3382E",
  Yellow: "#C9A227",
  Blue: "#2A6F9E",
  Green: "#2E7D4F",
  "N/A": "#9A9893",
};

/** The 8 ratings in the form's order, each with its icon (design guide §5). */
export const RATINGS = [
  { key: "Music", label: "Music", icon: "🎼" },
  { key: "Preaching", label: "Preaching", icon: "🎤" },
  { key: "Comfort", label: "Comfort", icon: "💺" },
  { key: "Hospitality", label: "Hospitality", icon: "😀" },
  { key: "ChurchEnvironment", label: "Church environment", icon: "⛪" },
  { key: "ThePeople", label: "The people", icon: "👥" },
  { key: "Traffic", label: "Traffic", icon: "🚦" },
  { key: "Parking", label: "Parking space", icon: "🚗" },
] as const;

/** Exact wording, doc 06 §5. */
export const WELCOME_TAGLINE = "“Thanks for worshipping with us.”";

export const pct = (n: number, d: number) => (d ? Math.round((n * 100) / d) : 0);

/** % change, or null for "new" when the prior period had none (doc 01 §8.1). */
export function pctChange(c: number, p: number): number | null {
  if (!p) return c ? null : 0;
  return ((c - p) * 100) / p;
}
