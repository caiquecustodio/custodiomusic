import { router } from "expo-router";

export const mainSections = new Set(["/", "/downloads", "/library"]);
export function goHome() { router.dismissTo("/"); }
export function openSection(path: "/" | "/downloads" | "/library" | "/for-you" | "/settings") {
  if (path === "/") goHome();
  else router.navigate(path);
}
