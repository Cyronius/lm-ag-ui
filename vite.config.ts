import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
    root: __dirname,
    base: '',
    plugins: [
        react(),
        dts({
            entryRoot: "src",
            outDir: "dist/types",
            tsconfigPath: "tsconfig.json",
            include: ["src"],
            exclude: [
                "src/**/__tests__/**",
            ],
            insertTypesEntry: true,
        }),
        // Bundle-size report. Written outside dist/ so it never ships to npm
        // (package.json `files` publishes dist/** wholesale).
        visualizer({
            filename: "stats/index.html",
            template: "flamegraph",
            gzipSize: true,
            brotliSize: true,
        }),
    ],
    build: {
        lib: {
            entry: {
                index: "src/index.ts",
                core: "src/core.ts",
            },
            name: "lm-ag-ui",
            formats: ["es"],
        },
        rollupOptions: {
            // react, @ag-ui/*, and rxjs stay external — they are peer deps
            // resolved by the consumer's bundler.
            external: [/^react/, /^react-dom/, /^@ag-ui/, /^rxjs/],
            output: {
                globals: { react: "React" },
            },
        },
        target: "es2020",
        sourcemap: true,
        emptyOutDir: true,
        outDir: "dist",
    },
});
