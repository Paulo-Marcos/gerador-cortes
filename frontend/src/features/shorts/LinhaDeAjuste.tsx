import { ScanFace, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePalcoDoCorte } from './useShortsDoCorte';
import type { ShortSugerido } from './shortsApi';

// D-542: dois assuntos no painel do candidato, e não seis.
//
// A D-492 já tinha juntado os refinos num bloco recolhido, e ainda assim o
// operador leu "muito misturado": bordas, enquadramento, recortes, moldura e
// arranjo empilhados, cinco perguntas com o mesmo peso visual e nenhuma pista
// de qual delas ele precisava agora.
//
// O problema não era a quantidade de controles — era a ausência de HIERARQUIA.
// Três daqueles cinco (enquadramento fino, moldura, arranjo) são decisões de
// COMO A TELA MONTA, e já existia um lugar para elas: o modal do palco, onde
// aparecem com prévia ao lado e na ordem em que uma depende da outra.
//
// Aqui ficam os dois assuntos que são deste trecho e de mais nada:
//
//   BORDAS  onde ele começa e termina
//   PALCO   qual preset, e a porta para ajustar o resto
//
// O "pelo rosto" fica de fora do modal por frequência, não por categoria: é um
// clique que resolve o caso comum (uma pessoa falando de frente), e mandá-lo
// para dentro do modal cobraria dois cliques e um contexto por algo que
// costuma ser a primeira coisa que se faz.

interface Props {
  short: ShortSugerido;
  corteId: string;
  ocupado: boolean;
  onBorda: (campo: 'inicio_seg' | 'fim_seg') => void;
  /** D-477: acha o rosto no trecho e centra a janela nele. */
  onEnquadrarPeloRosto: () => void;
  enquadrando: boolean;
  /** O veredito da ultima deteccao — inclusive "nao achei", que e resposta. */
  vereditoDoRosto: string;
  onPreset: (presetId: string) => void;
  /** Abre o modal do palco JÁ neste candidato. */
  onDefinirPalco: () => void;
}

export function LinhaDeAjuste({
  short,
  corteId,
  ocupado,
  onBorda,
  onEnquadrarPeloRosto,
  enquadrando,
  vereditoDoRosto,
  onPreset,
  onDefinirPalco,
}: Props) {
  const palcoDoCorte = usePalcoDoCorte(corteId);

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

      {/* D-498: o preset DESTE short. Numa live longa a cena do OBS muda ao
          longo do tempo, então o trecho pode precisar de regiões diferentes das
          do resto do corte. Vazio herda o do corte, que segue sendo o default. */}
      <Grupo rotulo="palco" dica="O preset deste trecho. Vazio usa o do corte.">
        <select
          aria-label="Palco deste short"
          value={short.palco_preset}
          disabled={ocupado || !palcoDoCorte.data}
          onChange={(e) => onPreset(e.target.value)}
          className="h-7 max-w-[190px] rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
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

        <Button
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={onDefinirPalco}
          title="Como a tela monta, o enquadramento, de onde vem cada janela, o fundo, a moldura e os presets"
        >
          <SlidersHorizontal />
          Definir palco
        </Button>

        {short.palco_preset && (
          <span className="font-code text-[10px] uppercase tracking-wide text-[var(--wb-accent)]">
            só deste short
          </span>
        )}
      </Grupo>

      <Grupo rotulo="rosto" dica="Procura quem fala neste trecho e centra a janela 9:16 nele">
        <Button
          variant="secondary"
          size="sm"
          disabled={ocupado || enquadrando}
          onClick={onEnquadrarPeloRosto}
        >
          <ScanFace />
          {enquadrando ? 'olhando…' : 'enquadrar pelo rosto'}
        </Button>
      </Grupo>

      {/* O veredito precisa aparecer mesmo quando é "não achei": sem isso, um
          clique sem efeito visível fica indistinguível de um botão quebrado. */}
      {vereditoDoRosto && (
        <p className="w-full font-code text-[10.5px] leading-relaxed text-[var(--wb-text-mute)]">
          {vereditoDoRosto}
        </p>
      )}
    </div>
  );
}

/** Uma linha rotulada. O rótulo à esquerda dá o eixo de leitura da coluna. */
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
      <span className="w-[74px] shrink-0 font-code text-[10px] uppercase tracking-[0.06em] text-[var(--wb-text-mute)]">
        {rotulo}
      </span>
      {children}
    </div>
  );
}
