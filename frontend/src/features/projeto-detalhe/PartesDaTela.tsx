import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Kbd } from '@/components/ui/kbd';
import { Progresso } from '@/components/ui/progresso';
import { metadesDoTitulo } from './leituraDoMapa';

// D-1149 (E-069 H-16) · As peças da tela de cortes da live que só desenham: o título, os
// avisos de trabalho em curso, os atalhos e a faixa do lote. A tela (`WorkspaceProjetoPage`)
// junta e liga.

/**
 * O título da live, grande (§7.2: metade em 300, metade em 800), e o resumo embaixo. É só
 * para os olhos: o `h1` da tela já mora na linha do topo da casca, para o leitor de tela.
 */
export function TituloDaLive({ titulo, resumo }: { titulo: string; resumo: string }) {
  const [leve, forte] = metadesDoTitulo(titulo);
  return (
    <div aria-hidden data-parte="titulo-da-live" className="min-w-0">
      <p className="line-clamp-2 text-titulo font-light text-fg">
        {leve ? `${leve} ` : null}
        <span className="font-extrabold">{forte}</span>
      </p>
      {/* D-1196: aqui atrás está a aurora com a capa. Só `fg-2` sobre `painel` passa 4,5:1
          com qualquer capa (§8.1); o `-ml-2.5` mantém o texto alinhado ao título. */}
      {resumo ? <p className="-ml-2.5 mt-1 w-fit max-w-full rounded-pilula bg-painel px-2.5 py-0.5 text-pequeno text-fg-2">{resumo}</p> : null}
    </div>
  );
}

/** Trabalho da live em curso (análise, download, transcrição): um aviso por vez, em `info`. */
export function AvisoDaLive({
  icone,
  titulo,
  detalhe,
  progresso,
}: {
  icone: IconName;
  titulo: string;
  detalhe?: string;
  progresso?: number;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-cartao border border-fio bg-vidro px-4 py-3 shadow-topo"
    >
      <Icon name={icone} className="text-info" />
      <span className="text-corpo font-semibold text-fg">{titulo}</span>
      {detalhe ? <span className="text-pequeno text-fg-3">{detalhe}</span> : null}
      {progresso === undefined ? (
        <Icon name="loader" className="ml-auto animate-spin text-info motion-reduce:animate-none" />
      ) : (
        <Progresso valor={progresso} rotulo={titulo} className="min-w-[120px] flex-1 text-micro" />
      )}
    </div>
  );
}

/** D-746/D-886: as teclas da triagem, lembradas acima da lista. */
export function AtalhosDaLista() {
  return (
    <p className="m-0 inline-flex flex-wrap items-center gap-1.5 text-pequeno text-fg-3">
      <Kbd>A</Kbd> aprova ou devolve · <Kbd>R</Kbd> risca · <Kbd>J</Kbd>
      <Kbd>K</Kbd> anda · <Kbd>W</Kbd> por quê
    </p>
  );
}

/** D-746: a faixa da seleção em lote. Devolver nunca apaga: tira a aprovação. */
export function LoteDaSelecao({
  total,
  ocupado,
  aoAprovar,
  aoDevolver,
  aoLimpar,
}: {
  total: number;
  ocupado: boolean;
  aoAprovar: () => void;
  aoDevolver: () => void;
  aoLimpar: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Ações em lote"
      className="sticky top-0 z-[5] flex items-center gap-2 rounded-pilula border border-iris-fio bg-painel-solido py-1.5 pl-4 pr-1.5"
    >
      <span className="text-corpo font-semibold text-fg">
        {total} selecionado{total === 1 ? '' : 's'}
      </span>
      <span className="flex-1" />
      <Button
        variant="secundario"
        size="pq"
        disabled={ocupado}
        onClick={aoDevolver}
        title="Tira a aprovação dos selecionados — não apaga nada"
      >
        <Icon name="undo-2" />
        Devolver
      </Button>
      <Button variant="secundario" size="pq" carregando={ocupado} onClick={aoAprovar}>
        <Icon name="check" />
        Aprovar
      </Button>
      <IconButton variant="fantasma" size="pq" onClick={aoLimpar} aria-label="Limpar a seleção" title="Limpar a seleção">
        <Icon name="x" />
      </IconButton>
    </div>
  );
}
