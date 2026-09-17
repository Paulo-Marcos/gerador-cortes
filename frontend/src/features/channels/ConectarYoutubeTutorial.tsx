// D-628: passo a passo para quem instala o app e nunca criou um cliente OAuth.
// Sem o `client_secrets.json` o botão "Conectar YouTube" fica desligado, e a
// única pista era "falta o arquivo na raiz do backend". Cada instalação usa o
// PRÓPRIO projeto no Google Cloud: não há crachá compartilhado para distribuir.
import { useState } from 'react';
import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyTextToClipboard } from '@/lib/clipboard';

const CONSOLE_URL = 'https://console.cloud.google.com/';
const API_URL = 'https://console.cloud.google.com/apis/library/youtube.googleapis.com';

interface ConectarYoutubeTutorialProps {
  /** Caminho exato onde o backend procura o `client_secrets.json`. */
  destino: string;
  /** Aberto quando o arquivo ainda falta; recolhido quando só serve de consulta. */
  abertoDeInicio: boolean;
  onChecarDeNovo: () => void;
}

function Link({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 font-medium text-[var(--wb-accent)] underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink size={11} aria-hidden />
    </a>
  );
}

export function ConectarYoutubeTutorial({
  destino,
  abertoDeInicio,
  onChecarDeNovo,
}: ConectarYoutubeTutorialProps) {
  const [copiado, setCopiado] = useState(false);

  const copiarDestino = async () => {
    setCopiado(await copyTextToClipboard(destino));
  };

  return (
    <details
      open={abertoDeInicio}
      className="rounded-md border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-3 py-2 text-xs text-[var(--wb-text-mute)]"
    >
      <summary className="cursor-pointer text-sm font-semibold text-[var(--wb-text)]">
        Como conectar o YouTube
      </summary>

      <p className="mt-2">
        O Google exige que cada instalação tenha o próprio “crachá” (um cliente OAuth). Você cria
        uma vez, de graça, em uns 10 minutos.
      </p>

      <ol className="mt-2 grid list-decimal gap-2 pl-5">
        <li>
          Abra o <Link href={CONSOLE_URL}>Google Cloud Console</Link> com a conta do canal e crie
          um projeto novo (seletor de projeto → <b>Novo projeto</b>).
        </li>
        <li>
          Ative a <Link href={API_URL}>YouTube Data API v3</Link> nesse projeto.
        </li>
        <li>
          Em <b>Google Auth Platform</b>, configure a tela de consentimento: público{' '}
          <b>Externo</b>, nome do app e seu e-mail. Em <b>Público</b>, adicione o e-mail da conta
          do canal como <b>usuário de teste</b>.
        </li>
        <li>
          Em <b>Clientes</b>, crie um cliente do tipo <b>App para computador</b> e baixe o JSON.
        </li>
        <li className="grid gap-1">
          <span>
            Renomeie o arquivo para <code>client_secrets.json</code> e salve exatamente aqui:
          </span>
          <span className="flex items-center gap-1.5">
            <code className="min-w-0 truncate rounded bg-[var(--wb-bg-inset)] px-1.5 py-0.5 text-[var(--wb-text)]">
              {destino}
            </code>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={copiarDestino}
              aria-label="Copiar caminho"
            >
              {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          </span>
        </li>
        <li className="grid gap-1">
          <span>
            Clique em <b>Checar de novo</b> e depois em <b>Conectar YouTube</b>. No navegador,
            escolha a conta do canal. O aviso “O Google não verificou este app” é esperado: o app
            é seu. Clique em <b>Avançado</b> → <b>Acessar</b>.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onChecarDeNovo} className="w-fit">
            <RefreshCw aria-hidden />
            Checar de novo
          </Button>
        </li>
      </ol>

      <p className="mt-3 font-semibold text-[var(--wb-text)]">Se algo der errado</p>
      <ul className="mt-1 grid list-disc gap-1 pl-5">
        <li>
          <b>Erro 403: access_denied</b>: a conta usada no login não está entre os usuários de
          teste (passo 3).
        </li>
        <li>
          <b>Precisa reconectar toda semana</b>: com o app em modo de teste, o Google expira o
          login em 7 dias. Em <b>Público</b>, clique em <b>Publicar app</b>; ele continua só seu,
          sem passar por verificação.
        </li>
        <li>
          <b>Upload recusado por cota</b>: a API tem limite diário de uso. Espere o dia virar
          (horário do Pacífico) e tente de novo.
        </li>
      </ul>
    </details>
  );
}
