import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "hooks/preact": "src/hooks/preact.ts",
    "hooks/react": "src/hooks/react.ts",
    elements: "src/elements/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  external: ["preact", "preact/hooks", "react"],
});
