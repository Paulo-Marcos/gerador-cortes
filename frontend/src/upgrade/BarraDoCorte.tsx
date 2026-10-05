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

/**
 * Cor E forma, como a tira (D-746: quatro estados, quatro formas) — `--ok` e
 * `--warn` têm a mesma luminosidade, e só a matiz não basta para quem não
 * distingue as duas. Feito é cheio; agora é vazado; falta é o traço da
 * linha (o `--line2` de antes quase sumia); rejeitado é cheio em erro.
 */
const PASSO: Record<EstadoDoPip, { background: string; boxShadow?: string }> = {
  feito: { background: 'var(--ok)' },
  agora: { background: 'var(--warn-soft)', boxShadow: 'inset 0 0 0 1.5px var(--warn)' },
  rejeitado: { background: 'var(--err)' },
  falta: { background: 'var(--line)' },
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
            style={{ height: 6, borderRadius: 3, ...PASSO[p.estado] }}
          />
        ))}
      </span>
      {/* A frase quebra em vez de cortar: na coluna da barra, "6 de 8 ·
          próximo: completar metadados" não cabe numa linha (achado da
          pr-audit, medido em 213 px). Inteira também no hover. */}
      <span
        title={resumoDaLinha(tira)}
        style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--mute)' }}
      >
        {resumoDaLinha(tira)}
      </span>
    </span>
  );
}
