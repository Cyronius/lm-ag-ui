import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
        visualizer({
            filename: "dist/stats.html",
            template: "flamegraph",
            gzipSize: true,
            brotliSize: true,
        }),
    ].filter(Boolean),
    resolve: {
        alias: {
            // Deduplicate rxjs so @ag-ui/client and this project share one copy.
            // Points at the workspace-root node_modules install.
            "rxjs": path.resolve(__dirname, "../../node_modules/rxjs"),
        },
    },
    build: {
        lib: {
            entry: {
                index: "src/index.ts",
            },
            name: "lm-ag-ui",
            formats: ["es"],
        },
        rollupOptions: {
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
}));
