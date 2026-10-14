import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: path.resolve(import.meta.dirname, "src/index.ts"),
        editor: path.resolve(import.meta.dirname, "src/editor.ts"),
        blocks: path.resolve(import.meta.dirname, "src/blocks.ts"),
        api: path.resolve(import.meta.dirname, "src/api.ts"),
        theme: path.resolve(import.meta.dirname, "src/theme.ts"),
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      external: ["react", "react-dom", "@tiptap/react"],
    },
  },
});
