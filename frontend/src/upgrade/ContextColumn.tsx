import { useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { TiraMini } from './TiraDoCorteAp';
import type { ChromeLista, ItemDeLista } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A coluna de contexto (250 px).
//
// Ela só existe nas telas de bancada, e o motivo é econômico: nelas a
// pessoa trabalha item a item e precisa ver a fila sem sair do que está
// fazendo. Nas telas de lista a fila JÁ é o conteúdo, e repetir a lista
// ao lado da lista seria ruído caro.
//
// Quem decide se ela aparece é a CASCA, por medida de janela
// (`medidas.ts`). Quando não cabe, as mesmas peças vão para o painel do
// seletor — por isso elas moram aqui e são exportadas.
//
// RODADA 2 · três coisas saíram:
//   · a esteira da live (virou uma faixa própria, hoje a `TrilhaDeEtapas`);
//   · a caixa de miniatura quando não há miniatura — eram 14 retângulos
//     cinza idênticos gastando 38 px de largura para não dizer nada;
//   · o contrato duplo: agora entra UMA `lista`, a mesma que o painel
//     do seletor recebe.
//
// D-1144 (E-069 H-14) · na Sala escura: coluna e linhas em `vidro` CHAPADO (sem
// `backdrop-filter`: lista é painel de trabalho, DIRECAO §3.6), filtros são `Chip`, a ação do
// rodapé é `Button`. A cor da bolinha de estado vem da tela e entra por variável CSS.
// ─────────────────────────────────────────────────────────────────

/** Miniatura + nome da live. Reaproveitada no painel do seletor. */
export function IdentidadeDaLive({
  titulo,
  sub,
  thumb,
}: {
  titulo: string;
  sub?: string;
  thumb?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {thumb ? (
        <span className="h-[26px] w-11 flex-none overflow-hidden rounded-[6px] bg-poco" aria-hidden>
          <img src={thumb} alt="" loading="lazy" className="block size-full object-cover" />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block truncate text-corpo font-bold text-fg">{titulo}</span>
        {sub ? <span className="block truncate text-micro text-fg-3">{sub}</span> : null}
      </span>
    </div>
  );
}

/** Título da lista + resumo em números. Igual nos dois lugares. */
export function CabecalhoDeLista({
  titulo,
  resumo,
  padding = '9px 12px',
  depois,
}: {
  titulo: string;
  resumo?: string;
  /** O respiro do cabeçalho, como um `padding` CSS (o painel do seletor usa o seu). */
  padding?: string;
  /** Controle à direita do resumo (o "recolher" da coluna). */
  depois?: ReactNode;
}) {
  return (
    <div style={{ '--pad': padding } as CSSProperties} className="flex items-center gap-1.5 border-b border-fio p-[var(--pad)]">
      <span className="text-micro text-fg-3">{titulo}</span>
      <span className="flex-1" />
      {resumo ? <span className="font-mono text-micro text-fg-3">{resumo}</span> : null}
      {depois}
    </div>
  );
}

/** Filtros da lista, quando a tela os declara. */
export function FiltrosDaLista({ filtros }: { filtros: NonNullable<ChromeLista['filtros']> }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
      {filtros.map((f) => (
        <Chip key={f.texto} pressionado={Boolean(f.ativo)} contagem={f.n} onClick={f.onClick}>
          {f.texto}
        </Chip>
      ))}
    </div>
  );
}

/** A miniatura da linha. Sem arquivo (a limpeza apagou a capa), some: o
 *  ícone de imagem quebrada não identifica nada. */
function MiniaturaDaLinha({ thumb, dur }: { thumb: string; dur?: string }) {
  const [quebrou, setQuebrou] = useState(false);
  if (quebrou) return null;
  return (
    <span className="relative h-[22px] w-[38px] flex-none overflow-hidden rounded-[6px] bg-poco">
      <img src={thumb} alt="" loading="lazy" onError={() => setQuebrou(true)} className="block size-full object-cover" />
      {dur ? (
        <span className="absolute bottom-px right-px rounded-etiqueta bg-painel-solido px-0.5 font-mono text-micro text-fg">
          {dur}
        </span>
      ) : null}
    </span>
  );
}

/** Uma linha da lista. Compartilhada com o painel do seletor.
 *
 *  D-746: o botão de navegar e a ação da linha são IRMÃOS — botão dentro de
 *  botão não existe em HTML, e o clique no { } abriria o corte junto. */
export function LinhaDeLista({ item }: { item: ItemDeLista }) {
  const bolinha = { '--dot': item.dot } as CSSProperties;
  return (
    <div
      className={cn(
        'mb-0.5 flex items-center gap-0.5 rounded-[10px] border border-transparent transition-colors duration-150 hover:bg-vidro motion-reduce:transition-none',
        item.ativo && 'border-fio-2 bg-vidro-2 shadow-topo',
      )}
    >
      <button
        type="button"
        data-sala=""
        // Linha de lista só NAVEGA: com o foco nela, o Enter ainda é da casca.
        data-navegacao
        onClick={item.onClick}
        aria-current={item.ativo ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco"
      >
        {item.thumb ? <MiniaturaDaLinha thumb={item.thumb} dur={item.dur} /> : null}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-pequeno font-semibold text-fg">{item.titulo}</span>
            {item.selo}
          </span>
          {item.legenda || item.dur ? (
            <span className="block truncate font-mono text-micro text-fg-3">
              {/* Sem miniatura, a duração perde o selo do canto e vem para a
                  legenda: ela é informação, não enfeite da imagem. */}
              {[item.legenda, item.thumb ? null : item.dur].filter(Boolean).join(' · ')}
            </span>
          ) : null}
          {item.tira ? <TiraMini tira={item.tira} /> : null}
        </span>
        {item.tira ? null : (
          <span style={bolinha} className="size-[7px] flex-none rounded-full bg-[var(--dot)]" aria-hidden />
        )}
      </button>
      {item.acao ? (
        <IconButton
          variant="fantasma"
          size="pq"
          title={item.acao.titulo}
          aria-label={item.acao.titulo}
          onClick={item.acao.onClick}
          className="mr-1 flex-none"
        >
          <Icon name={item.acao.icone} />
        </IconButton>
      ) : null}
    </div>
  );
}

/** D-610: a coluna recolhida vira uma tira de 36 px. A lista continua a um
 *  clique no seletor da barra superior; a tira só devolve a coluna. */
export function ColunaRecolhida({ titulo, onAbrir }: { titulo: string; onAbrir: () => void }) {
  return (
    <aside className="flex w-9 flex-none flex-col items-center border-r border-fio bg-vidro pt-2">
      <IconButton
        variant="fantasma"
        size="pq"
        onClick={onAbrir}
        title={`Mostrar ${titulo.toLowerCase()}`}
        aria-label={`Mostrar ${titulo.toLowerCase()}`}
      >
        <Icon name="panel-left" />
      </IconButton>
    </aside>
  );
}

export function ContextColumn({
  lista,
  onRecolher,
}: {
  lista: ChromeLista;
  onRecolher?: () => void;
}) {
  return (
    <aside className="flex min-h-0 w-[250px] flex-none flex-col border-r border-fio bg-vidro">
      {lista.cabecalho ? (
        <div className="border-b border-fio p-3">
          <IdentidadeDaLive titulo={lista.cabecalho.titulo} sub={lista.cabecalho.sub} thumb={lista.cabecalho.thumb} />
        </div>
      ) : null}

      <CabecalhoDeLista
        titulo={lista.titulo}
        resumo={lista.resumo}
        depois={
          onRecolher ? (
            <IconButton
              variant="fantasma"
              size="pq"
              onClick={onRecolher}
              title={`Recolher ${lista.titulo.toLowerCase()}`}
              aria-label={`Recolher ${lista.titulo.toLowerCase()}`}
              className="-mr-1"
            >
              <Icon name="panel-left" />
            </IconButton>
          ) : null
        }
      />

      {lista.filtros?.length ? <FiltrosDaLista filtros={lista.filtros} /> : null}

      <div className="flex-1 overflow-auto p-1.5">
        {lista.itens.map((c) => (
          <LinhaDeLista key={c.id} item={c} />
        ))}
        {lista.rodape}
      </div>

      {lista.acao ? (
        <div className="flex gap-1.5 border-t border-fio px-3 py-2.5">
          <Button variant="secundario" size="pq" className="flex-1" onClick={lista.acao.onClick}>
            <Icon name="plus" />
            {lista.acao.texto}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
