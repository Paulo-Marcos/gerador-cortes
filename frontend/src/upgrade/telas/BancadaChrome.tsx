import { useNavigate } from 'react-router-dom';
import { useProjeto } from '@/hooks/useProjetoDetalhe';
import { resolveThumbUrl } from '@/lib/api';
import { thumbnailUrl } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { useDefinirChrome, type ItemDeLista } from '../UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 Etapa 4 · a Bancada conversa com a casca.
//
// Este componente não desenha nada: ele traduz o estado do editor para
// o vocabulário da casca. Existe separado porque a alternativa era
// espalhar quarenta linhas de `useDefinirChrome` dentro de um arquivo de
// 1357 linhas que está travado — e porque a tradução é a parte que a
// Pós-produção e a Revisão final vão reaproveitar sem mudar uma vírgula
// do editor.
//
// RODADA 2 · a lista é declarada UMA vez.
//
// Antes eram duas: `contexto.itens` (coluna) e `seletor.itens` (painel),
// com legendas de formato diferente e títulos que já discordavam —
// "Cortes da live" na coluna, "Cortes de LIVE 267" no painel. Agora é
// `lista` + `atual`, e a casca escolhe onde pintar. Saíram ~30 linhas.
//
// Saiu também o lembrete de J/K: a casca o injeta sempre que existe
// `atual`, então declarar aqui era escrevê-lo duas vezes (e mantinha
// morto o caminho da injeção).
// ─────────────────────────────────────────────────────────────────

const TOM: Record<string, { cor: string; bg: string }> = {
  proposto: { cor: 'var(--info)', bg: 'var(--info-soft)' },
  aprovado: { cor: 'var(--accent2)', bg: 'var(--accent-soft)' },
  editado: { cor: 'var(--accent2)', bg: 'var(--accent-soft)' },
  processado: { cor: 'var(--ok)', bg: 'var(--ok-soft)' },
  rejeitado: { cor: 'var(--mute)', bg: 'var(--inset)' },
};

function tom(status: string) {
  return TOM[status] ?? TOM.proposto;
}

export type BancadaChromeProps = {
  projetoId: string;
  tituloLive: string;
  cortes: Corte[];
  corte: Corte;
  exportStatus: StatusExportCorte[];
  /** Caminho da fase certa de cada corte (bruto, pós ou revisão). */
  caminhoDoCorte: (corte: Corte) => string;
  /** Rótulo da fase, para o subtítulo: "bruto 18:32 · trecho 46s". */
  sub: string;
  fire: boolean;
  sujo: boolean;
  salvando: boolean;
  brutoPronto: boolean;
  brutoOcupado: boolean;
  /** Miniatura da live, quando a tela a tem (`thumbnailUrl`). Sem ela a
   *  caixa não é desenhada — cinza vazio não identifica nada. */
  thumbLive?: string;
  /** Miniatura por corte, quando existir. */
  thumbDoCorte?: (corte: Corte) => string | undefined;
  onSalvar: () => void;
  onGerarBruto: () => void;
  onToggleFire: () => void;
  onAprovar: () => void;
  onRejeitar: () => void;
  onNovoTrecho?: () => void;
};

