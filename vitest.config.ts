import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        include: ['src/__tests__/**/*.test.{ts,tsx}'],
        environment: 'happy-dom',
    },
    resolve: {
        alias: {
            react: path.resolve(__dirname, './node_modules/react'),
            'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
        },
        dedupe: ['react', 'react-dom'],
    },
});
