import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
    plugins: [react()],
    resolve: {
        // @ag-ui/client ships a nested rxjs; keep one Observable identity.
        dedupe: ['rxjs', 'react', 'react-dom'],
    },
});
