import { ScanFace, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLayoutPresets } from '@/features/editor/fase2/useLayoutPresets';
import type { PalcoShortPreset } from '@/types/presets';
import { temPalcoProprio } from './aplicarPalco';
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
  ocupado: boolean;
  onBorda: (campo: 'inicio_seg' | 'fim_seg') => void;
  /** D-477: acha o rosto no trecho e centra a janela nele. */
  onEnquadrarPeloRosto: () => void;
  enquadrando: boolean;
  /** O veredito da ultima deteccao — inclusive "nao achei", que e resposta. */
  vereditoDoRosto: string;
  /** D-552: aplica um preset de PALCO — copia os valores e marca a origem. */
  onPalco: (presetId: string, payload: PalcoShortPreset | null) => void;
  /** Apaga o palco próprio do trecho: ele volta a seguir o padrão do corte. */
  onSeguirPadrao: () => void;
  /** O nome do palco padrão do corte. Vazio = o corte não tem padrão. */
  nomeDoPadrao: string;
  /** Abre o modal do palco JÁ neste candidato. */
  onDefinirPalco: () => void;
}

// Não é id de preset: é "sem palco próprio". Uma string que nenhum uuid repete.
const VALOR_DO_PADRAO = '__padrao_do_corte__';

export function LinhaDeAjuste({
  short,
  ocupado,
  onBorda,
  onEnquadrarPeloRosto,
  enquadrando,
  vereditoDoRosto,
  onPalco,
  onSeguirPadrao,
  nomeDoPadrao,
  onDefinirPalco,
}: Props) {
  const seguePadrao = !temPalcoProprio(short);

  // D-552: os presets de PALCO — os que o operador cria em "Definir palco".
  //
  // Antes este select listava os presets de RECORTE do canal (os que trazem
  // regiões, vindos de /canais). São outra coisa: o preset que ele acabava de
  // criar nunca aparecia aqui, e "está selecionado" não existia como conceito
  // porque aplicar um palco COPIA valores em vez de gravar um ponteiro.
  //
  // Agora o short guarda de qual preset os valores vieram, e este select mostra
  // isso. Os presets de recorte foram para dentro do modal, que é onde se
  // define de onde vem cada janela.
  const presets = useLayoutPresets({ tipo: 'palco_short' });

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
      <Grupo rotulo="palco" dica="Um palco salvo, ou o que este trecho tem hoje.">
        <select
          aria-label="Palco deste short"
          value={seguePadrao ? VALOR_DO_PADRAO : short.palco_short_preset}
          disabled={ocupado}
          onChange={(e) => {
            if (e.target.value === VALOR_DO_PADRAO) {
              onSeguirPadrao();
              return;
            }
            const escolhido = (presets.data ?? []).find((p) => p.id === e.target.value);
            onPalco(
              e.target.value,
              escolhido ? (escolhido.payload as unknown as PalcoShortPreset) : null,
            );
          }}
          className="h-7 max-w-[190px] rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] px-2 text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)] disabled:opacity-50"
        >
          {/* O trecho que ninguém tocou SEGUE o padrão — e escolher esta
              opção num customizado o devolve a ele. Sem padrão no corte, o
              que ele segue é o automático. */}
          <option value={VALOR_DO_PADRAO}>
            {nomeDoPadrao ? `padrão do corte · ${nomeDoPadrao}` : 'automático'}
          </option>
          {/* "ajustado à mão" só existe quando é verdade: há palco próprio e
              nenhum preset o descreve. */}
          {!seguePadrao && !short.palco_short_preset && (
            <option value="">ajustado à mão</option>
          )}
          {(presets.data ?? []).map((preset) => (
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

        {(presets.data ?? []).length === 0 && (
          <span className="text-[11px] text-[var(--wb-text-mute)]">
            nenhum palco salvo — monte um em Definir palco
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
