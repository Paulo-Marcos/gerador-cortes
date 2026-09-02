import { useState } from 'react';
import { ChevronLeft, ChevronRight, Crop, Layers, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useModelosDePalco, usePalcoDoCorte } from './useShortsDoCorte';
import type { ShortSugerido } from './shortsApi';

// D-492: os refinos de um candidato, reunidos e recolhidos.
//
// Eles estavam soltos entre os botões de decisão, competindo pelo mesmo espaço:
// "início aqui" ao lado de "aprovar", o seletor de arranjo no meio dos números.
// São coisas de momentos diferentes — decidir é uma vez, refinar é iterativo —
// e misturá-las obriga a reler a fileira inteira a cada passada.
//
// Aqui eles ficam num bloco próprio, com fundo recuado, aberto sob demanda.

/** Quanto cada clique move o enquadramento. 5% do quadro ≈ 96px em 1920. */
const PASSO_FOCO = 0.05;

interface Props {
  short: ShortSugerido;
  /** D-495: sem região marcada no corte, o arranjo não tem o que arrumar. */
  temRegiao: boolean;
  ocupado: boolean;
  onBorda: (campo: 'inicio_seg' | 'fim_seg') => void;
  onFoco: (delta: number) => void;
  onModelo: (modeloId: string) => void;
  onPreset: (presetId: string) => void;
  onMoldura: (moldura: string) => void;
  corteId: string;
  onTocar: () => void;
}

export function LinhaDeAjuste({
  short,
  corteId,
  temRegiao,
  ocupado,
  onBorda,
  onFoco,
  onModelo,
  onPreset,
  onMoldura,
}: Props) {
  const modelos = useModelosDePalco();
  const palcoDoCorte = usePalcoDoCorte(corteId);
  const escolhido = modelos.data?.modelos.find((m) => m.id === short.modelo_palco);

  return (
    <div
      className="space-y-2.5 border-y border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-3"
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Ajustes do candidato"
    >
      <Grupo rotulo="bordas" dica="Usa o instante em que o player está agora">
        <Button variant="outline" size="sm" disabled={ocupado} onClick={() => onBorda('inicio_seg')}>
          início aqui
        </Button>
        <Button variant="outline" size="sm" disabled={ocupado} onClick={() => onBorda('fim_seg')}>
          fim aqui
        </Button>
      </Grupo>

      <Grupo rotulo="enquadramento" dica="Move o centro da janela 9:16 na horizontal">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Mover o enquadramento para a esquerda"
          disabled={ocupado}
          onClick={() => onFoco(-PASSO_FOCO)}
        >
          <ChevronLeft />
        </Button>
        <CampoDeFoco
          valor={short.foco_efetivo}
          ocupado={ocupado}
          onAplicar={(fracao) => onFoco(fracao - short.foco_efetivo)}
        />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Mover o enquadramento para a direita"
          disabled={ocupado}
          onClick={() => onFoco(PASSO_FOCO)}
        >
          <ChevronRight />
        </Button>
      </Grupo>

      {/* D-498: o preset DESTE short. Numa live longa a cena do OBS muda ao
          longo do tempo, então o trecho pode precisar de regiões diferentes das
          do resto do corte. Vazio herda o do corte, que segue sendo o default. */}
      <Grupo
        rotulo="recortes"
        dica="De onde saem os recortes deste trecho. Vazio usa o preset do corte."
      >
        <select
          aria-label="Preset de recortes deste short"
          value={short.palco_preset}
          disabled={ocupado || !palcoDoCorte.data}
          onChange={(e) => onPreset(e.target.value)}
          className="h-7 rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
        >
          <option value="">
            {palcoDoCorte.data?.preset
              ? `do corte (${palcoDoCorte.data.preset})`
              : 'do corte (nenhum)'}
          </option>
          {palcoDoCorte.data?.presets_disponiveis.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.nome}
            </option>
          ))}
        </select>
        {short.palco_preset && (
          <span className="font-code text-[10px] uppercase tracking-wide text-[var(--wb-accent)]">
            só deste short
          </span>
        )}
      </Grupo>

      <Grupo
        rotulo="moldura"
        dica="As faixas do canal em cima e embaixo — a assinatura do short"
      >
        <select
          aria-label="Moldura do short"
          value={short.moldura}
          disabled={ocupado}
          onChange={(e) => onMoldura(e.target.value)}
          className="h-7 rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
        >
          <option value="faixas">Faixas do canal</option>
          <option value="nenhuma">Sem moldura</option>
        </select>
      </Grupo>

      {/* D-495: sem região, o arranjo não muda NADA — o short cai no recorte cru
          e o modelo é irrelevante. Antes o seletor ficava habilitado: o operador
          escolhia, gravava no banco, e a tela não mudava nem dizia por quê. */}
      <Grupo
        rotulo="arranjo"
        dica={
          temRegiao
            ? (escolhido?.porque ?? 'Deduz o arranjo das regiões disponíveis')
            : 'Escolha um preset de recortes no topo da coluna para o arranjo ter efeito'
        }
      >
        <Layers size={12} className="text-[var(--wb-text-mute)]" aria-hidden />
        <select
          aria-label="Arranjo do palco deste short"
          value={short.modelo_palco}
          disabled={ocupado || !modelos.data || !temRegiao}
          onChange={(e) => onModelo(e.target.value)}
          className="h-7 rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] text-[var(--wb-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
        >
          <option value="">automático</option>
          {modelos.data?.modelos.map((modelo) => (
            <option key={modelo.id} value={modelo.id}>
              {modelo.nome}
            </option>
          ))}
        </select>
        {!temRegiao && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--wb-warn-ink)]">
            <TriangleAlert size={11} aria-hidden />
            sem palco — escolha um preset acima
          </span>
        )}
      </Grupo>
    </div>
  );
}

