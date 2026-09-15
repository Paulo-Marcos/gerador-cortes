import { LayoutTemplate, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDefinirPalcoPadrao, usePalcoPadrao, useSeguirPalcoPadrao } from './useShortsDoCorte';

// D-570: o palco que vale para TODOS os shorts deste corte.
//
// "Tem que ter uma definição que atinja todos os cortes por default, e daí eu
// posso customizar cada um. Hoje o que aparece é o RECORTES, e isso está
// errado — o que tem que aparecer para todos é o PALCO."
//
// Estava errado mesmo, e por uma razão que o código explica: o RECORTES ocupava
// este lugar porque era o único ajuste de corte inteiro que existia. Ele
// responde DE ONDE VEM cada janela (onde estão a pessoa e a tela dentro do
// quadro do OBS) — infraestrutura, resolvida quase sempre pelas regiões já
// marcadas no editor do horizontal. O operador raramente precisa tocá-lo, e
// mesmo assim era a primeira pergunta da tela.
//
// O PALCO é a decisão que ele repete a cada trecho: como a tela monta, que
// tamanho, que textura, que legenda. Essa é que merecia o lugar.
//
// D-585: e a APARÊNCIA DO GANCHO entrou no pacote, pela mesma lógica. Ela
// nascera por-short (D-581), e a pergunta que expôs o erro foi direta: "tem
// algum lugar onde eu configure o padrão de todos os shorts do corte?". Não
// tinha — e escolher amarelo-com-caixa custava repetir a escolha em cada um dos
// oito trechos que um corte rende. O TEXTO do gancho continua por trecho: cada
// short promete uma coisa.
//
// A herança é VIVA: trocar aqui reflete na hora em todo short que ninguém
// customizou, e não encosta nos customizados. Nada é copiado — quem resolve é
// a leitura, no `com_palco_do_corte`.

//
// D-594: e o palco ganhou "editar" e "novo" aqui mesmo. Escolher da lista não
// bastava — "às vezes eu vou ter que criar". O editor abre sobre um rascunho,
// com o trecho em foco emprestando o quadro (`PresetDoPalcoModal`).

interface Props {
  corteId: string;
  /** Sem trecho não há quadro da live para montar um palco em cima. */
  podeEditar: boolean;
  /** `null` = criar um preset novo. */
  onEditar: (presetId: string | null) => void;
}

export function PalcoPadraoDoCorte({ corteId, podeEditar, onEditar }: Props) {
  const padrao = usePalcoPadrao(corteId);
  const definir = useDefinirPalcoPadrao(corteId);
  const seguir = useSeguirPalcoPadrao(corteId);

  if (padrao.isLoading || padrao.isError) return null;

  const disponiveis = padrao.data?.disponiveis ?? [];
  const escolhido = padrao.data?.palco_padrao ?? '';
  const customizados = padrao.data?.customizados ?? 0;
  const semTrecho = 'Crie um trecho antes: o palco é montado sobre o quadro dele.';

  // Aplicar um palco num trecho COPIA os valores (D-552): o trecho parece
  // seguir o padrão, mas congelou. Sem este aviso, trocar o padrão "não muda
  // nada" justamente nele — a mesma armadilha que o gancho já resolveu assim.
  const fazerTodosSeguirem = () => {
    const pergunta =
      `${customizados} ${customizados === 1 ? 'trecho tem' : 'trechos têm'} palco próprio ` +
      '(arranjo, janelas, textura ou legenda). Eles passam a seguir o palco padrão do corte — ' +
      'bordas e gancho continuam como estão. Continuar?';
    if (confirm(pergunta)) seguir.mutate();
  };

  return (
    <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex w-[58px] items-center gap-1 font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
        <LayoutTemplate size={11} aria-hidden />
        palco
      </span>

      <select
        aria-label="Palco padrão deste corte — vale também para a legenda"
        value={escolhido}
        disabled={definir.isPending}
        onChange={(e) => definir.mutate(e.target.value)}
        className="h-7 max-w-[190px] rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
      >
        {/* "cada trecho decide" e não "nenhum": sem padrão o short não fica sem
            palco — ele cai no automático, que é o que sempre foi. */}
        <option value="">cada trecho decide</option>
        {disponiveis.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.nome}
          </option>
        ))}
      </select>

      <Button
        size="sm"
        variant="ghost"
        disabled={!escolhido || !podeEditar}
        title={podeEditar ? undefined : semTrecho}
        aria-label="Editar o palco padrão"
        onClick={() => onEditar(escolhido)}
      >
        <Pencil />
        editar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={!podeEditar}
        title={podeEditar ? undefined : semTrecho}
        onClick={() => onEditar(null)}
      >
        <Plus />
        novo
      </Button>
    </div>

    {escolhido && customizados > 0 && (
      <p className="pl-[64px] text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
        {customizados} {customizados === 1 ? 'trecho não segue' : 'trechos não seguem'} o padrão.{' '}
        <button
          type="button"
          disabled={seguir.isPending}
          onClick={fazerTodosSeguirem}
          className="text-[var(--wb-accent)] underline-offset-2 hover:underline disabled:opacity-45"
        >
          fazer todos seguirem
        </button>
      </p>
    )}
    </div>
  );
}
