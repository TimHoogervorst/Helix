import { defineConfig } from "vite";
import base from "./vite.config";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["../mods/eln/__tests__/**/*.test.{ts,tsx}"],
  },
});