/**
 * D-496: o enquadramento como valor digitável, não só as setas.
 *
 * As setas servem para tatear (empurra e olha); o campo serve para repetir um
 * valor que já se conhece — "essa live sempre fica em 62%". Um exige o outro:
 * só setas obriga a contar cliques, só campo obriga a adivinhar o número antes
 * de ver.
 *
 * Recebe e devolve FRAÇÃO (0 a 1), que é o que o backend guarda; a porcentagem
 * é só a roupa. Converter aqui evita que a tela invente uma segunda unidade.
 */
function CampoDeFoco({
  valor,
  ocupado,
  onAplicar,
}: {
  valor: number;
  ocupado: boolean;
  onAplicar: (fracao: number) => void;
}) {
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState(false);
  const porcento = Math.round(valor * 100);

  const confirmar = () => {
    setEditando(false);
    const numero = Number(texto.trim().replace(',', '.').replace('%', ''));
    // Texto que não é número mantém o valor anterior. `Number('')` é 0, e um
    // campo que zera sozinho joga o enquadramento para a borda esquerda.
    if (!Number.isFinite(numero) || texto.trim() === '') return;
    onAplicar(Math.min(1, Math.max(0, numero / 100)));
  };

  return (
    <span className="inline-flex items-center gap-1">
      <Crop size={11} className="text-[var(--wb-text-mute)]" aria-hidden />
      <input
        value={editando ? texto : String(porcento)}
        disabled={ocupado}
        aria-label="Centro do enquadramento, em porcentagem"
        onFocus={() => {
          setTexto(String(porcento));
          setEditando(true);
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setEditando(false);
            e.currentTarget.blur();
          }
        }}
        className="w-[42px] rounded-[5px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-1 py-0.5 text-center font-code text-[11px] tabular-nums outline-none focus-visible:border-[var(--wb-accent)] disabled:opacity-50"
      />
      <span className="font-code text-[11px] text-[var(--wb-text-mute)]">%</span>
    </span>
  );
}

/** Um refino, com o nome do que ele mexe à esquerda — o olho varre a coluna. */
function Grupo({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" title={dica}>
      <span className="w-[104px] flex-none font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
        {rotulo}
      </span>
      {children}
    </div>
  );
}
