import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../Icon';
import { useDefinirChrome } from '../UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A página que não existe.
//
// O protótipo faz uma coisa que a maioria dos 404 não faz: ele DIZ o
// que aconteceu com a rota e oferece o destino que tomou o lugar dela.
// "A rota /projetos/267/export foi aposentada — a pós-produção assumiu
// o lugar dela" resolve; "página não encontrada" só informa o fracasso.
//
// Por isso a tela mostra o caminho pedido: sem ele não dá para escrever
// a frase que ajuda.
// ─────────────────────────────────────────────────────────────────

export default function Erro404Page() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useDefinirChrome({ sub: 'a rota pedida não existe mais' }, [pathname]);

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
      <div
        className="card"
        style={{
          display: 'grid',
          placeItems: 'center',
          gap: 9,
          padding: 32,
          textAlign: 'center',
          maxWidth: 420,
        }}
      >
        <span style={{ fontFamily: 'var(--mono)', fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>
          404
        </span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Esta página não existe</span>
        <span style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--mute)' }}>
          A rota <span style={{ fontFamily: 'var(--mono)' }}>{pathname}</span> não corresponde a
          nenhuma tela do app.
        </span>
        <span style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            <Icon name="arrow-left" size={12} />
            Voltar
          </button>
          <button type="button" className="btn btn-pri" onClick={() => navigate('/projetos')}>
            <Icon name="home" size={12} />
            Biblioteca
          </button>
        </span>
      </div>
    </div>
  );
}
