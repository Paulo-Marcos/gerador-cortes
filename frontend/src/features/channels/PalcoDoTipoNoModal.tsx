import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PalcoComponentes, TipoDoPalco } from './api/canais';
import { CardsDoCanal } from './CardsDoCanal';
import { CampoPosicao, CampoTamanho, JanelasDoShort } from './ControlesDoPalco';
import { FundosDoLimpo } from './EstiloNoModal';
import { ItensDoCabecalho, type RascunhoDoPalco } from './PalcoComponentesSection';

// D-923: o palco de UM tipo de vídeo dentro do modal de posição. O horizontal
// mostra só o que vale no horizontal (cabeçalho e placa no quadro 1920x1080,
// cards); o short, só o do short (cabeçalho no quadro vertical, janelas e
// legenda). Uma aba por componente, para nada ficar aberto ao mesmo tempo.

type Aba = 'fundo' | 'cabecalho' | 'placa' | 'cards' | 'janelas';

const NOMES: Record<Aba, string> = {
  fundo: 'Fundo',
  cabecalho: 'Cabeçalho',
  placa: 'Placa',
  cards: 'Cards',
  janelas: 'Janelas e legenda',
};

/** As abas que existem no tipo e no estilo (no estilo atual não há cabeçalho nem fundo limpo). */
export function abasDoPalco(tipo: TipoDoPalco, estilo: 'atual' | 'limpo'): Aba[] {
  const limpo = estilo === 'limpo';
  if (tipo === 'short') return limpo ? ['fundo', 'cabecalho', 'janelas'] : ['janelas'];
  return limpo ? ['fundo', 'cabecalho', 'placa', 'cards'] : ['cards'];
}

const VIDEO = { largura: 1920, altura: 1080 };
const SHORT = { largura: 1080, altura: 1920 };

interface Props {
  tipo: TipoDoPalco;
  rascunho: RascunhoDoPalco;
  efetivo: PalcoComponentes;
  onMudar: (rascunho: RascunhoDoPalco) => void;
}

export function PalcoDoTipoNoModal({ tipo, rascunho, efetivo, onMudar }: Props) {
  const abas = abasDoPalco(tipo, rascunho.estilo);
  const [escolhida, setEscolhida] = useState<Aba>(abas[0]);
  const aba = abas.includes(escolhida) ? escolhida : abas[0];
  return (
    <div className="grid gap-2">
      {abas.length > 1 && (
        <div role="tablist" aria-label="Componentes do palco" className="flex flex-wrap gap-1 border-b border-[var(--wb-border-soft)]">
          {abas.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={aba === id}
              onClick={() => setEscolhida(id)}
              className={cn(
                '-mb-px border-b-2 px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors',
                aba === id
                  ? 'border-[var(--wb-accent)] text-[var(--wb-text)]'
                  : 'border-transparent text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]',
              )}
            >
              {NOMES[id]}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" aria-label={NOMES[aba]}>
        <ConteudoDaAba aba={aba} tipo={tipo} rascunho={rascunho} efetivo={efetivo} onMudar={onMudar} />
      </div>
    </div>
  );
}

function ConteudoDaAba({ aba, ...props }: Props & { aba: Aba }) {
  const { tipo, rascunho, efetivo, onMudar } = props;
  if (aba === 'fundo') {
    return <FundosDoLimpo fundo={rascunho.fundo} onFundo={(fundo) => onMudar({ ...rascunho, fundo })} />;
  }
  if (aba === 'cabecalho') return <CabecalhoNoModal {...props} />;
  if (aba === 'janelas') {
    return (
      <JanelasDoShort valor={rascunho} limpo={rascunho.estilo === 'limpo'} onMudar={(short) => onMudar({ ...rascunho, ...short })} />
    );
  }
  if (aba === 'cards') {
    return <CardsDoCanal valor={rascunho.cards} tipos={efetivo.tipos_de_cena} onMudar={(cards) => onMudar({ ...rascunho, cards })} />;
  }
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm text-[var(--wb-text)]">
        <input type="checkbox" checked={rascunho.placaAtiva} onChange={(e) => onMudar({ ...rascunho, placaAtiva: e.target.checked })} />
        Mostrar a placa (nome e papel de quem fala)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTamanho id={`modal-${tipo}-placa-tamanho`} escala={rascunho.placaEscala} onMudar={(placaEscala) => onMudar({ ...rascunho, placaEscala })} />
        <CampoPosicao
          id={`modal-${tipo}-placa-posicao`}
          rotulo="Posição no vídeo"
          posicao={rascunho.placaPosicao}
          quadro={VIDEO}
          descricaoAutomatica="acima da tela"
          onMudar={(placaPosicao) => onMudar({ ...rascunho, placaPosicao })}
        />
      </div>
    </div>
  );
}

function CabecalhoNoModal({ tipo, rascunho, efetivo, onMudar }: Props) {
  const short = tipo === 'short';
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm text-[var(--wb-text)]">
        <input type="checkbox" checked={rascunho.cabecalhoAtivo} onChange={(e) => onMudar({ ...rascunho, cabecalhoAtivo: e.target.checked })} />
        Mostrar o cabeçalho
      </label>
      <ItensDoCabecalho rascunho={rascunho} onMudar={onMudar} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`modal-${tipo}-nome`}>Nome</Label>
          <Input
            id={`modal-${tipo}-nome`}
            value={rascunho.nome}
            disabled={!rascunho.mostrarNome}
            placeholder={efetivo.cabecalho.nome_efetivo || 'Nome do canal'}
            onChange={(e) => onMudar({ ...rascunho, nome: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`modal-${tipo}-handle`}>@</Label>
          <Input
            id={`modal-${tipo}-handle`}
            value={rascunho.handle}
            disabled={!rascunho.mostrarHandle}
            placeholder={efetivo.cabecalho.handle_efetivo || '@seucanal'}
            onChange={(e) => onMudar({ ...rascunho, handle: e.target.value })}
          />
        </div>
        <CampoTamanho id={`modal-${tipo}-cabecalho-tamanho`} escala={rascunho.cabecalhoEscala} onMudar={(cabecalhoEscala) => onMudar({ ...rascunho, cabecalhoEscala })} />
        {short ? (
          <CampoPosicao
            id="modal-short-cabecalho-posicao"
            rotulo="Posição no short"
            posicao={rascunho.cabecalhoPosicaoShort}
            quadro={SHORT}
            descricaoAutomatica="acima da primeira janela"
            onMudar={(cabecalhoPosicaoShort) => onMudar({ ...rascunho, cabecalhoPosicaoShort })}
          />
        ) : (
          <CampoPosicao
            id="modal-horizontal-cabecalho-posicao"
            rotulo="Posição no vídeo"
            posicao={rascunho.cabecalhoPosicao}
            quadro={VIDEO}
            podeSerAutomatica={false}
            onMudar={(cabecalhoPosicao) => onMudar({ ...rascunho, cabecalhoPosicao })}
          />
        )}
      </div>
      <p className="text-xs text-[var(--wb-text-dim)]">
        Nome e @ vazios usam os do canal; para não mostrar, desmarque o item. A imagem é a do canal (Canais → Palco do canal).
      </p>
    </div>
  );
}
