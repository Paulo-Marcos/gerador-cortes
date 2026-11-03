import { Icon } from '@/upgrade/Icon';

/**
 * D-1032: a API de cortes falhou. Diz isso e oferece tentar de novo — nunca o
 * "Analisar com a IA" da live vazia, que soma cortes aos existentes e gasta IA.
 */
export function FalhaDosCortes({
  mensagem,
  tentarDeNovo,
}: {
  mensagem: string;
  tentarDeNovo: () => void;
}) {
  return (
    <div
      role="alert"
      className="card"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 9,
        padding: '11px 12px',
        borderColor: 'var(--err-soft)',
      }}
    >
      <Icon name="triangle-alert" style={{ color: 'var(--err)' }} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>
          Não consegui carregar os cortes desta live
        </span>
        <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, lineHeight: 1.5, color: 'var(--mute)' }}>
          {mensagem}
        </span>
      </span>
      <button type="button" className="btn" style={{ height: 24, fontSize: 11 }} onClick={tentarDeNovo}>
        Tentar de novo
      </button>
    </div>
  );
}

/** Live sem cortes (ou busca/filtro que escondeu todos): diz por quê. */
export function ListaVazia({
  texto,
  ofereceAnalise,
  analisar,
}: {
  texto: string;
  ofereceAnalise: boolean;
  analisar: () => void;
}) {
  return (
    <div
      className="card"
      style={{ display: 'grid', placeItems: 'center', gap: 7, padding: 22, textAlign: 'center' }}
    >
      <Icon name="inbox" size={20} style={{ color: 'var(--dim)' }} />
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{texto}</span>
      {ofereceAnalise ? (
        <button type="button" className="btn btn-pri" onClick={analisar}>
          <Icon name="brain" />
          Analisar com a IA
        </button>
      ) : null}
    </div>
  );
}
