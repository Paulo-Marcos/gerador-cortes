import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { LimpezaDoProjeto } from '@/features/projetos/limpezaDoProjeto';
import type { EstadoProjetoKey } from '@/features/projetos/statusMaps';

// ─────────────────────────────────────────────────────────────────
// D-746 · RODADA 3 · o contrato de cor.
//
// A queixa: "a informação de pronto para limpar, ou mídia limpa, está da
// mesma cor do fluxo de ação. Ou seja não tem destaque."
//
// O que o código realmente fazia (ProjetoCardAp.tsx, TOM_LIMPEZA):
//   pronto    → --ok-soft / --ok          ← verde: lê como "já resolvido"
//   guardando → --accent-soft / --accent2 ← A COR DA AÇÃO
//   limpo     → --inset / --mute
// Duas coisas erradas, e diferentes entre si: "pronto para limpar" não é
// um fato concluído, é um CONVITE — verde o transforma em "nada a fazer";
// e "N fire pendente" pintado em acento entra na mesma tinta dos botões,
// que é a queixa literal.
//
// O mesmo defeito está em mais dois lugares, e o patch precisa dos três:
//   · ProjetoCardAp.tsx → ESTADO_TOM: `editando: --accent2`,
//     `'pronto-publicar': --accent`
//   · CorteLinhaAp.tsx  → TOM: `aprovado: --accent2 / --accent-soft`
//
// O contrato agora é explícito, e tem duas metades:
//   · ACENTO = ação. Só botão, link e o que leva a algum lugar.
//   · SELO   = estado do sistema. Nunca acento — e, o que importa mais,
//     tem FORMA diferente: filete de 1px, ponto de 5px e dado em mono
//     caixa-alta. Distinguir só por cor falha em Ardósia, em monitor
//     barato e em quem não separa vermelho de verde.
//
// `tom` diz o que o estado SIGNIFICA, não que cor ele tem.
// ─────────────────────────────────────────────────────────────────

export type TomDoSelo = 'ok' | 'aviso' | 'info' | 'erro' | 'inerte';

/** R4: a ÚNICA tabela de cor de estado do app. Exportada porque o `dot` da
 *  lista de cortes tinha a sua própria cópia — e nela "aprovado" ainda saía
 *  na tinta dos botões. */
export const COR_DO_SELO: Record<TomDoSelo, { cor: string; bg: string }> = {
  ok: { cor: 'var(--cc-ok)', bg: 'color-mix(in srgb, var(--cc-ok) 13%, transparent)' }, // fechado, nada a fazer
  aviso: { cor: 'var(--cc-aviso)', bg: 'color-mix(in srgb, var(--cc-aviso) 13%, transparent)' }, // convida a um ato
  info: { cor: 'var(--cc-info)', bg: 'color-mix(in srgb, var(--cc-info) 13%, transparent)' }, // em curso
  erro: { cor: 'var(--cc-erro)', bg: 'color-mix(in srgb, var(--cc-erro) 13%, transparent)' }, // travou
  // R4: `fg-2`, não `fg-3`, e sem opacidade — o selo inerte media
  // 2,82-3,07 fora de Ardósia. A hierarquia continua de pé porque quem a
  // carrega é o FUNDO (transparente contra chip colorido), não a tinta.
  inerte: { cor: 'var(--cc-fg-2)', bg: 'transparent' }, // verdade fria, sem convite
};

/** As mesmas cinco tintas do `COR_DO_SELO`, em classe: borda, fundo, texto e o ponto. */
const CLASSE_DO_TOM: Record<TomDoSelo, { selo: string; ponto: string }> = {
  ok: { selo: 'border-ok bg-ok/13 text-ok', ponto: 'bg-ok' },
  aviso: { selo: 'border-aviso bg-aviso/13 text-aviso', ponto: 'bg-aviso' },
  info: { selo: 'border-info bg-info/13 text-info', ponto: 'bg-info' },
  erro: { selo: 'border-erro bg-erro/13 text-erro', ponto: 'bg-erro' },
  inerte: { selo: 'border-fg-2 bg-transparent text-fg-2', ponto: 'bg-fg-2' },
};

