import { useSyncExternalStore } from 'react';
import { IconButton } from '@/components/ui/icon-button';
import { Selo, type TomDoSelo } from '@/components/ui/selo';
import { PainelDoLote } from '@/features/shorts/PainelDoLote';
import type { LotePublicacao } from '@/features/shorts/shortsApi';
import { useCancelarLote, useLoteAtual } from '@/features/shorts/useLotePublicacao';
import { resumoDoLote, textoDoLote, type ResumoDoLote } from './cartaoDaFila';
import { Icon, ICONE_DO_CONCEITO } from './Icon';

// D-897 · o envio em lote dentro da gaveta da fila.
//
// O operador dispara o lote, o modal fecha e a gaveta abre aqui. Daí ele sai
// para outro projeto e volta quando quiser, porque a gaveta mora na casca e lê
// o lote do backend, não da tela que o disparou.
//
// Um lote que terminou continua aqui até ele tirar da lista, como os jobs.
// Some sozinho seria perder justamente o item que ficou "com você".

const CHAVE_DISPENSADO = 'fila-lote-dispensado';
const ouvintes = new Set<() => void>();

function lerDispensado(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_DISPENSADO);
  } catch {
    return null;
  }
}

/** Tira o lote da gaveta e do trilho. Um lote novo tem outro id e volta a aparecer. */
export function dispensarLote(loteId: string): void {
  try {
    window.localStorage.setItem(CHAVE_DISPENSADO, loteId);
  } catch {
    // sem localStorage, ele some só até recarregar a página
  }
  ouvintes.forEach((avisar) => avisar());
}

function assinar(avisar: () => void): () => void {
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

/** O lote que a fila mostra: o atual, a menos que o operador o tenha tirado da lista. */
export function useLoteDaFila(): LotePublicacao | null {
  const lote = useLoteAtual().data?.lote ?? null;
  const dispensado = useSyncExternalStore(assinar, lerDispensado, lerDispensado);
  return lote && lote.lote_id !== dispensado ? lote : null;
}

function seloDoLote(resumo: ResumoDoLote): [TomDoSelo, string] {
  if (resumo.emCurso) return resumo.cancelado ? ['inerte', 'cancelando'] : ['curso', 'publicando'];
  if (resumo.comVoce > 0) return ['convite', 'com você'];
  return resumo.cancelado ? ['inerte', 'cancelado'] : ['ok', 'terminou'];
}

/** A seção do lote no topo da gaveta. Sem lote, não ocupa lugar. */
export function LoteNaFila({ lote }: { lote: LotePublicacao | null }) {
  const cancelar = useCancelarLote();
  if (!lote) return null;
  const resumo = resumoDoLote(lote);
  const [tom, estado] = seloDoLote(resumo);

  return (
    <section aria-label="Publicação em lote" className="flex flex-col gap-2 rounded-[14px] border border-fio bg-vidro p-3">
      <div className="flex items-center gap-2">
        <Icon name={ICONE_DO_CONCEITO.publicar} className="flex-none text-fg-3" />
        <span className="flex min-w-0 flex-1 flex-col">
          <strong className="text-corpo">Publicação em lote</strong>
          <span className="font-mono text-micro text-fg-3">{textoDoLote(resumo)}</span>
        </span>
        <Selo tom={tom}>{estado}</Selo>
        {resumo.emCurso ? (
          <IconButton
            variant="destrutivo"
            size="pq"
            disabled={cancelar.isPending || resumo.cancelado}
            title="Cancelar o lote: o item em curso termina, os que esperavam são cancelados"
            aria-label="Cancelar o lote"
            onClick={() => cancelar.mutate()}
          >
            <Icon name="ban" />
          </IconButton>
        ) : (
          <IconButton
            variant="fantasma"
            size="pq"
            title="Tirar da lista (o lote já terminou)"
            aria-label="Tirar o lote da lista"
            onClick={() => dispensarLote(lote.lote_id)}
          >
            <Icon name="x" />
          </IconButton>
        )}
      </div>
      {cancelar.isError ? <span className="text-pequeno text-erro">não consegui cancelar, tente de novo</span> : null}
      <PainelDoLote raias={lote.raias} empilhado />
    </section>
  );
}
