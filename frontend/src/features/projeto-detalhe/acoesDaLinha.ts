import type { OverflowMenuItem } from '@/components/ui/overflow-menu';
import type { Corte, StatusExportCorte } from '@/types/models';
import { finalReviewPath, nuncaGerouBruto, postProductionPath } from '@/features/post-production/postProductionNavigation';
import { ICONE_DO_CONCEITO, type IconName } from '@/upgrade/Icon';
import type { Tira } from '@/upgrade/tiraDoCorte';

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
    proximo: Pick<Primario, 'texto' | 'icone' | 'acao'>;
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
    aprovado: { ...h.proximo, forte: true },
    proposto: { texto: 'Aprovar', icone: 'check', forte: false, acao: h.aprovar },
  }[estado] as Primario;
}

/** D-1037: durante a geração, o botão não manda gerar nem validar: só leva a acompanhar. */
function cenasDaLinha(verbo: string | undefined, pos: string): [string, IconName, string] {
  if (verbo === 'gerando cenas') return ['Gerando cenas na Pós', 'loader', pos];
  return [verbo === 'gerar cenas' ? 'Gerar cenas na Pós' : 'Validar cenas na Pós', 'list-checks', pos];
}

/**
 * D-1041: o principal do corte aprovado era "Finalizar" e abria sempre a Pós, com
 * o bruto ou só a capa faltando. Ele passa a seguir a tira: diz o que falta e leva
 * à tela onde isso se faz. O clique só leva, então o rótulo diz verbo e destino:
 * nada dispara ao chegar. As etapas do render são um gesto só. O bruto segue a mesma
 * regra da Pós: só quem nunca gerou vai ao editor; com rastro, regerar é na Pós.
 */
export function montarProximoDaLinha(
  tira: Tira,
  projetoId: string,
  corteId: string,
  ir: (caminho: string) => void,
  corte: Corte | undefined,
): Pick<Primario, 'texto' | 'icone' | 'acao'> {
  const pos = postProductionPath(projetoId, corteId);
  const metadados = `/projetos/${projetoId}/metadados?corte=${corteId}`;
  const nuncaGerou = !corte || nuncaGerouBruto(corte, undefined, { brutoAusente: true, arquivosLimpos: false });
  const [texto, icone, caminho]: [string, IconName, string] =
    {
      Bruto: nuncaGerou
        ? ['Gerar bruto no editor', 'scissors', `/projetos/${projetoId}/cortes/${corteId}`]
        : ['Gerar bruto na Pós', 'scissors', pos],
      Cenas: cenasDaLinha(tira.proxima?.verbo, pos),
      Graded: ['Renderizar na Pós', 'clapperboard', pos],
      Overlays: ['Renderizar na Pós', 'clapperboard', pos],
      Final: ['Renderizar na Pós', 'clapperboard', pos],
      Thumb: ['Gerar capa em Metadados', ICONE_DO_CONCEITO.iaGera, metadados],
      Meta: ['Completar metadados', 'file-text', metadados],
    }[tira.proxima?.nome ?? ''] as [string, IconName, string] | undefined ??
    ['Revisar', 'circle-check', finalReviewPath(projetoId, corteId)];
  return { texto, icone, acao: () => ir(caminho) };
}

/**
 * D-906: os dois sinais de publicação que o ⋯ usa, lidos do status.
 *
 * São perguntas diferentes: "subiu em alguma rede?" decide o liberar, e "a
 * URL do YouTube está gravada?" decide o informar. Juntá-las numa só escondia
 * o informar quando só o TikTok estava confirmado.
 */
export function ondeJaSubiu(status: StatusExportCorte): { publicado: boolean; noYoutube: boolean } {
  return {
    publicado: Boolean(status.youtube_url_publicado || status.tiktok_publicado_em),
    noYoutube: Boolean(status.youtube_url_publicado),
  };
}

/** Os itens do "⋯" da linha: o que era ícone solto, agora com nome. */
export function maisDaLinha(p: {
  /** Já subiu (YouTube ou TikTok): dá para liberar para subir de novo. */
  publicado: boolean;
  /** A URL do YouTube já está gravada: não há o que informar. */
  noYoutube: boolean;
  abrindoPasta: boolean;
  posProducao: () => void;
  metadados: () => void;
  abrirPasta: () => void;
  informarUrl: () => void;
  liberarPublicacao: () => void;
}): OverflowMenuItem[] {
  const itens: OverflowMenuItem[] = [
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
  ];
  // D-906: as duas ações respondem perguntas diferentes, e por isso não se
  // excluem. Informar a URL depende só do YOUTUBE: o upload pode dar erro com
  // o vídeo no ar, e um TikTok já confirmado escondia a opção — o vídeo nunca
  // ficava registrado. Liberar depende de QUALQUER rede ter subido.
  if (!p.noYoutube) {
    itens.push({
      icon: ICONE_DO_CONCEITO.urlPublicada,
      label: 'Informar a URL publicada',
      title: 'Informar a URL de um vídeo já publicado no YouTube',
      onClick: p.informarUrl,
    });
  }
  if (p.publicado) {
    itens.push({
      icon: 'rotate-ccw',
      label: 'Liberar publicação',
      title: 'Liberar para subir de novo',
      onClick: p.liberarPublicacao,
    });
  }
  return itens;
}
