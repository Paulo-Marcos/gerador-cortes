import { CampoPosicao, CampoTamanho, type PosicaoEditavel } from './ControlesDoPalco';

// D-916: os cards (cenas) do canal na tela de Canais — quais tipos aparecem no
// vídeo, de que tamanho, e onde sentam quando a cena está sobre o vídeo cheio.
// Na compartilhada quem posiciona o card é a zona do corte (o retângulo "Cards"
// do modal de posição), e isso continua lá.

export interface CardsEditaveis {
  ocultos: string[];
  escala: number;
  posicao: PosicaoEditavel;
}

const QUADRO = { largura: 1920, altura: 1080 };

export function CardsDoCanal({
  valor,
  tipos,
  onMudar,
}: {
  valor: CardsEditaveis;
  tipos: ReadonlyArray<{ id: string; nome: string }>;
  onMudar: (valor: CardsEditaveis) => void;
}) {
  const alternar = (id: string, mostrar: boolean) =>
    onMudar({
      ...valor,
      ocultos: mostrar ? valor.ocultos.filter((tipo) => tipo !== id) : [...valor.ocultos, id],
    });
  return (
    <fieldset className="grid gap-3 rounded-[var(--radius)] border border-[var(--wb-border-soft)] p-4">
      <legend className="px-1 text-xs font-medium text-text-300">Cards (cenas)</legend>
      <div className="grid gap-1.5" role="group" aria-label="Tipos de card que aparecem no vídeo">
        <span className="text-xs font-medium text-text-300">Aparecem no vídeo</span>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {tipos.map((tipo) => (
            <label key={tipo.id} className="flex items-center gap-2 text-sm text-[var(--wb-text)]">
              <input
                type="checkbox"
                checked={!valor.ocultos.includes(tipo.id)}
                onChange={(e) => alternar(tipo.id, e.target.checked)}
              />
              {tipo.nome}
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTamanho
          id="palco-cards-tamanho"
          escala={valor.escala}
          onMudar={(escala) => onMudar({ ...valor, escala })}
        />
        <CampoPosicao
          id="palco-cards-posicao"
          rotulo="Posição sobre o vídeo cheio"
          posicao={valor.posicao}
          quadro={QUADRO}
          descricaoAutomatica="no canto inferior esquerdo"
          onMudar={(posicao) => onMudar({ ...valor, posicao })}
        />
      </div>
      <p className="text-xs text-[var(--wb-text-dim)]">
        Na tela compartilhada o card fica na zona de cada corte (modal de posição).
      </p>
    </fieldset>
  );
}
