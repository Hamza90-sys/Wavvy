export const THEMES = [
  { id: "liquid", label: "Liquid Glass" },
  { id: "grove", label: "Neon Grove" },
  { id: "dark", label: "Dark Matter" },
  { id: "noir", label: "Noir Gold" },
  { id: "obsidian", label: "Obsidian Neon" },
  { id: "violetlime", label: "Violet Lime" },
  { id: "olivewine", label: "Olive Wine" },
  { id: "aurora", label: "Aurora Drift" },
  { id: "starfield", label: "Starfield Parallax" },
  { id: "rose", label: "Rose Quartz" },
  { id: "cobalt", label: "Cobalt Wave" },
  { id: "glacier", label: "Glacier Mint" }
];

export const DEFAULT_THEME = "cobalt";

export const isValidTheme = (value) => THEMES.some((theme) => theme.id === value);
