import { useNavigate } from 'react-router-dom';
import type { Corte, StatusExportCorte } from '@/types/models';
import { useDefinirChrome, type SeletorItem } from '../UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 Etapa 4 · a Bancada conversa com a casca.
//
// Este componente não desenha nada: ele traduz o estado do editor para
// o vocabulário da casca. Existe separado porque a alternativa era
// espalhar quarenta linhas de `useDefinirChrome` dentro de um arquivo
// de 1357 linhas que está travado — e porque a tradução é a parte que
// a Pós-produção e a Revisão final vão reaproveitar sem mudar uma
// vírgula do editor.
//
// O ganho para quem usa: a lista de cortes, o seletor com J/K e a
// barra de decisão deixam de ser peças do editor e passam a ser as
// MESMAS de todas as telas. Aprovar um corte na Bancada e aprovar na
// lista do Workspace viram o mesmo gesto, no mesmo lugar.
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

  const itens: SeletorItem[] = cortes.map((c) => {
    const t = tom(c.status);
    return {
      id: c.id,
      num: String(c.numero),
      titulo: c.titulo_proposto,
      inicio: c.inicio_hms,
      fim: c.fim_hms,
      status: c.status,
      statusBg: t.bg,
      statusCor: t.cor,
      fire: c.is_fire,
      ativo: c.id === corte.id,
      onClick: () => navigate(caminhoDoCorte(c)),
    };
  });

  const prontos = exportStatus.filter((s) => s.pronto_publicar).length;

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
      contexto: {
        titulo: tituloLive,
        sub: `${cortes.length} cortes · ${prontos} prontos`,
        listaTitulo: 'Cortes da live',
        listaResumo: `${cortes.length} · ${prontos} prontos`,
        acao: onNovoTrecho ? { texto: 'Novo trecho', onClick: onNovoTrecho } : undefined,
        itens: cortes.map((c) => ({
          id: c.id,
          titulo: c.titulo_proposto,
          legenda: `#${c.numero} · ${c.inicio_hms}`,
          dot: tom(c.status).cor,
          ativo: c.id === corte.id,
          onClick: () => navigate(caminhoDoCorte(c)),
        })),
      },
      seletor: {
        num: String(corte.numero),
        titulo: corte.titulo_proposto,
        listaTitulo: `Cortes de ${tituloLive}`,
        listaResumo: `${cortes.length} · ${prontos} prontos`,
        itens,
        onAnterior: () => irPara(-1),
        onProximo: () => irPara(1),
        onVerTodos: () => navigate(`/projetos/${projetoId}`),
      },
      barra: {
        teclas: [
          { teclas: ['J', 'K'], texto: 'trocar de corte' },
          { teclas: ['Space'], texto: 'tocar' },
        ],
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
    ],
  );

  return null;
}
