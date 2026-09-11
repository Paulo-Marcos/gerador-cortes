import { useState } from 'react';
import { Loader2, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useDeleteLayoutPreset,
  useLayoutPresets,
  useSaveLayoutPreset,
  useUpdateLayoutPreset,
} from '@/features/editor/fase2/useLayoutPresets';
import type { PalcoShortPreset } from '@/types/presets';

// D-567: o CRUD de presets sai de dentro do modal do palco.
//
// Ele morava lá como uma classe escondida: 130 linhas de JSX, três estados
// (`nomeNovo`, `renomeando`, `nomeEditado`) e quatro mutações declaradas no topo
// do componente — e nenhum deles usado em mais lugar nenhum. O sintoma é o
// *Divergent Change* do Fowler: o arquivo que descreve COMO A TELA DO SHORT SE
// MONTA precisava ser aberto para mexer no cadastro de presets, que é outro
// assunto e muda por outro motivo.
//
// O que fica aqui é o ciclo inteiro de um preset — criar, aplicar, regravar,
// renomear, apagar. O que o modal continua sabendo é o número da seção e como
// tirar a foto do palco de agora (`comoEstaHoje`), que é dele por natureza: só
// ele conhece os sete controles que compõem o palco.

interface Props {
  /** A foto do palco de agora — o que "Salvar" e "regravar" gravam. */
  comoEstaHoje: () => PalcoShortPreset;
  /** Aplicar COPIA os valores e marca a origem (D-552). */
  onAplicar: (id: string, payload: PalcoShortPreset) => void;
  ocupado: boolean;
}

export function PresetsDoPalco({ comoEstaHoje, onAplicar, ocupado }: Props) {
  const presets = useLayoutPresets({ tipo: 'palco_short' });
  const salvar = useSaveLayoutPreset();
  const renomear = useUpdateLayoutPreset();
  // D-561: instância separada da do rename de propósito. As duas chamam o mesmo
  // endpoint, e compartilhá-las faria o aviso de "regravado" piscar também ao
  // renomear — um retorno que mentiria sobre o que acabou de acontecer.
  const regravar = useUpdateLayoutPreset();
  const apagar = useDeleteLayoutPreset();

  const [nomeNovo, setNomeNovo] = useState('');
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          value={nomeNovo}
          onChange={(e) => setNomeNovo(e.target.value)}
          placeholder="ex.: rosto cheio da live de terça"
          className="h-8 max-w-[260px] text-[12px]"
        />
        <Button
          size="sm"
          disabled={!nomeNovo.trim() || salvar.isPending}
          onClick={() =>
            salvar.mutate(
              { nome: nomeNovo.trim(), tipo: 'palco_short', payload: comoEstaHoje() },
              { onSuccess: () => setNomeNovo('') },
            )
          }
        >
          {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>

      <ul className="mt-2 space-y-1">
        {(presets.data ?? []).map((preset) => (
          <li
            key={preset.id}
            className="flex flex-wrap items-center gap-1.5 rounded-[7px] border border-[var(--wb-border-soft)] px-2 py-1.5"
          >
            {renomeando === preset.id ? (
              <>
                <Input
                  value={nomeEditado}
                  onChange={(e) => setNomeEditado(e.target.value)}
                  className="h-7 max-w-[200px] text-[12px]"
                  autoFocus
                />
                <Button
                  size="sm"
                  disabled={!nomeEditado.trim() || renomear.isPending}
                  onClick={() =>
                    renomear.mutate(
                      { id: preset.id, body: { nome: nomeEditado.trim() } },
                      { onSuccess: () => setRenomeando(null) },
                    )
                  }
                >
                  ok
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenomeando(null)}>
                  cancelar
                </Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-[12px]">{preset.nome}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => onAplicar(preset.id, preset.payload as unknown as PalcoShortPreset)}
                >
                  aplicar
                </Button>
                {/* D-561: regravar o preset com o palco de agora.
                    Faltava a metade de trás do ciclo. Dava para criar, renomear
                    e apagar; para MUDAR um preset, o caminho era salvar outro
                    com nome parecido — e a lista virava quatro variações da
                    mesma ideia, sem dizer qual valia. O endpoint sempre aceitou
                    payload; era a tela que só oferecia o nome. */}
                <Button
                  size="sm"
                  variant="ghost"
                  title="Grava neste preset o palco que está montado agora"
                  disabled={ocupado || regravar.isPending}
                  onClick={() => regravar.mutate({ id: preset.id, body: { payload: comoEstaHoje() } })}
                >
                  <RefreshCw />
                  regravar
                </Button>
                {/* Regravar não muda nada visível — o nome continua o mesmo. Sem
                    este aviso, o clique fica indistinguível de um botão
                    quebrado, que é a mesma lição do veredito do rosto e da
                    régua lisa. */}
                {regravar.isSuccess && regravar.variables?.id === preset.id && (
                  <span className="font-code text-[10px] uppercase tracking-wide text-[var(--wb-accent-strong)]">
                    regravado
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Renomear ${preset.nome}`}
                  onClick={() => {
                    setRenomeando(preset.id);
                    setNomeEditado(preset.nome);
                  }}
                >
                  <Pencil />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Apagar ${preset.nome}`}
                  disabled={apagar.isPending}
                  onClick={() => apagar.mutate(preset.id)}
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
        {(presets.data ?? []).length === 0 && (
          <li className="text-[11.5px] text-[var(--wb-text-mute)]">
            Nenhum preset de short ainda. Os do horizontal têm nomes de cena do OBS e continuam
            servindo de atalho para os recortes — estes aqui são seus.
          </li>
        )}
      </ul>
    </>
  );
}
