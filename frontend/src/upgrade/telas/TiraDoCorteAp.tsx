import { dicaDoPip, textoDaProxima, type EstadoDoPip, type Tira } from '../tiraDoCorte';

// D-746: quatro estados, quatro formas — o âmbar com filete cheio é o
// "parou aqui"; o fantasma é o que ainda vem.
const TOM_DO_PIP: Record<EstadoDoPip, { bg: string; cor: string; filete: string; opacidade: number }> = {
  feito: { bg: 'var(--ok-soft)', cor: 'var(--ok)', filete: 'none', opacidade: 1 },
  agora: { bg: 'var(--warn-soft)', cor: 'var(--warn)', filete: 'inset 0 0 0 1px var(--warn)', opacidade: 1 },
  rejeitado: { bg: 'var(--err-soft)', cor: 'var(--err)', filete: 'none', opacidade: 1 },
  // R4: o pip fantasma media 2,10 no escuro com `opacity: .72` — e ele é A
  // RESPOSTA à queixa "não dá para saber o status". Mantemos o campo
  // `opacidade` no tipo: ele registra que a decisão foi tomada.
  falta: { bg: 'transparent', cor: 'var(--mute)', filete: 'inset 0 0 0 1px var(--line2)', opacidade: 1 },
};

/**
 * A tira do corte na roupa da casca nova, agrupada em CENAS · RENDER ·
 * PUBLICAÇÃO — três perguntas respondíveis ("já gerou cenas?", "já
 * renderizou?") em vez de uma fileira de oito. A regra mora em
 * `montarTira`; aqui só a roupa, para a Pós e o modal usarem a mesma.
 */
/**
 * D-746: a tira para a lista lateral (~200 px). Sem nome de grupo e sem
 * texto — só as siglas, com um respiro entre CENAS · RENDER · PUBLICAÇÃO.
 * A pergunta ali é "qual destes já tem render?", respondida varrendo a cor.
 */
export function TiraMini({ tira }: { tira: Tira }) {
  return (
    <span
      aria-label={`${tira.contagem} etapas${tira.proxima ? ` · próximo: ${tira.proxima.nome}` : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}
    >
      {tira.grupos.map((g) => (
        <span key={g.nome} style={{ display: 'inline-flex', gap: 1.5 }}>
          {g.pips.map((p) => {
            const tom = TOM_DO_PIP[p.estado];
            return (
              <span
                key={p.sigla}
                title={dicaDoPip(p)}
                data-estado={p.estado}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  // R4: 9 px é o piso do dado mínimo da casca; 7,5 px era
                  // escolha local, abaixo de qualquer limiar de leitura.
                  minWidth: 19,
                  height: 14,
                  padding: '0 2px',
                  borderRadius: 2,
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  fontWeight: 700,
                  background: tom.bg,
                  color: tom.cor,
                  boxShadow: tom.filete,
                  opacity: tom.opacidade,
                }}
              >
                {p.sigla}
              </span>
            );
          })}
        </span>
      ))}
    </span>
  );
}

export function TiraDoCorteAp({ tira, compacta = false }: { tira: Tira; compacta?: boolean }) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9 }}>
      {tira.grupos.map((g) => (
        <span
          key={g.nome}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 6px 2px 5px',
            border: '1px solid var(--line2)',
            borderRadius: 'var(--r1)',
            background: 'var(--inset)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '.08em',
              color: 'var(--dim)',
            }}
          >
            {g.nome}
          </span>
          {g.pips.map((p) => {
            const tom = TOM_DO_PIP[p.estado];
            return (
              <span
                key={p.sigla}
                title={dicaDoPip(p)}
                aria-label={dicaDoPip(p)}
                data-estado={p.estado}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  minWidth: 22,
                  height: 15,
                  padding: '0 3px',
                  borderRadius: 2,
                  fontFamily: 'var(--mono)',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '.02em',
                  background: tom.bg,
                  color: tom.cor,
                  boxShadow: tom.filete,
                  opacity: tom.opacidade,
                }}
              >
                {p.sigla}
              </span>
            );
          })}
        </span>
      ))}
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--mute)' }}>
        {tira.contagem}
      </span>
      {compacta ? null : (
        <span
          style={{
            fontSize: 11,
            whiteSpace: 'nowrap',
            color: tira.proxima ? 'var(--warn)' : 'var(--dim)',
          }}
        >
          {textoDaProxima(tira)}
        </span>
      )}
    </span>
  );
}
