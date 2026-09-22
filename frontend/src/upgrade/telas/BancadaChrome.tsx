import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReadingModal } from '@/features/editor/CommonTopBar';
import { MetadataModal } from '@/features/metadata/MetadataModal';
import type { ReadingPatch } from '@/lib/readingMetadata';
import { useProjeto } from '@/hooks/useProjetoDetalhe';
import { resolveThumbUrl } from '@/lib/api';
import { thumbnailUrl } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';
import { montarTira } from '../tiraDoCorte';
import { useDefinirChrome, type ChromeBarra, type ItemDeLista } from '../UpgradeChrome';

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
  /** Sem ele a barra não mostra Salvar (a Pós não tem o que salvar). */
  onSalvar?: () => void;
  onGerarBruto: () => void;
  onToggleFire: () => void;
  fireOcupado?: boolean;
  /** D-610: Leitura como qualificador da barra. Sem isto o botão não aparece
   *  (Pós e Revisão não o usam). */
  leitura?: {
    ativo: boolean;
    autor: string;
    parte: number;
    ocupado?: boolean;
    onAlternar: () => void;
    onAtualizar: (patch: ReadingPatch) => void;
  };
  onAprovar: () => void;
  /** Sem ele a barra não mostra Rejeitar. */
  onRejeitar?: () => void;
  onNovoTrecho?: () => void;
  /** D-746: a tela troca peças da barra padrão (bruto). A Pós usa para dizer
   *  a verdade: primário "Renderizar final", veredito à parte, sem Salvar.
   *  Chave presente com `undefined` REMOVE a peça. */
  barra?: Partial<ChromeBarra>;
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
  fireOcupado,
  leitura,
  onAprovar,
  onRejeitar,
  onNovoTrecho,
  barra,
}: BancadaChromeProps) {
  const navigate = useNavigate();
  const [editandoLeitura, setEditandoLeitura] = useState(false);
  const [metaDoCorte, setMetaDoCorte] = useState<Corte | null>(null);
  const statusDe = (c: Corte) => exportStatus.find((s) => s.corte_id === c.id);

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
    // D-746: a lista volta a dizer onde cada corte parou (a casca antiga
    // dizia) e abre o metadado de qualquer um sem trocar de tela.
    tira: statusDe(c) ? montarTira(statusDe(c)!, c.status) : undefined,
    acao: {
      icone: 'tags' as const,
      titulo: `Metadados do corte #${c.numero} — editar aqui, sem sair da tela`,
      onClick: () => setMetaDoCorte(c),
    },
  }));

  useDefinirChrome(
    {
      denso: true,
      titulo: `Corte #${corte.numero} — ${corte.titulo_proposto}`,
      sub,
      rotulos: [tituloLive, `#${corte.numero}`],
      // D-610: Fire e Salvar desceram para a barra de ações. No topo sobra a
      // ação que não é veredito do corte, e sim trabalho pesado sobre ele.
      acoes: [
        {
          icone: brutoOcupado ? 'loader' : 'scissors',
          texto: brutoPronto ? 'Regerar bruto' : 'Gerar bruto',
          onClick: onGerarBruto,
        },
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
        alternancias: [
          {
            texto: 'Fire',
            icone: 'flame',
            ativo: fire,
            cor: 'var(--accent2)',
            corSuave: 'var(--accent-soft)',
            titulo: fire ? 'Tirar do Fire (F)' : 'Marcar como Fire (F)',
            ocupado: fireOcupado,
            onClick: onToggleFire,
          },
          ...(leitura
            ? [
                {
                  texto: 'Leitura',
                  icone: 'book-open' as const,
                  ativo: leitura.ativo,
                  cor: 'var(--info)',
                  corSuave: 'var(--info-soft)',
                  titulo: leitura.ativo
                    ? 'Tirar a leitura (L)'
                    : 'Marcar como leitura (L) — pede autor e parte',
                  ocupado: leitura.ocupado,
                  // Ligar pede autor e parte: é o prefixo do título no YouTube
                  // ("Leitura - autor - PT.2 |"). Desligar é um clique só.
                  onClick: () => {
                    if (!leitura.ativo) setEditandoLeitura(true);
                    leitura.onAlternar();
                  },
                  editar: {
                    titulo: `Editar autor e parte (${leitura.autor || 'sem autor'} · PT.${leitura.parte || 1})`,
                    onClick: () => setEditandoLeitura(true),
                  },
                },
              ]
            : []),
        ],
        secundario: onRejeitar ? { texto: 'Rejeitar', icone: 'x', onClick: onRejeitar } : undefined,
        terciario: onSalvar
          ? {
              titulo: sujo ? 'Salvar (Ctrl+S) — há mudanças' : 'Salvar (Ctrl+S)',
              icone: salvando ? 'loader' : 'check',
              onClick: onSalvar,
            }
          : undefined,
        primario: {
          texto: corte.status === 'aprovado' ? 'Aprovado' : 'Aprovar corte',
          icone: 'check',
          onClick: onAprovar,
        },
        ...barra,
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
      fireOcupado,
      leitura?.ativo,
      leitura?.ocupado,
      barra?.primario?.texto,
      barra?.primario?.desabilitado,
      barra?.primario?.motivo,
      barra?.veredito?.aprovado,
      barra?.veredito?.ocupado,
    ],
  );

  // O diálogo abre ao LIGAR a leitura e pelo lápis ao lado dela.
  return (
    <>
      {leitura ? (
        <ReadingModal
          open={editandoLeitura}
          author={leitura.autor}
          part={leitura.parte}
          disabled={leitura.ocupado}
          onClose={() => setEditandoLeitura(false)}
          onSave={(patch) => {
            leitura.onAtualizar(patch);
            setEditandoLeitura(false);
          }}
        />
      ) : null}
      {metaDoCorte ? (
        <MetadataModal
          open
          projetoId={projetoId}
          corte={metaDoCorte}
          onClose={() => setMetaDoCorte(null)}
        />
      ) : null}
    </>
  );
}
