export const THEMES = [
  { id: "liquid", label: "Liquid Glass" },
  { id: "grove", label: "Neon Grove" },
  { id: "dark", label: "Dark Matter" },
  { id: "noir", label: "Noir Gold" },
  { id: "rose", label: "Rose Quartz" },
  { id: "cobalt", label: "Cobalt Wave" },
  { id: "glacier", label: "Glacier Mint" }
];

export const DEFAULT_THEME = "cobalt";

export const isValidTheme = (value) => THEMES.some((theme) => theme.id === value);
