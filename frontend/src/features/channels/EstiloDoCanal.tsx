import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EstiloDaCapaDoCanal } from '@/features/metadata/estiloDaCapaApi';
import type { EstiloDoPalco } from '@/shared/palco/presetsPorEstilo';
import { Icon } from '@/upgrade/Icon';
import type { PalcoComponentes } from './api/canais';
import { EscolhaDoEstilo } from './PalcoComponentesSection';
import { urlDaImagem } from './palcoDoCanal';

// D-938: a tela de Canais só ESCOLHE — o estilo de cada tipo de vídeo e o
// desenho da capa. O detalhe (cabeçalho, placa, cards, janelas) e os presets
// moram no modal de cada tipo, que o botão abre para editar o padrão do canal.

export type TipoDoPadrao = 'horizontal' | 'short';

export const ESTILOS_DA_CAPA: { id: EstiloDaCapaDoCanal; nome: string }[] = [
  { id: 'palco', nome: 'Igual ao palco' },
  { id: 'atual', nome: 'Atual' },
  { id: 'limpo', nome: 'Limpo' },
];

interface Props {
  estilo: EstiloDoPalco;
  estiloDaCapa: EstiloDaCapaDoCanal | undefined;
  onEstilo: (estilo: EstiloDoPalco) => void;
  onEstiloDaCapa: (estilo: EstiloDaCapaDoCanal) => void;
  /** Abre o modal do tipo para editar o padrão do canal (detalhe e presets). */
  onEditar: (tipo: TipoDoPadrao) => void;
}

export function EstiloPorTipo({ estilo, estiloDaCapa, onEstilo, onEstiloDaCapa, onEditar }: Props) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-[var(--wb-text)]">Vídeo horizontal e short</h3>
        <EscolhaDoEstilo estilo={estilo} onEscolher={onEstilo} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onEditar('horizontal')}>
            <Icon name="pen" />
            Editar o padrão do horizontal
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onEditar('short')}>
            <Icon name="pen" />
            Editar o padrão do short
          </Button>
        </div>
        <p className="text-xs text-[var(--wb-text-dim)]">
          Cabeçalho, placa, cards, janelas e os presets ficam no modal — o mesmo do editor. Lá se escolhe um
          preset ou se cria um novo.
        </p>
      </div>
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold text-[var(--wb-text)]">Capa do TikTok</h3>
        <div role="radiogroup" aria-label="Estilo da capa do TikTok" className="flex flex-wrap gap-1.5">
          {ESTILOS_DA_CAPA.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              role="radio"
              aria-checked={estiloDaCapa === opcao.id}
              disabled={!estiloDaCapa}
              onClick={() => onEstiloDaCapa(opcao.id)}
              className={cn(
                'h-7 rounded-full border px-3 text-[12px] font-semibold transition-colors disabled:opacity-60',
                estiloDaCapa === opcao.id
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-accent)] text-[var(--wb-accent-fg)]'
                  : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              {opcao.nome}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--wb-text-dim)]">
          Componentes, posições e presets da capa: no botão <strong>Estilizar capa</strong>, na capa de um corte.
        </p>
      </div>
    </div>
  );
}

/** A imagem do cabeçalho é identidade do canal: sobe na hora, não é rascunho de modal. */
export function ImagemDoCabecalho({
  palco,
  enviando,
  onEnviar,
  onRemover,
}: {
  palco: PalcoComponentes;
  enviando: boolean;
  onEnviar: (arquivo: File) => void;
  onRemover: () => void;
}) {
  const arquivoRef = useRef<HTMLInputElement>(null);
  const imagem = urlDaImagem(palco.cabecalho.imagem_url);
  const propria = Boolean(palco.cabecalho.imagem);
  return (
    <div className="flex items-center gap-3">
      {imagem ? (
        <img src={imagem} alt="Imagem do cabeçalho" className="h-12 w-12 rounded-full object-cover" />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--wb-bg-card)] text-[var(--wb-text-dim)]">
          <Icon name="image-off" />
        </span>
      )}
      <div className="grid gap-1 text-xs text-[var(--wb-text-dim)]">
        <span>Imagem do cabeçalho · {propria ? 'imagem do canal' : 'pose padrão do mascote'}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={() => arquivoRef.current?.click()}>
            <Icon name="image-plus" />
            {enviando ? 'Enviando…' : 'Trocar imagem'}
          </Button>
          {propria && (
            <Button type="button" variant="ghost" size="sm" disabled={enviando} onClick={onRemover}>
              <Icon name="trash-2" />
              Voltar ao mascote
            </Button>
          )}
        </div>
      </div>
      <input
        ref={arquivoRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Imagem do cabeçalho"
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) onEnviar(arquivo);
          e.target.value = '';
        }}
      />
    </div>
  );
}
