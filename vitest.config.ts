import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // The training dummy builds a canvas label, so a DOM is needed.
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
  },
});
