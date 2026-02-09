import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        environment: "node",
        setupFiles: ["./tests/setup.ts"],
        globals: true,
        clearMocks: true,
        pool: "forks",
        maxThreads: 1,
        minThreads: 1,
        fileParallelism: false,
        sequence: { concurrent: false },
    },
});


