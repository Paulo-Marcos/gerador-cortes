import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import type { EtapaProjeto } from './UpgradeChrome';
import type { PassoDaLive } from './upgradeRoutes';
import { TOM_DA_ETAPA } from './SeloDeEstado';

// ─────────────────────────────────────────────────────────────────
// D-599 Rodada 2 · A fita da live.
//
// As cinco fases de uma live (Workspace → Cortes → Pós → Metadados →
// Revisão) estavam no TRILHO, e era isso que fazia o menu global mudar
// de tamanho: entrar numa live empurrava Shorts, Inteligência e o
// rodapé 170 px para baixo. Um menu que se move deixa de ser um lugar
// fixo — que é a única coisa que um menu global precisa ser.
//
// Aqui elas ficam: uma faixa de 32 px logo abaixo da barra superior,
// visível só nas telas de dentro de uma live. Um lugar, sempre o mesmo,
// com a fase atual acesa. A esteira em botões de 24 px da coluna de
// contexto saiu junto — era a segunda de três representações.
//
// Custo honesto: +32 px de altura nas telas de live; a fusão do
// cabeçalho na barra superior (`chrome.denso`) devolve ~46 px nas telas
// de bancada, que são as mesmas onde a altura é escassa.
// ─────────────────────────────────────────────────────────────────

type FitaProps = {
  passos: PassoDaLive[];
  /** Estado real (feito/a fazer) quando a tela o conhece. Casado por
   *  título — a fita sozinha já sabe qual é a fase ATUAL. */
  etapas?: EtapaProjeto[];
};

// R4: a QUARTA cópia da tabela de etapas — e a única que ainda pintava a
// fase atual com a tinta dos botões. Vem do vocabulário do selo; aqui só
// mora a borda, que é desenho desta fita.
const TOM = {
  feito: { ...TOM_DA_ETAPA.feito, borda: 'transparent' },
  agora: { ...TOM_DA_ETAPA['em-curso'], borda: 'var(--warn)' },
  todo: { bg: 'transparent', cor: TOM_DA_ETAPA.pendente.cor, borda: 'var(--line)' },
};

export function FitaDaLive({ passos, etapas }: FitaProps) {
  if (passos.length === 0) return null;

  const estadoDe = (passo: PassoDaLive): keyof typeof TOM => {
    if (passo.agora) return 'agora';
    const casada = etapas?.find(
      (e) => e.titulo.toLowerCase() === passo.texto.toLowerCase(),
    );
    if (casada?.estado === 'feito') return 'feito';
    return 'todo';
  };

  return (
    <nav
      aria-label="Fases da live"
      className="gl"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flex: 'none',
        height: 32,
        padding: '0 12px',
        borderBottom: '1px solid var(--line)',
        overflowX: 'auto',
      }}
    >
      {passos.map((p, i) => {
        const tom = TOM[estadoDe(p)];
        const conteudo = (
          <>
            <Icon name={p.icone} size={12} />
            {p.texto}
          </>
        );
        return (
          <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
            {i > 0 ? (
              <Icon name="chevron-right" size={11} style={{ color: 'var(--dim)' }} />
            ) : null}
            {p.to && !p.agora ? (
              <Link
                to={p.to}
                aria-current={p.agora ? 'step' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 24,
                  padding: '0 8px',
                  border: `1px solid ${tom.borda}`,
                  borderRadius: 'var(--r1)',
                  background: tom.bg,
                  color: tom.cor,
                  fontSize: 11.5,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {conteudo}
              </Link>
            ) : (
              <span
                aria-current={p.agora ? 'step' : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 24,
                  padding: '0 8px',
                  border: `1px solid ${tom.borda}`,
                  borderRadius: 'var(--r1)',
                  background: tom.bg,
                  color: tom.cor,
                  fontSize: 11.5,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {conteudo}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
