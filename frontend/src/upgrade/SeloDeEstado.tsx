import type { ReactNode } from 'react';
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

const COR: Record<TomDoSelo, { cor: string; bg: string }> = {
  ok: { cor: 'var(--ok)', bg: 'var(--ok-soft)' }, // fechado, nada a fazer
  aviso: { cor: 'var(--warn)', bg: 'var(--warn-soft)' }, // convida a um ato
  info: { cor: 'var(--info)', bg: 'var(--info-soft)' }, // em curso
  erro: { cor: 'var(--err)', bg: 'var(--err-soft)' }, // travou
  inerte: { cor: 'var(--dim)', bg: 'transparent' }, // verdade fria, sem convite
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
  const { cor: corDoTom, bg: bgDoTom } = COR[tom];
  const cor = sobreArte ? '#fff' : corDoTom;
  const bg = sobreArte ? 'rgb(10 14 24 / 0.62)' : bgDoTom;
  return (
    <span
      title={dica}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 20,
        padding: '0 7px',
        flex: 'none',
        border: `1px solid ${sobreArte ? 'rgb(255 255 255 / 0.28)' : cor}`,
        borderRadius: 'var(--r1)',
        background: bg,
        color: cor,
        fontFamily: 'var(--mono)',
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        // nowrap é obrigatório: o selo tem `height` fixa, e sem isto um
        // rótulo de duas palavras quebra em duas linhas e a segunda é
        // cortada. Foi um defeito real da rodada 3.
        whiteSpace: 'nowrap',
        opacity: tom === 'inerte' && !sobreArte ? 0.85 : 1,
        backdropFilter: sobreArte ? 'blur(8px)' : undefined,
      }}
    >
      {ponto ? (
        <span
          aria-hidden
          style={{ width: 5, height: 5, borderRadius: 99, background: corDoTom, flex: 'none' }}
        />
      ) : null}
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
  baixando: 'aviso',
  transcrevendo: 'aviso',
  analise: 'info',
  analisado: 'info',
  editando: 'info',
  'pronto-publicar': 'aviso',
  publicando: 'aviso',
  publicado: 'ok',
} as const satisfies Record<EstadoProjetoKey, TomDoSelo>;

/**
 * Tom do estado do CORTE, para substituir o `TOM` do CorteLinhaAp.
 * `aprovado` era o que vazava: acento2 sobre accent-soft.
 */
export const TOM_DO_CORTE = {
  proposto: 'aviso',
  aprovado: 'info',
  pronto: 'ok',
  publicado: 'ok',
  rejeitado: 'inerte',
} as const satisfies Record<string, TomDoSelo>;