export function BancadaChrome({
  projetoId,
  tituloLive,
  cortes,
  corte,
  exportStatus,
  caminhoDoCorte,
  sub,
  fire,
  sujo,
  salvando,
  brutoPronto,
  brutoOcupado,
  thumbLive,
  thumbDoCorte,
  onSalvar,
  onGerarBruto,
  onToggleFire,
  onAprovar,
  onRejeitar,
  onNovoTrecho,
}: BancadaChromeProps) {
  const navigate = useNavigate();

  const indice = cortes.findIndex((c) => c.id === corte.id);
  const irPara = (delta: -1 | 1) => {
    if (cortes.length === 0) return;
    const alvo = cortes[(indice + delta + cortes.length) % cortes.length];
    navigate(caminhoDoCorte(alvo));
  };

  const prontos = exportStatus.filter((s) => s.pronto_publicar).length;

  // Miniaturas reais por padrão, sem cada tela repetir a conta: a da live vem
  // do projeto (mesma query que as telas já fizeram, em cache) e a do corte é
  // a capa do export, quando já existe. Sem capa, a caixa não é desenhada.
  const projeto = useProjeto(projetoId);
  const capaDaLive =
    thumbLive ?? thumbnailUrl(projeto.data?.youtube_url ?? '', 'mq') ?? undefined;
  const capaDoCorte = (c: Corte) =>
    thumbDoCorte?.(c) ??
    resolveThumbUrl(projetoId, exportStatus.find((s) => s.corte_id === c.id)?.thumbnail_path) ??
    undefined;

  const itens: ItemDeLista[] = cortes.map((c) => ({
    id: c.id,
    num: String(c.numero),
    titulo: c.titulo_proposto,
    legenda: `#${c.numero} · ${c.inicio_hms} → ${c.fim_hms}`,
    thumb: capaDoCorte(c),
    dot: tom(c.status).cor,
    ativo: c.id === corte.id,
    onClick: () => navigate(caminhoDoCorte(c)),
  }));

  useDefinirChrome(
    {
      denso: true,
      titulo: `Corte #${corte.numero} — ${corte.titulo_proposto}`,
      sub,
      rotulos: [tituloLive, `#${corte.numero}`],
      acoes: [
        { icone: 'flame', texto: fire ? 'Fire' : 'Marcar fire', onClick: onToggleFire },
        {
          icone: brutoOcupado ? 'loader' : 'scissors',
          texto: brutoPronto ? 'Regerar bruto' : 'Gerar bruto',
          onClick: onGerarBruto,
        },
        { icone: 'check', texto: 'Salvar', forte: sujo, onClick: onSalvar },
      ],
      // O chip de estado da barra superior é o que responde "perdi alguma
      // coisa?" sem exigir olhar para o botão Salvar.
      estado: salvando
        ? { texto: 'salvando…', icone: 'loader', cor: 'var(--info)', bg: 'var(--info-soft)' }
        : sujo
          ? {
              texto: 'não salvo',
              icone: 'triangle-alert',
              cor: 'var(--warn)',
              bg: 'var(--warn-soft)',
            }
          : { texto: 'salvo', icone: 'circle-check', cor: 'var(--ok)', bg: 'var(--ok-soft)' },
      lista: {
        cabecalho: { titulo: tituloLive, sub: `${cortes.length} cortes · ${prontos} prontos`, thumb: capaDaLive },
        titulo: 'Cortes da live',
        resumo: `${cortes.length} · ${prontos} prontos`,
        itens,
        acao: onNovoTrecho ? { texto: 'Novo trecho', onClick: onNovoTrecho } : undefined,
      },
      atual: {
        num: String(corte.numero),
        titulo: corte.titulo_proposto,
        onAnterior: () => irPara(-1),
        onProximo: () => irPara(1),
        onVerTodos: () => navigate(`/projetos/${projetoId}`),
      },
      barra: {
        teclas: [{ teclas: ['Space'], texto: 'tocar' }],
        secundario: { texto: 'Rejeitar', icone: 'x', onClick: onRejeitar },
        terciario: { titulo: 'Salvar (Ctrl+S)', icone: 'check', onClick: onSalvar },
        primario: {
          texto: corte.status === 'aprovado' ? 'Aprovado' : 'Aprovar corte',
          icone: 'check',
          onClick: onAprovar,
        },
      },
    },
    [
      projetoId,
      tituloLive,
      cortes,
      corte,
      exportStatus,
      sub,
      fire,
      sujo,
      salvando,
      brutoPronto,
      brutoOcupado,
      capaDaLive,
    ],
  );

  return null;
}
