import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useLayoutPresets } from '@/shared/palco/useLayoutPresets';
import type { PalcoShortPreset } from '@/types/presets';
import { DefinirPalcoModal } from './DefinirPalcoModal';
import { mudancaDoPalco, palcoDoShort } from './aplicarPalco';
import { shortsApi, type AtualizarShortBody, type ShortSugerido } from './shortsApi';
import { PALCO_KEY, useGuardarPresetPadrao, usePalcoPadrao } from './useShortsDoCorte';

// D-594: criar e editar um PALCO a partir do menu de padrões do corte.
//
// "Hoje só tem a opção de escolher da lista, mas às vezes eu vou ter que criar."
// Criar existia — mas escondido: ajustar um trecho, abrir o "Definir o palco",
// descer até a seção 7 e salvar. E editar um preset era pior: aplicar num
// trecho, mexer, "regravar" — sujando o trecho no caminho.
//
// Aqui o mesmo editor trabalha sobre um RASCUNHO. O trecho em foco só empresta
// o quadro da live (os recortes são medidos sobre ele) e nada é gravado nele:
// cada clique muda o rascunho, e o backend desenha o plano que ele produziria
// sem tocar no banco — a mesma conta do render, servida pelo `simular`.

/** Os campos do trecho que descrevem o palco — os que o rascunho manda simular. */
const CAMPOS_DO_RASCUNHO = [
  'arranjo_palco',
  'janela_cheia',
  'ajustes_palco',
  'recortes_palco',
  'fundo_editorial',
  'legenda_cor',
  'legenda_fonte',
  'palco_preset',
  'moldura',
] as const;

interface Props {
  onClose: () => void;
  corteId: string;
  /** `null` = criar um preset novo, partindo do palco padrão atual. */
  presetId: string | null;
  /** O trecho que empresta o quadro. */
  base: ShortSugerido;
  fonte: { largura: number; altura: number };
  video: React.RefObject<HTMLVideoElement | null>;
  tempoAtualSeg: number;
}

interface PresetCarregado {
  id: string;
  nome: string;
  payload: Partial<PalcoShortPreset>;
}

export function PresetDoPalcoModal(props: Props) {
  const presets = useLayoutPresets({ tipo: 'palco_short' });
  const padrao = usePalcoPadrao(props.corteId);

  // O rascunho nasce do preset — ou, num preset novo, do padrão atual. Montar
  // o editor antes de os dois chegarem o faria nascer com o palco errado.
  const idDeOrigem = props.presetId ?? padrao.data?.palco_padrao ?? '';
  const achado = (presets.data ?? []).find((p) => p.id === idDeOrigem);
  const esperando = presets.isLoading || padrao.isLoading;

  if (esperando || (props.presetId && !achado)) {
    return (
      <Modal open onClose={props.onClose} title="Palco do corte" size="sm">
        <p className="text-[12.5px] text-[var(--wb-text-dim)]">
          {esperando ? 'Carregando o preset…' : 'Este preset não existe mais.'}
        </p>
      </Modal>
    );
  }

  const origem: PresetCarregado | null = achado
    ? {
        id: achado.id,
        nome: achado.nome,
        payload: achado.payload as unknown as Partial<PalcoShortPreset>,
      }
    : null;

  return (
    <EditorDoPresetDePalco
      key={props.presetId ?? 'novo'}
      {...props}
      origem={origem}
      editando={props.presetId ? origem : null}
    />
  );
}

function EditorDoPresetDePalco({
  onClose,
  corteId,
  base,
  fonte,
  video,
  tempoAtualSeg,
  origem,
  editando,
}: Props & { origem: PresetCarregado | null; editando: PresetCarregado | null }) {
  const [rascunho, setRascunho] = useState<ShortSugerido>(() =>
    origem ? { ...base, ...mudancaDoPalco(origem.id, origem.payload) } : base,
  );
  const [nome, setNome] = useState(editando?.nome ?? '');
  const [virarPadrao, setVirarPadrao] = useState(true);

  const campos = useMemo(
    () => Object.fromEntries(CAMPOS_DO_RASCUNHO.map((campo) => [campo, rascunho[campo]])),
    [rascunho],
  );

  // `keepPreviousData`: entre um clique e a resposta, a prévia segue com o
  // último plano em vez de piscar vazia.
  const plano = useQuery({
    queryKey: [...PALCO_KEY, 'rascunho', base.id, campos],
    queryFn: () => shortsApi.simularPalco(base.id, {}, campos),
    placeholderData: keepPreviousData,
  });

  const { gravando, erro, apagando, salvar, apagar } = useGuardarPresetPadrao({
    tipo: 'palco_short',
    corteId,
    editando,
    onClose,
  });

  const rodape = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome do preset de palco"
          placeholder="ex.: rosto cheio com a textura do canal"
          className="h-8 max-w-[260px] text-[12px]"
        />
        <Button
          size="sm"
          disabled={!nome.trim() || gravando}
          onClick={() => void salvar(nome, palcoDoShort(rascunho), virarPadrao)}
        >
          {gravando ? <Loader2 className="animate-spin" /> : <Save />}
          {editando ? 'Salvar alterações' : 'Criar preset'}
        </Button>
        {editando && (
          <Button size="sm" variant="ghost" disabled={apagando} onClick={apagar}>
            <Trash2 />
            apagar
          </Button>
        )}
      </div>
      <label className="flex items-center gap-1.5 text-[11.5px] text-[var(--wb-text-dim)]">
        <input
          type="checkbox"
          checked={virarPadrao}
          onChange={(e) => setVirarPadrao(e.target.checked)}
        />
        usar como palco padrão deste corte
      </label>
      <p className="text-[11px] leading-relaxed text-[var(--wb-text-mute)]">
        Nada disto é gravado no trecho #{base.numero}: ele só empresta o quadro da live para a
        prévia e para os recortes.
      </p>
      {erro && <p className="text-[11.5px] text-[var(--wb-warn-ink)]">{erro}</p>}
    </div>
  );

  return (
    <DefinirPalcoModal
      open
      onClose={onClose}
      short={rascunho}
      corteId={corteId}
      plano={plano.data ?? null}
      fonte={fonte}
      video={video}
      ocupado={gravando}
      tempoAtualSeg={tempoAtualSeg}
      onAplicar={(mudanca: AtualizarShortBody) => setRascunho((atual) => ({ ...atual, ...mudanca }))}
      rascunho={{
        campos,
        titulo: editando
          ? `Editar o palco "${editando.nome}"`
          : origem
            ? `Novo palco — partindo de "${origem.nome}"`
            : 'Novo palco para o corte',
        rodape,
      }}
    />
  );
}