export function SeloDeEstado({
  tom,
  children,
  dica,
  ponto = true,
  sobreArte = false,
}: {
  tom: TomDoSelo;
  children: ReactNode;
  /** Vai para o `title`: o selo é curto, a explicação mora aqui. */
  dica?: string;
  ponto?: boolean;
  /** Sobre a miniatura: vidro escuro e texto branco, só o ponto leva o tom.
   *  A arte da live vem cheia de cor alta e engoliria um fundo -soft. */
  sobreArte?: boolean;
}) {
  const classes = CLASSE_DO_TOM[tom];
  return (
    <span
      title={dica}
      className={cn(
        // nowrap é obrigatório: o selo tem altura fixa, e sem isto um
        // rótulo de duas palavras quebra em duas linhas e a segunda é
        // cortada. Foi um defeito real da rodada 3.
        // D-859: o piso de texto é 11 px (era 9,5).
        'inline-flex h-5 flex-none items-center gap-[5px] whitespace-nowrap rounded-etiqueta border px-[7px] font-mono text-micro font-bold tracking-[.06em]',
        // Sobre a arte o desfoque saiu (DIRECAO §3.6: vidro só na casca); o fundo sobe
        // de 0,62 para 0,74 para a arte colorida não passar por baixo do texto.
        sobreArte ? 'border-[rgb(255_255_255/0.28)] bg-[rgb(10_14_24/0.74)] text-[#fff]' : classes.selo,
      )}
    >
      {ponto ? <span aria-hidden className={cn('size-[5px] flex-none rounded-full', classes.ponto)} /> : null}
      {children}
    </span>
  );
}

/**
 * O tom de cada veredito de limpeza.
 *
 * "pronto para limpar" é AVISO e não `ok`: ele pede um ato. "mídia limpa"
 * é INERTE: verdade fria, nada a fazer — e por isso para de disputar
 * atenção com os botões. "N fire pendente" é INFO: algo está em curso
 * (os shorts) e a limpeza vai respeitá-lo.
 */
export const TOM_DA_LIMPEZA: Record<LimpezaDoProjeto['chave'], TomDoSelo> = {
  pronto: 'aviso',
  guardando: 'info',
  limpo: 'inerte',
};

/**
 * Tom do estado da LIVE (statusMaps → EstadoProjetoKey), para substituir
 * o `ESTADO_TOM` do ProjetoCardAp. `editando` e `pronto-publicar` eram
 * os dois que vazavam para o acento.
 */
export const TOM_DO_PROJETO = {
  erro: 'erro',
  aguardando: 'inerte',
  // D-848: baixar, transcrever e publicar são a máquina trabalhando — "em
  // curso" (info), como o próprio contrato acima define. Em âmbar, pediam
  // um ato que não cabia ao operador.
  baixando: 'info',
  transcrevendo: 'info',
  analise: 'info',
  analisado: 'info',
  editando: 'info',
  'pronto-publicar': 'aviso',
  publicando: 'info',
  publicado: 'ok',
} as const satisfies Record<EstadoProjetoKey, TomDoSelo>;

/**
 * Tom do estado do CORTE, para substituir o `TOM` do CorteLinhaAp.
 * `aprovado` era o que vazava: acento2 sobre accent-soft.
 */
export const TOM_DO_CORTE = {
  proposto: 'aviso',
  aprovado: 'info',
  // R4: status do banco que a lista lateral também usa. `processado` é o
  // corte que já rodou o pipeline; `editado` é legado e lê como em curso.
  processado: 'ok',
  editado: 'info',
  pronto: 'ok',
  publicado: 'ok',
  rejeitado: 'inerte',
} as const satisfies Record<string, TomDoSelo>;
