import { Button } from '@/components/ui/button';
import { mensagemErro } from '@/lib/mensagemErro';
import { Icon } from '@/upgrade/Icon';

// O que a aba "Canal ativo" mostra enquanto ainda não há lista de canais para
// desenhar: carregando, erro (com "tentar de novo") ou nenhum canal (com
// "criar o primeiro"). Saiu do ChannelsPage (D-804) para a página caber na
// catraca de tamanho de função (D-772) sem subir o teto.

interface Props {
  carregando: boolean;
  /** O erro da consulta, quando ela falhou. */
  erro: unknown;
  vazio: boolean;
  onTentarDeNovo: () => void;
  onCriar: () => void;
}

export function SituacaoDosCanais({ carregando, erro, vazio, onTentarDeNovo, onCriar }: Props) {
  if (carregando) {
    return (
      <p className="flex items-center gap-2 text-linha text-fg-2">
        <Icon name="loader-2" size={16} className="animate-spin" />
        Carregando canais…
      </p>
    );
  }

  if (erro) {
    return (
      <div className="grid gap-3 rounded-campo border border-erro/30 bg-[color-mix(in_oklab,var(--cc-erro)_10%,var(--cc-painel-solido))] p-5">
        <p className="flex items-center gap-2 text-linha text-fg">
          <Icon name="triangle-alert" size={16} className="text-erro" />
          {mensagemErro(erro, 'Não foi possível carregar os canais.')}
        </p>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={onTentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  if (vazio) {
    return (
      <div className="grid gap-3 rounded-campo border border-fio bg-painel-solido p-6 text-center">
        <p className="text-linha text-fg-2">
          Nenhum canal cadastrado ainda. Crie o primeiro para começar.
        </p>
        <div className="flex justify-center">
          <Button type="button" onClick={onCriar}>
            <Icon name="plus" />
            Criar primeiro canal
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
