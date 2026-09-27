module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  ignorePatterns: ['dist', 'dist-tsc-node', '*.config.js', '*.config.ts', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  // D-663: fronteiras entre as pastas, verificadas por máquina. O lint roda com
  // `--max-warnings 0`, então a regra é `error`; a dívida que já existe está em
  // `excludedFiles`, arquivo por arquivo. Import NOVO na direção errada barra.
  // Apertar é tirar um arquivo da lista quando ele for corrigido.
  overrides: [
    {
      // Componente compartilhado não depende de feature: a seta é feature -> componente.
      files: ['src/components/**'],
      excludedFiles: [
        // Dívida de 21/09/2026 — o modal de ajustes e o painel de prompt manual.
        // A casca do Workbench, que também estava aqui, saiu no D-728.
        'src/components/PromptManualPanel.tsx',
        'src/components/layout/SettingsModal.tsx',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/features/*', '**/features/*'],
                message: 'components/ não importa features/ (D-663). Suba a peça para components/ ou passe por prop.',
              },
            ],
          },
        ],
      },
    },
    {
      // Hook de dados não conhece a tela.
      files: ['src/hooks/**'],
      excludedFiles: [
        // D-723: os hooks de dados foram para as features, onde avisar pelo
        // toaster é da tela; aqui não sobrou dívida.
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/components/*', '**/components/*'],
                message: 'hooks/ não importa components/ (D-663). Devolva o estado e deixe a tela decidir o aviso.',
              },
            ],
          },
        ],
      },
    },
    {
      // lib/ é a base: não sobe para nenhuma camada de cima.
      files: ['src/lib/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/features/*',
                  '**/features/*',
                  '@/components/*',
                  '**/components/*',
                  '@/hooks/*',
                  '**/hooks/*',
                ],
                message: 'lib/ não importa features/, components/ nem hooks/ (D-663).',
              },
            ],
          },
        ],
      },
    },
    {
      // shared/ é base, como lib/: o cliente da API e o contrato gerado (D-721)
      // servem todas as features e não conhecem nenhuma.
      files: ['src/shared/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/features/*',
                  '**/features/*',
                  '@/components/*',
                  '**/components/*',
                  '@/hooks/*',
                  '**/hooks/*',
                ],
                message: 'shared/ não importa features/, components/ nem hooks/ (D-721).',
              },
            ],
          },
        ],
      },
    },
    {
      // types/ descreve dados; não depende de código de nenhuma camada.
      files: ['src/types/**'],
      excludedFiles: [
        // Dívida de 21/09/2026 — o tipo de layout mora na feature do editor.
        'src/types/presets.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/features/*',
                  '**/features/*',
                  '@/components/*',
                  '**/components/*',
                  '@/hooks/*',
                  '**/hooks/*',
                  '@/lib/*',
                ],
                message: 'types/ não importa código de camada nenhuma (D-663).',
              },
            ],
          },
        ],
      },
    },
  ],
};
