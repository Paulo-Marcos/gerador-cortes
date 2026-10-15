import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// D-911: os controles de POSIÇÃO e TAMANHO dos componentes do palco. Todo
// componente fixo diz onde fica e de que tamanho, em px do quadro (1920x1080
// no vídeo, 1080x1920 no short); "automática" devolve a posição à regra do
// estilo. Componentes "burros": recebem o valor e avisam a mudança.

export interface PosicaoEditavel {
  automatica: boolean;
  x: number;
  y: number;
}

/** Um número com rótulo e unidade, preso entre `min` e `max`. */
export function CampoNumero({
  id,
  rotulo,
  valor,
  min,
  max,
  unidade,
  onMudar,
}: {
  id: string;
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  unidade: string;
  onMudar: (valor: number) => void;
}) {
  // D-927: o texto é livre enquanto se digita e só se prende ao limite ao sair
  // do campo — prender a cada tecla fazia o "3" de "300" virar o mínimo.
  const [texto, setTexto] = useState<string | null>(null);
  const confirmar = () => {
    const numero = Number(texto);
    if (texto !== null && texto.trim() !== '' && Number.isFinite(numero)) {
      onMudar(Math.max(min, Math.min(max, numero)));
    }
    setTexto(null);
  };
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {rotulo} <span className="text-[var(--wb-text-dim)]">({unidade})</span>
      </Label>
      <Input
        id={id}
        type="number"
        step="any"
        min={min}
        max={max}
        value={texto ?? valor}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirmar();
        }}
      />
    </div>
  );
}

/** D-927: de 25% a 500% (espelha ESCALA_MINIMA/MAXIMA do domínio do palco). */
export const TAMANHO_MINIMO = 25;
export const TAMANHO_MAXIMO = 500;

/** Tamanho em % (a escala do componente). */
export function CampoTamanho({
  id,
  escala,
  onMudar,
}: {
  id: string;
  escala: number;
  onMudar: (escala: number) => void;
}) {
  return (
    <CampoNumero
      id={id}
      rotulo="Tamanho"
      unidade="%"
      valor={Math.round(escala * 100)}
      min={TAMANHO_MINIMO}
      max={TAMANHO_MAXIMO}
      onMudar={(porcento) => onMudar(porcento / 100)}
    />
  );
}

/** Onde o componente fica: automática ou x/y no quadro do formato. */
export function CampoPosicao({
  id,
  rotulo,
  posicao,
  quadro,
  podeSerAutomatica = true,
  descricaoAutomatica,
  onMudar,
}: {
  id: string;
  rotulo: string;
  posicao: PosicaoEditavel;
  quadro: { largura: number; altura: number };
  podeSerAutomatica?: boolean;
  descricaoAutomatica?: string;
  onMudar: (posicao: PosicaoEditavel) => void;
}) {
  const manual = !podeSerAutomatica || !posicao.automatica;
  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-text-300">{rotulo}</span>
      {podeSerAutomatica && (
        <label className="flex items-center gap-2 text-sm text-[var(--wb-text)]">
          <input
            type="checkbox"
            checked={posicao.automatica}
            onChange={(e) => onMudar({ ...posicao, automatica: e.target.checked })}
          />
          Automática{descricaoAutomatica ? ` — ${descricaoAutomatica}` : ''}
        </label>
      )}
      {manual && (
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero
            id={`${id}-x`}
            rotulo="X"
            unidade={`0 a ${quadro.largura} px`}
            valor={posicao.x}
            min={0}
            max={quadro.largura}
            onMudar={(x) => onMudar({ ...posicao, x })}
          />
          <CampoNumero
            id={`${id}-y`}
            rotulo="Y"
            unidade={`0 a ${quadro.altura} px`}
            valor={posicao.y}
            min={0}
            max={quadro.altura}
            onMudar={(y) => onMudar({ ...posicao, y })}
          />
        </div>
      )}
    </div>
  );
}

/** Um grupo de botões exclusivos: a escolha marcada fica preenchida. */
export function CampoEscolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  onEscolher,
}: {
  rotulo: string;
  valor: T;
  opcoes: ReadonlyArray<{ id: T; nome: string }>;
  onEscolher: (valor: T) => void;
}) {
  return (
    <div className="grid gap-1.5" role="group" aria-label={rotulo}>
      <span className="text-xs font-medium text-text-300">{rotulo}</span>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((opcao) => (
          <Button
            key={opcao.id}
            type="button"
            size="sm"
            variant={valor === opcao.id ? 'default' : 'outline'}
            aria-pressed={valor === opcao.id}
            onClick={() => onEscolher(opcao.id)}
          >
            {opcao.nome}
          </Button>
        ))}
      </div>
    </div>
  );
}

export type FundoDoShort = 'palco' | 'eco';
export type EstiloDaLegenda = 'contorno' | 'sombra';

const FUNDOS_DO_SHORT: ReadonlyArray<{ id: FundoDoShort; nome: string }> = [
  { id: 'palco', nome: 'Fundo do palco' },
  { id: 'eco', nome: 'Eco do vídeo (desfocado)' },
];

const ESTILOS_DA_LEGENDA: ReadonlyArray<{ id: EstiloDaLegenda; nome: string }> = [
  { id: 'contorno', nome: 'Contorno' },
  { id: 'sombra', nome: 'Só sombra' },
];

export interface ShortDoPalco {
  contornoShort: number;
  fundoShort: FundoDoShort;
  estiloDaLegenda: EstiloDaLegenda;
}

/**
 * D-911/D-913: o que o canal escolhe para o short — o contorno em volta das
 * janelas, o que aparece nele (o fundo do palco ou o eco do vídeo) e como a
 * legenda se separa do vídeo. O eco só existe no estilo limpo.
 */
export function JanelasDoShort({
  valor,
  limpo,
  onMudar,
}: {
  valor: ShortDoPalco;
  limpo: boolean;
  onMudar: (valor: ShortDoPalco) => void;
}) {
  return (
    <fieldset className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] p-4">
      <legend className="px-1 text-xs font-medium text-text-300">Short</legend>
      <CampoNumero
        id="palco-contorno"
        rotulo="Contorno do fundo em volta das janelas"
        unidade="px, 0 = sem contorno"
        valor={valor.contornoShort}
        min={0}
        max={80}
        onMudar={(contornoShort) => onMudar({ ...valor, contornoShort })}
      />
      {limpo && (
        <CampoEscolha
          rotulo="Em volta das janelas"
          valor={valor.fundoShort}
          opcoes={FUNDOS_DO_SHORT}
          onEscolher={(fundoShort) => onMudar({ ...valor, fundoShort })}
        />
      )}
      <CampoEscolha
        rotulo="Legenda"
        valor={valor.estiloDaLegenda}
        opcoes={ESTILOS_DA_LEGENDA}
        onEscolher={(estiloDaLegenda) => onMudar({ ...valor, estiloDaLegenda })}
      />
    </fieldset>
  );
}
