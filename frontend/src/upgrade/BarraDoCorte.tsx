import { dicaDoPip, resumoDaLinha, type EstadoDoPip, type Tira } from './tiraDoCorte';

// ─────────────────────────────────────────────────────────────────
// D-868 · A barra do corte (Onda 3, nota 3: "estado em palavras").
//
// A linha do Workspace mostrava 11 siglas em três grupos (CENAS BRU CEN ·
// RENDER GRD OVL FIN · PUBLICAÇÃO THU MET YT) — certo, mas ilegível de
// passagem. Fica uma barra de 8 passos, que se lê de longe, e uma frase:
// "3 de 8 · próximo: renderizar overlays". O detalhe de cada etapa segue no
// hover de cada passo. A regra continua em `tiraDoCorte`; aqui é só a roupa.
// ─────────────────────────────────────────────────────────────────

/** As cores da tira (TiraDoCorteAp), no traço cheio de cada passo. */
const COR: Record<EstadoDoPip, string> = {
  feito: 'var(--ok)',
  agora: 'var(--warn)',
  rejeitado: 'var(--err)',
  falta: 'var(--line2)',
};

export function BarraDoCorte({ tira }: { tira: Tira }) {
  const passos = tira.grupos.flatMap((g) => g.pips);
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      {/* A frase abaixo diz o mesmo para o leitor de tela. */}
      <span
        aria-hidden
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${passos.length}, minmax(0, 1fr))`,
          gap: 3,
        }}
      >
        {passos.map((p) => (
          <span
            key={p.sigla}
            data-estado={p.estado}
            title={dicaDoPip(p)}
            style={{ height: 6, borderRadius: 3, background: COR[p.estado] }}
          />
        ))}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--mute)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {resumoDaLinha(tira)}
      </span>
    </span>
  );
}
