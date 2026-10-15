import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { EstiloDaCapaTiktok } from '@/types/presets';
import { Icon } from '@/upgrade/Icon';
import { ComponentesDaCapa, EscolhaDoEstilo } from './ControlesDaCapa';
import { comPosicao, rascunhoDoSalvo } from './estiloDaCapa';
import { PresetsDaCapa } from './PresetsDaCapa';
import { PreviaDaCapa } from './PreviaDaCapa';
import { useEstiloDaCapa, useGravarEstiloDaCapa, usePreviaDaCapa } from './useEstiloDaCapa';

// D-933: "Estilizar capa" — o estilo da capa do TikTok do CANAL, como o modal
// de posição faz com o palco: escolher o desenho, mostrar ou esconder cada
// componente, arrastá-los na prévia e guardar presets. Salvar grava para o
// canal; quem chamou refaz a capa deste corte.

type Props = {
  open: boolean;
  onClose: () => void;
  projetoId: string;
  corteId: string;
  /** O texto que a capa leva, para a prévia mostrar a capa de verdade. */
  etiqueta: string;
  /** Se o corte já tem capa: salvar a refaz. Sem capa, só grava o estilo. */
  refazCapa: boolean;
  onSalvou: () => void;
};

export function EstiloDaCapaModal({
  open,
  onClose,
  projetoId,
  corteId,
  etiqueta,
  refazCapa,
  onSalvou,
}: Props) {
  const alvo = { projetoId, corteId };
  const salvo = useEstiloDaCapa(alvo);
  const [rascunho, setRascunho] = useState<EstiloDaCapaTiktok | null>(null);
  const atual = rascunho ?? (salvo.data ? rascunhoDoSalvo(salvo.data.salvo) : null);
  const previa = usePreviaDaCapa(alvo, atual);
  const painel = previa.data ?? salvo.data;
  const gravar = useGravarEstiloDaCapa(alvo);

  const fechar = () => {
    setRascunho(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={fechar}
      size="xl"
      title="Estilizar capa do TikTok"
      description="Vale para todas as capas do canal. Arraste os componentes na prévia; o que fica sob o véu some na vitrine do perfil."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setRascunho({})}>
            <Icon name="rotate-ccw" />
            Restaurar padrão
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={fechar}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!atual || gravar.isPending}
              onClick={() => atual && gravar.mutate(atual, { onSuccess: () => (onSalvou(), fechar()) })}
            >
              <Icon name={gravar.isPending ? 'loader-2' : 'save'} className={gravar.isPending ? 'animate-spin' : undefined} />
              {refazCapa ? 'Salvar e refazer a capa' : 'Salvar o estilo'}
            </Button>
          </div>
        </div>
      }
    >
      {!painel || !atual ? (
        <p className="text-[12px] text-[var(--wb-text-mute)]">
          <Icon name="loader-2" className="mr-1 inline animate-spin" />
          carregando o estilo da capa…
        </p>
      ) : (
        <div className="relative flex flex-wrap items-start gap-5">
          <PreviaDaCapa
            painel={painel}
            etiqueta={etiqueta}
            onSoltar={(componente, retangulo) => setRascunho(comPosicao(atual, componente, retangulo))}
          />
          <div className="grid min-w-[260px] flex-1 content-start gap-4">
            <EscolhaDoEstilo painel={painel} rascunho={atual} onMudar={setRascunho} />
            <ComponentesDaCapa painel={painel} rascunho={atual} onMudar={setRascunho} />
            <PresetsDaCapa rascunho={atual} onAplicar={setRascunho} />
            {gravar.error && <p className="text-[11px] text-[var(--wb-err)]">{gravar.error.message}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** O botão do slot da capa que abre o modal (D-933); salvar refaz a capa, se ela existe. */
export function EstilizarCapa({
  ocupado,
  ...props
}: Omit<Props, 'open' | 'onClose'> & { ocupado: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={ocupado}
        onClick={() => setAberto(true)}
        title="Escolhe o estilo da capa do canal, o que aparece e onde cada componente fica."
      >
        <Icon name="palette" />
        Estilizar capa
      </Button>
      {/* Montado só aberto: fechado, o painel (que traz a arte inteira) nem é pedido. */}
      {aberto && <EstiloDaCapaModal {...props} open onClose={() => setAberto(false)} />}
    </>
  );
}
