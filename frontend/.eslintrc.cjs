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
    // D-725: o renderer só entra pela porta pública. Chave própria (a do
    // typescript-eslint) para não ser apagada pelos `no-restricted-imports`
    // das pastas lá embaixo — no ESLint, override troca a regra inteira.
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@video-renderer/*', '!@video-renderer/public-api'],
            message: 'Do renderer, só @video-renderer/public-api (D-725): o resto é interno dele.',
          },
        ],
      },
    ],
  },
  // D-663: fronteiras entre as pastas, verificadas por máquina. O lint roda com
  // `--max-warnings 0`, então a regra é `error`; a dívida que já existe está em
  // `excludedFiles`, arquivo por arquivo. Import NOVO na direção errada barra.
  // Apertar é tirar um arquivo da lista quando ele for corrigido.
  overrides: [
    {
      // Teste de peça interna do renderer entra direto nela: é o que ele testa.
      files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
      rules: { '@typescript-eslint/no-restricted-imports': 'off' },
    },
    {
      // Componente compartilhado não depende de feature: a seta é feature -> componente.
      files: ['src/components/**'],
      excludedFiles: [
        // D-724: o modal de ajustes foi para features/settings e o painel de
        // prompt manual já não importava feature; aqui não sobrou dívida.
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
              {
                group: ['@/features/*', '**/features/*'],
                message: 'hooks/ não importa features/ (D-724): hook que lê dado de uma feature mora nela.',
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
        // D-724: a forma do layout desceu para types/youtubeLayout; aqui não
        // sobrou dívida.
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
