import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    { ignores: ['dist/**', 'stats/**', 'examples/**', 'node_modules/**', '.codegraph/**'] },
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.{ts,tsx}', 'specs/**/*.{ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            // React-Compiler-derived rules. useAgentSetup deliberately writes
            // agentOptionsRef during render so AgentLayer's identity survives
            // option churn (see the comment there), and the async config load
            // sets loading state inside its effect. Both are intentional.
            'react-hooks/refs': 'off',
            'react-hooks/set-state-in-effect': 'off',
            // The AG-UI surface is loosely typed by design (tool args, forwarded
            // props, global state); tightening it is a separate change.
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        },
    },
);
