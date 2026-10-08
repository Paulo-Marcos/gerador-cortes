import { useSyncExternalStore } from 'react';
import { PainelDoLote } from '@/features/shorts/PainelDoLote';
import type { LotePublicacao } from '@/features/shorts/shortsApi';
import { useCancelarLote, useLoteAtual } from '@/features/shorts/useLotePublicacao';
import { resumoDoLote, textoDoLote, type ResumoDoLote } from './cartaoDaFila';
import { Icon, ICONE_DO_CONCEITO } from './Icon';
import { SeloDeEstado, type TomDoSelo } from './SeloDeEstado';

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
  if (resumo.emCurso) return resumo.cancelado ? ['inerte', 'cancelando'] : ['info', 'publicando'];
  if (resumo.comVoce > 0) return ['aviso', 'com você'];
  return resumo.cancelado ? ['inerte', 'cancelado'] : ['ok', 'terminou'];
}

/** A seção do lote no topo da gaveta. Sem lote, não ocupa lugar. */
export function LoteNaFila({ lote }: { lote: LotePublicacao | null }) {
  const cancelar = useCancelarLote();
  if (!lote) return null;
  const resumo = resumoDoLote(lote);
  const [tom, estado] = seloDoLote(resumo);

  return (
    <section className="card" aria-label="Publicação em lote" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={ICONE_DO_CONCEITO.publicar} style={{ flex: 'none', color: 'var(--mute)' }} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <strong style={{ fontSize: 11.5 }}>Publicação em lote</strong>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>{textoDoLote(resumo)}</span>
        </span>
        <SeloDeEstado tom={tom}>{estado}</SeloDeEstado>
        {resumo.emCurso ? (
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: 24, height: 24, color: 'var(--err)' }}
            disabled={cancelar.isPending || resumo.cancelado}
            title="Cancelar o lote: o item em curso termina, os que esperavam são cancelados"
            aria-label="Cancelar o lote"
            onClick={() => cancelar.mutate()}
          >
            <Icon name="ban" />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: 24, height: 24, color: 'var(--mute)' }}
            title="Tirar da lista (o lote já terminou)"
            aria-label="Tirar o lote da lista"
            onClick={() => dispensarLote(lote.lote_id)}
          >
            <Icon name="x" />
          </button>
        )}
      </div>
      {cancelar.isError ? (
        <span style={{ fontSize: 11, color: 'var(--err)' }}>não consegui cancelar, tente de novo</span>
      ) : null}
      <PainelDoLote raias={lote.raias} empilhado />
    </section>
  );
}
