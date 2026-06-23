const js = require('@eslint/js');
const nPlugin = require('eslint-plugin-n').default;
const prettier = require('eslint-config-prettier/flat');

module.exports = [
    {
        ignores: [
            'node_modules/',
            'dist/',
            'build/',
            'coverage/',
            'src/tools/prompt-waffle/**',
            'tests/'
        ]
    },
    js.configs.recommended,
    nPlugin.configs['flat/recommended'],
    prettier,
    {
        files: ['src/**/*.js', 'main.js', 'preload.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs'
        },
        rules: {
            'no-console': 'warn',
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            'no-debugger': 'error',
            'prefer-const': 'error',
            'no-var': 'error',
            eqeqeq: ['error', 'always'],
            curly: ['warn', 'all'],
            'no-control-regex': 'warn',
            'no-eval': 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-script-url': 'error',
            'n/no-unsupported-features/node-builtins': 'off',
            'n/no-unpublished-require': 'off',
            'n/no-missing-require': 'off',
            'n/no-extraneous-require': 'off'
        }
    },
    {
        files: ['src/ui/**/*.js'],
        languageOptions: {
            globals: {
                alert: 'readonly',
                Blob: 'readonly',
                confirm: 'readonly',
                customElements: 'readonly',
                document: 'readonly',
                feather: 'readonly',
                File: 'readonly',
                FileReader: 'readonly',
                HTMLElement: 'readonly',
                localStorage: 'readonly',
                requestAnimationFrame: 'readonly',
                URL: 'readonly',
                window: 'readonly'
            }
        }
    }
];
