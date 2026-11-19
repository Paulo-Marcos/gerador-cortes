import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AvatarDoCanal } from '@/components/ui/avatar-do-canal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/toaster';
import type { Canal } from '@/features/channels/api/canais';
import { useCanais, useSelecionarCanal } from '@/features/channels/useChannels';
import { luzDoCanal, type LuzDoCanal } from '@/lib/luzDoCanal';
import { mensagemErro } from '@/lib/mensagemErro';
import { useUpgradeTheme, type Tema } from '@/lib/tema';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-1137 (E-069 H-13) · A ficha do canal e a troca de canal (DIRECAO §7.0 e §7.9).
//
// A ficha é o primeiro item do trilho: o avatar com a luz do canal, o nome e o
// handle. É para esse canal que tudo é publicado (o token do YouTube é por
// canal), então ele fica à vista — antes morava num chip da barra superior.
// Apertar abre o popover de 332 px com a lista de canais, "Novo canal",
// "Configurar o …" e uma frase do que a troca muda. O feixe e os atalhos são do
// CutCut e não mudam; a biblioteca, as skills e a aurora são do canal e mudam.
// ─────────────────────────────────────────────────────────────────

/** A luz do anel do avatar: a paleta cadastrada, senão a amostra das capas (B-3). */
export function luzDaFicha(canal: Pick<Canal, 'paleta' | 'luz'>, tema: Tema): LuzDoCanal | null {
  const [a, b] = canal.luz ?? [];
  return luzDoCanal({ paleta: canal.paleta, amostra: a ? { a, b: b ?? a } : null }, tema === 'dark' ? 'escuro' : 'claro');
}

const LINHA_DO_MENU =
  'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-corpo text-fg hover:bg-vidro-2 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foco';

/** O conteúdo do popover. Só monta aberto: é quem fala com a API e com os avisos. Exportado para o teste. */
export function ListaDeCanais({ canais, tema, fechar }: { canais: Canal[]; tema: Tema; fechar: () => void }) {
  const selecionar = useSelecionarCanal();
  const { notify } = useToast();
  const ativo = canais.find((c) => c.ativo);
  const trocar = (canal: Canal) => {
    if (canal.ativo) return fechar();
    selecionar.mutate(canal.id, {
      // Mesmas mensagens da tela de Canais: a troca pode pedir para reabrir o app.
      onSuccess: (res) =>
        res.requer_restart
          ? notify(
              `Canal “${canal.nome || canal.id}” escolhido. Feche e abra o app para a troca valer. ` +
                'Até lá, não processe nada: o banco ainda é o do canal anterior.',
              { tone: 'warning', title: 'Feche e abra o app' },
            )
          : notify(`Canal “${canal.nome || canal.id}” ativado.`, { tone: 'success' }),
      onError: (erro) => notify(mensagemErro(erro, 'Erro ao selecionar canal.'), { tone: 'error' }),
      onSettled: fechar,
    });
  };
  return (
    <div className="flex flex-col gap-px">
      <p className="px-2.5 pb-1 pt-2 text-micro text-fg-3">Canais</p>
      {canais.map((c) => (
        <button key={c.id} type="button" aria-current={c.ativo || undefined} disabled={selecionar.isPending} onClick={() => trocar(c)} className={cn(LINHA_DO_MENU, 'h-12 disabled:cursor-progress')}>
          <AvatarDoCanal nome={c.nome || c.id} luz={luzDaFicha(c, tema)} tamanho={28} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{c.nome || c.id}</span>
            <span className="block truncate text-micro font-medium text-fg-3">{c.handle}</span>
          </span>
          {c.ativo ? <Icon name="check" size={16} className="flex-none text-iris" /> : null}
        </button>
      ))}
      <hr className="my-1.5 h-px border-0 bg-fio" />
      {/* A tela de Canais é onde o canal nasce (o "Novo canal" de lá abre o formulário). */}
      <Link to="/canais" onClick={fechar} className={cn(LINHA_DO_MENU, 'h-[34px]')}>
        <Icon name="plus" className="text-fg-3" />
        Novo canal
      </Link>
      {ativo ? (
        <Link to="/canais" onClick={fechar} className={cn(LINHA_DO_MENU, 'h-[34px]')}>
          <Icon name="settings" className="text-fg-3" />
          <span className="truncate">Configurar o {ativo.nome || ativo.id}</span>
        </Link>
      ) : null}
      <p className="px-2.5 pb-1.5 pt-2 text-pequeno text-fg-3">
        Trocar de canal muda a biblioteca, as skills e a aurora. O feixe e os atalhos continuam os mesmos.
      </p>
    </div>
  );
}

/** A ficha no topo do trilho. Recolhido, fica só o avatar, com o nome no rótulo. */
export function FichaDoCanal({ expandido }: { expandido: boolean }) {
  const canais = useCanais().data?.canais ?? [];
  const { theme } = useUpgradeTheme();
  const [aberto, setAberto] = useState(false);
  const ativo = canais.find((c) => c.ativo);
  if (!ativo) return null;
  const nome = ativo.nome || ativo.id;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Canal ativo: ${nome}. Trocar de canal`}
          title={`Canal ativo: ${nome} (${ativo.handle}). É para ele que os cortes são publicados.`}
          className={cn(
            'flex flex-none items-center gap-2.5 rounded-bloco border border-fio bg-vidro text-left hover:bg-vidro-2',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
            expandido ? 'min-w-0 flex-1 p-2' : 'p-1',
          )}
        >
          <AvatarDoCanal nome={nome} luz={luzDaFicha(ativo, theme)} tamanho={expandido ? 40 : 34} />
          {expandido ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-corpo font-bold text-fg">{nome}</span>
                <span className="block truncate text-micro font-medium text-fg-3">{ativo.handle}</span>
              </span>
              <Icon name="chevron-down" className="flex-none text-fg-3" />
            </>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-[332px] p-1.5">
        <ListaDeCanais canais={canais} tema={theme} fechar={() => setAberto(false)} />
      </PopoverContent>
    </Popover>
  );
}
