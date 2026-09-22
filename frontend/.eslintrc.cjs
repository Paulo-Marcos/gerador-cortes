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
        // Dívida de 21/09/2026 — a casca do Workbench e o modal de ajustes.
        'src/components/PromptManualPanel.tsx',
        'src/components/layout/SettingsModal.tsx',
        'src/components/workbench/ProjectRail.tsx',
        'src/components/workbench/ProjectStageBar.tsx',
        'src/components/workbench/WorkbenchShell.tsx',
        'src/components/workbench/workbenchRoutes.ts',
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
        // Dívida de 21/09/2026 — quase toda pelo `useToast` do toaster.
        'src/hooks/useArranjo.ts',
        'src/hooks/useDiarizacao.ts',
        'src/hooks/useEditor.ts',
        'src/hooks/useProjetoDetalhe.ts',
        'src/hooks/useWarmupWaveforms.ts',
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
