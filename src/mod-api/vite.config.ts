import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: path.resolve(import.meta.dirname, "src/index.ts"),
        editor: path.resolve(import.meta.dirname, "src/editor.ts"),
        blocks: path.resolve(import.meta.dirname, "src/blocks.ts"),
        "portable-blocks": path.resolve(import.meta.dirname, "src/portableBlocks.tsx"),
        api: path.resolve(import.meta.dirname, "src/api.ts"),
        contracts: path.resolve(import.meta.dirname, "src/contracts.ts"),
        theme: path.resolve(import.meta.dirname, "src/theme.ts"),
        records: path.resolve(import.meta.dirname, "src/records.tsx"),
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
