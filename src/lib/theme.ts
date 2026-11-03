export const tokens = {
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { small: 12, medium: 16, large: 24, pill: 999 },
  font: { caption: 12, body: 16, heading: 24, hero: 32 },
  touch: 48,
};
export const themes = {
  dark: {
    background: "#0C0B12",
    surface: "#17151F",
    surface2: "#24202F",
    line: "#373042",
    text: "#F5F2FA",
    muted: "#B4ACBF",
    accent: "#C4A1FF",
    accentSurface: "#30213F",
    onAccent: "#1C102D",
    cyan: "#48DFFF",
    pink: "#FF8FC7",
  },
  light: {
    background: "#F5F3F9",
    surface: "#FFFFFF",
    surface2: "#ECE8F2",
    line: "#D8D2E2",
    text: "#211D2A",
    muted: "#655D72",
    accent: "#7040AD",
    accentSurface: "#E9DCF9",
    onAccent: "#FFFFFF",
    cyan: "#007A92",
    pink: "#AC286A",
  },
};
export type Colors = typeof themes.dark;
