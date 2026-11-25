import StyleDictionary from "style-dictionary";

// Single custom name transform used everywhere, so a token keeps the same
// CSS variable name no matter which platform/file references it. That's
// what lets light.css and dark.css both define e.g. --chrome-accent and
// have [data-theme] selector scoping do the swapping, and what lets
// outputReferences emit var(--gray-600) instead of a duplicated literal.
StyleDictionary.registerTransform({
  name: "name/hrifa-token",
  type: "name",
  transform: (token) => {
    const p = token.path;
    // color.base.<hue>.<step>  ->  <hue>-<step>            (e.g. gray-50)
    if (p[0] === "color" && p[1] === "base") return p.slice(2).join("-");
    // color.theme.<mode>.<...rest>  ->  <...rest>           (e.g. chrome-accent)
    if (p[0] === "color" && p[1] === "theme") return p.slice(3).join("-");
    return p.join("-");
  }
});

const transforms = ["attribute/cti", "name/hrifa-token", "color/css"];

export default {
  source: ["color-tokens.json"],
  platforms: {
    // Raw palette — load this once, on every page, regardless of theme.
    "css-base": {
      transforms,
      buildPath: "build/css/",
      files: [
        {
          destination: "base.css",
          format: "css/variables",
          filter: (token) => token.path[0] === "color" && token.path[1] === "base",
          options: {
            selector: ":root"
          }
        }
      ]
    },
    // Semantic layer, light — values reference base.css variables.
    "css-light": {
      transforms,
      buildPath: "build/css/",
      files: [
        {
          destination: "light.css",
          format: "css/variables",
          filter: (token) =>
            token.path[0] === "color" &&
            token.path[1] === "theme" &&
            token.path[2] === "light",
          options: {
            selector: ":root, [data-theme=\"light\"]",
            outputReferences: true
          }
        }
      ]
    },
    // Semantic layer, dark — values reference base.css variables.
    "css-dark": {
      transforms,
      buildPath: "build/css/",
      files: [
        {
          destination: "dark.css",
          format: "css/variables",
          filter: (token) =>
            token.path[0] === "color" &&
            token.path[1] === "theme" &&
            token.path[2] === "dark",
          options: {
            selector: "[data-theme=\"dark\"]",
            outputReferences: true
          }
        }
      ]
    }
  }
};
