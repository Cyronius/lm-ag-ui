import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
    root: './',
    publicDir: './public',
    base: '',
    server: {
        host: "::",
        port: 8080,
    },
    plugins: [
        react(),
        dts({
            entryRoot: "src/lib",
            outDir: "dist-lib/types",
            insertTypesEntry: true,
        }),
        visualizer({
            filename: "dist-lib/stats.html",
            template: "flamegraph", // sunburst, treemap, network, raw-data, list, flamegraph --- sunburst and treemap are pretty nice!
            gzipSize: true,
            brotliSize: true,            
        }), 
    ].filter(Boolean),
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            // Deduplicate rxjs so @ag-ui/client and this project share one copy.
            // @ag-ui/client pins rxjs@7.8.1 which installs a nested copy; this
            // forces everything to resolve to the project-level rxjs.
            "rxjs": path.resolve(__dirname, "node_modules/rxjs"),
        },
    },
    build: {
        lib: {
            entry: {
                index: "src/lib/index.ts",
            },
            name: "lm-ag-ui",
            formats: ["es"],
        },
        rollupOptions: {
            // keep dependencies external to avoid bundling react etc.
            external: [/^react/, /^react-dom/, /^@ag-ui/, /^rxjs/],
            output: {
                globals: { react: "React" },
            },
        },
        target: "es2020",
        sourcemap: true,
        emptyOutDir: false, // so it doesn’t wipe your app build if sharing /dist
        outDir: "dist-lib", // separate from your app’s outDir
    },
}));
