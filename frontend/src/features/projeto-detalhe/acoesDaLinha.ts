import type { OverflowMenuItem } from '@/components/ui/overflow-menu';
import type { Corte, StatusExportCorte } from '@/types/models';
import { ICONE_DO_CONCEITO, type IconName } from '@/upgrade/Icon';

// ─────────────────────────────────────────────────────────────────
// D-868 · As ações da linha do corte (Onda 3, nota 4: "uma ação por linha").
//
// A linha tinha seis botões de ícone e o principal: Editar, Pós, Metadados,
// pasta, URL publicada (ou liberar publicação) e o verbo do estado. Ficam à
// vista só Editar e o principal, com rótulo; o resto vai para o "⋯" da
// linha. Nenhuma ação some — mudam de lugar.
// ─────────────────────────────────────────────────────────────────

export type EstadoLinha = 'proposto' | 'aprovado' | 'pronto' | 'publicado' | 'rejeitado';

/**
 * O estado que a linha mostra. Não é o enum do banco: `StatusCorte` não
 * sabe se o corte já subiu nem se o render fechou, e são essas duas
 * coisas que decidem o que o botão principal deve oferecer.
 */
export function estadoDaLinha(corte: Corte | undefined, status: StatusExportCorte): EstadoLinha {
  if (status.youtube_url_publicado) return 'publicado';
  if (corte?.status === 'rejeitado') return 'rejeitado';
  if (status.pronto_publicar) return 'pronto';
  if (corte && corte.status !== 'proposto') return 'aprovado';
  return 'proposto';
}

export type Primario = { texto: string; icone: IconName; forte: boolean; acao: () => void };

/**
 * Cada estado pede UMA coisa. Oferecer "Publicar" num corte sem render ou
 * "Aprovar" num que já está no ar é convidar ao erro — por isso o botão
 * principal muda de nome, de ícone e de peso junto com o estado.
 */
export function primarioDaLinha(
  estado: EstadoLinha,
  h: {
    aprovar: () => void;
    voltar: () => void;
    enviarYoutube: () => void;
    finalizar: () => void;
    abrirNoYoutube: () => void;
  },
): Primario {
  return {
    publicado: { texto: 'No ar', icone: 'external-link', forte: false, acao: h.abrirNoYoutube },
    rejeitado: { texto: 'Voltar', icone: 'undo-2', forte: false, acao: h.voltar },
    // D-746: o verbo do resultado; o clique abre a conferência, não envia.
    pronto: {
      texto: 'Enviar ao YouTube',
      icone: ICONE_DO_CONCEITO.publicar,
      forte: true,
      acao: h.enviarYoutube,
    },
    aprovado: { texto: 'Finalizar', icone: 'clapperboard', forte: true, acao: h.finalizar },
    proposto: { texto: 'Aprovar', icone: 'check', forte: false, acao: h.aprovar },
  }[estado] as Primario;
}

/** Os itens do "⋯" da linha: o que era ícone solto, agora com nome. */
export function maisDaLinha(p: {
  /** Já subiu (YouTube ou TikTok): a última ação é liberar para subir de novo. */
  publicado: boolean;
  abrindoPasta: boolean;
  posProducao: () => void;
  metadados: () => void;
  abrirPasta: () => void;
  informarUrl: () => void;
  liberarPublicacao: () => void;
}): OverflowMenuItem[] {
  return [
    { icon: 'clapperboard', label: 'Pós-produção', onClick: p.posProducao },
    {
      icon: 'tags',
      label: 'Metadados do corte',
      title: 'Abre aqui, sem sair da lista',
      onClick: p.metadados,
    },
    {
      icon: 'folder',
      label: 'Abrir a pasta do corte',
      disabled: p.abrindoPasta,
      onClick: p.abrirPasta,
    },
    p.publicado
      ? {
          icon: 'rotate-ccw',
          label: 'Liberar publicação',
          title: 'Liberar para subir de novo',
          onClick: p.liberarPublicacao,
        }
      : {
          icon: ICONE_DO_CONCEITO.urlPublicada,
          label: 'Informar a URL publicada',
          title: 'Informar a URL de um vídeo já publicado no YouTube',
          onClick: p.informarUrl,
        },
  ];
}
