import { Crop, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlocosArrastaveis } from './BlocosArrastaveis';
import type { Limites, Retangulo } from './arrastarSlot';

// D-499: o recorte deste short sobre o quadro-fonte.
//
// O palco tem dois lados. O SLOT diz onde o bloco cai no short; o RECORTE diz o
// que ele mostra da live. Até aqui só o slot era editável: dava para arrastar a
// pessoa para o rodapé, não para dizer QUAL pedaço da live é a pessoa — isso
// vinha pronto do preset do canal.
//
// Numa live longa a facecam anda: minuto 3 num canto, minuto 11 no outro. O
// preset do corte fica certo para a maioria dos trechos e errado para um — e
// não havia como consertar aquele sem estragar os outros. Agora há, e a herança
// é parcial: o que este short não marcou continua vindo do preset.
//
// O overlay é o mesmo `BlocosArrastaveis` do palco. O que muda é o quadro: aqui
// as bordas são a resolução do BRUTO, que varia de live para live, e não o
// canvas fixo do short.

const ROTULO: Record<string, string> = {
  pessoa: 'pessoa',
  tela: 'tela',
  quadro: 'quadro',
};

interface Props {
  /** Os recortes atuais, em pixels da FONTE (o que o backend resolveu). */
  recortes: Record<string, Retangulo>;
  /** A resolução medida do bruto — o quadro dentro do qual se recorta. */
  fonte: Limites;
  ativo: boolean;
  onGravar: (recortes: Record<string, Retangulo>) => void;
}

export function EditorDeRecorte({ recortes, fonte, ativo, onGravar }: Props) {
  // Sem resolução medida não há como converter pixel de tela em pixel da fonte,
  // e um palpite aqui produziria um crop maior que o quadro — o erro que matou
  // o render na D-481. Melhor não desenhar alça nenhuma.
  if (!ativo || !(fonte.largura > 0 && fonte.altura > 0)) return null;

  return (
    <BlocosArrastaveis
      blocos={recortes}
      limites={fonte}
      rotulo={(regiao) => ROTULO[regiao] ?? regiao}
      substantivo="o recorte de"
      onSoltar={(regiao, retangulo) => onGravar({ [regiao]: retangulo })}
    />
  );
}

/** O botão que liga o modo, com o desfazer ao lado quando há o que desfazer. */
export function ControlesDoRecorte({
  ativo,
  marcados,
  ocupado,
  onAlternar,
  onDesfazer,
}: {
  ativo: boolean;
  /** As regiões que ESTE short remarcou — as outras seguem no preset. */
  marcados: string[];
  ocupado: boolean;
  onAlternar: () => void;
  onDesfazer: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant={ativo ? 'secondary' : 'outline'} size="sm" onClick={onAlternar}>
        <Crop />
        {ativo ? 'marcando o recorte' : 'Recortar da live'}
      </Button>
      {marcados.length > 0 && (
        <>
          <span className="font-code text-[10px] text-[var(--wb-text-mute)]">
            {marcados.join(', ')} · deste short
          </span>
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={onDesfazer}>
            <RotateCcw />
            voltar ao preset
          </Button>
        </>
      )}
    </div>
  );
}
