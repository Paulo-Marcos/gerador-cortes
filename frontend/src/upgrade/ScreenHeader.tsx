import { AcaoDeIa } from '@/components/ui/acao-de-ia';
import type { ProviderIA } from '@/lib/providerIa';
import { Icon, type IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · O cabeçalho de tela.
//
// Uma linha só, sempre com a mesma gramática: ícone em acento, título
// que responde "onde estou", subtítulo que responde "como estão as
// coisas aqui" e, à direita, as ações da tela inteira. Quem lê o
// protótipo vê que o subtítulo nunca é decorativo — ele carrega
// número ("14 cortes · 3 fire · 412 MB"). É o painel de instrumentos
// da tela, não a legenda dela.
// ─────────────────────────────────────────────────────────────────

export type ScreenAction = {
  icone: IconName;
  texto: string;
  forte?: boolean;
  onClick?: () => void;
  /** Ação de IA: o verbo é dito uma vez e o provedor vira a escolha final,
   *  por ícone (D-609). Com isto, `icone` e `onClick` são ignorados. */
  ia?: { emVoo: ProviderIA | null; onGerar: (provider: ProviderIA) => void };
};

type ScreenHeaderProps = {
  icone: IconName;
  titulo: string;
  sub?: string;
  acoes?: ScreenAction[];
};

export function ScreenHeader({ icone, titulo, sub, acoes = [] }: ScreenHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        flex: 'none',
        padding: '14px 18px 10px',
      }}
    >
      <Icon name={icone} size={17} style={{ color: 'var(--accent)' }} />
      <span style={{ minWidth: 0 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '-.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {titulo}
        </h1>
        {sub ? (
          <p
            style={{
              margin: '1px 0 0',
              fontSize: 12,
              color: 'var(--mute)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sub}
          </p>
        ) : null}
      </span>
      <div style={{ flex: 1 }} />
      {acoes.map((a) =>
        a.ia ? (
          <AcaoDeIa
            key={a.texto}
            rotulo={a.texto}
            tamanho="sm"
            // A altura do `.btn` do design (30 px): lado a lado, os dois têm de
            // parecer a mesma família de botão.
            className="h-[30px]"
            destaque={a.forte}
            emVoo={a.ia.emVoo}
            onGerar={a.ia.onGerar}
          />
        ) : (
          <button
            key={a.texto}
            type="button"
            className={a.forte ? 'btn btn-pri' : 'btn'}
            onClick={a.onClick}
          >
            <Icon name={a.icone} size={13} />
            {a.texto}
          </button>
        ),
      )}
    </div>
  );
}
