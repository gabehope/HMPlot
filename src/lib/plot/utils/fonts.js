import { FontLoader } from "three/addons/loaders/FontLoader.js";

// Load only the selected face; stable names are also the public font prop values.
export const fontChoices = {
  Helvetiker: "helvetiker",
  "Helvetiker Bold": "helvetiker-bold",
  Optimer: "optimer",
  "Optimer Bold": "optimer-bold",
  Gentilis: "gentilis",
  "Gentilis Bold": "gentilis-bold",
  "Droid Sans Mono": "droid-sans-mono",
};
const loaders = {
  helvetiker: () =>
    import("three/examples/fonts/helvetiker_regular.typeface.json"),
  "helvetiker-bold": () =>
    import("three/examples/fonts/helvetiker_bold.typeface.json"),
  optimer: () => import("three/examples/fonts/optimer_regular.typeface.json"),
  "optimer-bold": () =>
    import("three/examples/fonts/optimer_bold.typeface.json"),
  gentilis: () => import("three/examples/fonts/gentilis_regular.typeface.json"),
  "gentilis-bold": () =>
    import("three/examples/fonts/gentilis_bold.typeface.json"),
  "droid-sans-mono": () =>
    import("three/examples/fonts/droid/droid_sans_mono_regular.typeface.json"),
};
const fonts = new Map();
export function loadFont(name = "helvetiker") {
  if (!Object.hasOwn(loaders, name))
    return Promise.reject(
      new Error(
        `Unknown text font "${name}". Choose one of: ${Object.keys(loaders).join(", ")}.`,
      ),
    );
  if (!fonts.has(name)) {
    const pending = loaders[name]().then((data) =>
      new FontLoader().parse(data.default),
    );
    fonts.set(name, pending);
    pending.catch(() => fonts.delete(name));
  }
  return fonts.get(name);
}
