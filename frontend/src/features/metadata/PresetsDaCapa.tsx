import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { NomeDoPresetDialog } from '@/features/editor/fase2/NomeDoPresetDialog';
import { PresetsNaFaixa } from '@/features/editor/fase2/BarraDePresets';
import {
  useDeleteLayoutPreset,
  useLayoutPresets,
  useSaveLayoutPreset,
  useUpdateLayoutPreset,
} from '@/shared/palco/useLayoutPresets';
import type { EstiloDaCapaTiktok } from '@/types/presets';
import { Icon, ICONE_DO_CONCEITO } from '@/upgrade/Icon';

// D-933: os presets da capa do TikTok — o mesmo catálogo de presets de layout,
// tipo `capa_tiktok`. Escolher um aplica o estilo dele ao rascunho; salvar
// guarda o rascunho com um nome.

type Dialogo = 'novo' | 'renomear' | null;

export function PresetsDaCapa({
  rascunho,
  onAplicar,
}: {
  rascunho: EstiloDaCapaTiktok;
  onAplicar: (estilo: EstiloDaCapaTiktok) => void;
}) {
  const presets = useLayoutPresets({ tipo: 'capa_tiktok' }).data ?? [];
  const salvar = useSaveLayoutPreset();
  const atualizar = useUpdateLayoutPreset();
  const remover = useDeleteLayoutPreset();
  const [selecionado, setSelecionado] = useState('');
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [nome, setNome] = useState('');

  const erro = salvar.error ?? atualizar.error ?? remover.error;

  const abrir = (qual: Exclude<Dialogo, null>) => {
    setNome(qual === 'renomear' ? (presets.find((p) => p.id === selecionado)?.nome ?? '') : '');
    setDialogo(qual);
  };

  const confirmar = () => {
    const fechar = { onSuccess: () => setDialogo(null) };
    if (dialogo === 'novo') {
      salvar.mutate(
        { nome, tipo: 'capa_tiktok', payload: rascunho },
        { onSuccess: (preset) => (setSelecionado(preset.id), setDialogo(null)) },
      );
    } else {
      atualizar.mutate({ id: selecionado, body: { nome } }, fechar);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PresetsNaFaixa
        presets={presets}
        selecionado={selecionado}
        onAplicar={(id) => {
          const preset = presets.find((p) => p.id === id);
          if (!preset) return;
          setSelecionado(id);
          onAplicar(preset.payload as EstiloDaCapaTiktok);
        }}
        onRenomear={() => abrir('renomear')}
        onRemover={() => remover.mutate(selecionado, { onSuccess: () => setSelecionado('') })}
        renomeando={atualizar.isPending}
        removendo={remover.isPending}
      />
      <Button type="button" size="sm" variant="outline" onClick={() => abrir('novo')}>
        <Icon name="bookmark" />
        Salvar como preset
      </Button>
      {erro && <p className="w-full text-[11px] text-[var(--wb-err)]">{erro.message}</p>}
      {dialogo && (
        <NomeDoPresetDialog
          titulo={dialogo === 'novo' ? 'Novo preset da capa' : 'Renomear preset'}
          descricao="Guarda o estilo, o que aparece e onde cada componente fica."
          placeholder="Ex.: Limpo com cabeçalho"
          value={nome}
          onChange={setNome}
          onConfirm={confirmar}
          onClose={() => setDialogo(null)}
          confirmLabel={dialogo === 'novo' ? 'Salvar preset' : 'Renomear'}
          confirmIcon={dialogo === 'novo' ? 'save' : ICONE_DO_CONCEITO.renomear}
          pending={salvar.isPending || atualizar.isPending}
        />
      )}
    </div>
  );
}
