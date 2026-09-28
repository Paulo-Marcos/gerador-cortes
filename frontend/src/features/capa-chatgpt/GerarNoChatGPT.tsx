import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mensagemDoRobo, type ProporcaoDaCapa } from './api';
import { useConfiguracaoCapaChatgpt, useGerarNoChatGPT } from './useCapaNoChatGPT';

// D-804: o botão que troca o copiar-colar-no-ChatGPT por um clique.
//
// O robô abre o projeto do ChatGPT no Edge do operador, anexa as fichas, cola o
// prompt, espera e traz a imagem. Quem recebe a imagem é `entregar` — o mesmo
// upload do Ctrl+V desta capa —, então moldura, montagem e o que mais a capa
// fizer continuam onde sempre estiveram.
//
// A janela do Edge fica aberta de propósito: se a imagem não agradar, o
// operador pede outra versão ali mesmo e cola do jeito antigo.

interface Props {
  /** O prompt da capa; sem ele não há o que mandar. */
  prompt?: string;
  proporcao: ProporcaoDaCapa;
  entregar: (arquivo: File) => Promise<unknown>;
  /** A capa está ocupada com outra coisa (subindo, montando). */
  desabilitado?: boolean;
  className?: string;
}

export function GerarNoChatGPT({ prompt, proporcao, entregar, desabilitado, className }: Props) {
  const config = useConfiguracaoCapaChatgpt();
  const gerar = useGerarNoChatGPT(proporcao, entregar);
  const configurado = Boolean(config.data?.projeto_url);
  const texto = prompt?.trim() ?? '';

  const motivo = !configurado
    ? 'Configure o projeto do ChatGPT em Canais → Capas no ChatGPT.'
    : !texto
      ? 'Gere o prompt da capa primeiro.'
      : `Abre o projeto no Edge, anexa as fichas, cola o prompt e traz a imagem ${proporcao}.`;

  return (
    <div className={cn('grid gap-1', className)}>
      <Button
        type="button"
        size="sm"
        disabled={desabilitado || gerar.isPending || !configurado || !texto}
        onClick={() => gerar.mutate(texto)}
        title={motivo}
      >
        {gerar.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {gerar.isPending ? 'Gerando no ChatGPT…' : 'Gerar no ChatGPT'}
      </Button>
      {gerar.isPending && (
        <span aria-live="polite" className="text-[10.5px] leading-snug text-[var(--wb-text-mute)]">
          cerca de 1 minuto — acompanhe na janela do Edge
        </span>
      )}
      {gerar.isError && (
        <span role="alert" className="text-[10.5px] leading-snug text-error">
          {mensagemDoRobo(gerar.error, 'Não consegui gerar no ChatGPT.')}
        </span>
      )}
    </div>
  );
}
