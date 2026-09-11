import { LayoutTemplate } from 'lucide-react';
import { useDefinirPalcoPadrao, usePalcoPadrao } from './useShortsDoCorte';

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
// A herança é VIVA: trocar aqui reflete na hora em todo short que ninguém
// customizou, e não encosta nos customizados. Nada é copiado — quem resolve é
// a leitura, no `com_palco_do_corte`.

export function PalcoPadraoDoCorte({ corteId }: { corteId: string }) {
  const padrao = usePalcoPadrao(corteId);
  const definir = useDefinirPalcoPadrao(corteId);

  if (padrao.isLoading || padrao.isError) return null;

  const disponiveis = padrao.data?.disponiveis ?? [];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
        <LayoutTemplate size={11} aria-hidden />
        palco
      </span>

      <select
        aria-label="Palco padrão deste corte"
        value={padrao.data?.palco_padrao ?? ''}
        disabled={definir.isPending}
        onChange={(e) => definir.mutate(e.target.value)}
        className="h-7 max-w-[230px] rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
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

      <span className="text-[11px] text-[var(--wb-text-mute)]">
        {disponiveis.length === 0
          ? 'nenhum palco salvo — monte um em Definir o palco, num trecho'
          : 'vale para todos os trechos; o que você ajustar num trecho continua valendo lá'}
      </span>
    </div>
  );
}
