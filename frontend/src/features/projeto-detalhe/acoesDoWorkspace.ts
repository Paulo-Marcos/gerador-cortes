import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import type { ScreenAction } from '@/upgrade/ScreenHeader';

// ─────────────────────────────────────────────────────────────────
// D-867 · As ações do cabeçalho do Workspace.
//
// Onda 3, nota 2: Reanalisar, refazer a transcrição, auditar a análise e
// abrir a pasta eram uma fileira de ícones soltos no meio da tela — quatro
// desenhos sem nome, cada um com uma cor, disputando peso com as decisões
// da live. São ações raras: vão para um "Mais" (⋯) no cabeçalho, com
// rótulo. No cabeçalho ficam só o que se faz com a live inteira e com
// frequência: ver no YouTube e criar um corte.
// ─────────────────────────────────────────────────────────────────

type Parametros = {
  youtubeUrl?: string | null;
  temCortes: boolean;
  abrindoPasta: boolean;
  refazendoTranscricao: boolean;
  novoCorte: () => void;
  reanalisar: () => void;
  refazerTranscricao: () => void;
  auditar: () => void;
  abrirPasta: () => void;
};

export function acoesDoWorkspace(p: Parametros): ScreenAction[] {
  return [
    ...(p.youtubeUrl
      ? [
          {
            icone: 'external-link' as const,
            texto: 'Ver no YouTube',
            onClick: () => window.open(p.youtubeUrl!, '_blank', 'noopener,noreferrer'),
          },
        ]
      : []),
    { icone: 'plus', texto: 'Novo corte', onClick: p.novoCorte },
    {
      icone: 'more-horizontal',
      texto: 'Mais',
      menu: [
        { icon: 'brain', label: 'Reanalisar', onClick: p.reanalisar },
        {
          icon: 'rotate-ccw',
          label: 'Refazer transcrição',
          title: 'Re-baixa as legendas em json3 e re-sincroniza todos os cortes.',
          disabled: p.refazendoTranscricao,
          onClick: p.refazerTranscricao,
        },
        {
          icon: ICONE_DO_CONCEITO.auditar,
          label: 'Auditar análise',
          title: p.temCortes
            ? 'Ver por que a IA escolheu cada corte e o que foi descartado.'
            : 'A live está sem cortes: não há análise para auditar.',
          disabled: !p.temCortes,
          onClick: p.auditar,
        },
        {
          icon: 'hard-drive',
          label: 'Abrir a pasta do projeto',
          disabled: p.abrindoPasta,
          onClick: p.abrirPasta,
        },
      ],
    },
  ];
}
