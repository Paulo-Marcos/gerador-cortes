import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Icon } from './Icon';
import { useDefinirChrome } from './UpgradeChrome';

// ─────────────────────────────────────────────────────────────────
// D-599 · A página que não existe.
//
// O protótipo faz uma coisa que a maioria dos 404 não faz: ele DIZ o
// que aconteceu com a rota. Por isso a tela mostra o caminho pedido: sem
// ele não dá para escrever a frase que ajuda.
//
// D-1144 (E-069 H-14): na Sala escura. Cartão de vidro chapado (sem fio de luz: só o
// "Continue" da Biblioteca leva, DIRECAO §3.1), UMA primária ("Biblioteca") e o
// "Voltar" secundário.
// ─────────────────────────────────────────────────────────────────

export default function Erro404Page() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useDefinirChrome({ sub: 'a rota pedida não existe mais' }, [pathname]);

  return (
    <div className="grid min-h-80 place-items-center">
      <div className="grid max-w-[420px] place-items-center gap-2.5 rounded-[22px] border border-fio bg-vidro p-8 text-center">
        <span className="font-mono text-titulo font-bold text-fg-3">404</span>
        <h1 className="m-0 text-linha text-fg">Esta página não existe</h1>
        <p className="m-0 text-corpo text-fg-2">
          A rota <span className="font-mono text-fg">{pathname}</span> não corresponde a nenhuma tela do app.
        </p>
        <span className="mt-1 flex gap-2">
          <Button variant="secundario" onClick={() => navigate(-1)}>
            <Icon name="arrow-left" />
            Voltar
          </Button>
          <Button variant="primario" onClick={() => navigate('/projetos')}>
            <Icon name="home" />
            Biblioteca
          </Button>
        </span>
      </div>
    </div>
  );
}
