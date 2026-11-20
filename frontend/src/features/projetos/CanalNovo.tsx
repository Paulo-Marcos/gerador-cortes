import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { LinkDeAcao } from '@/components/ui/link-de-acao';
import { CartaoComFio } from '@/features/projetos/CartaoComFio';
import { NovoProjetoForm } from '@/features/projetos/NovoProjetoForm';

// D-1148 (E-069 H-15; DIRECAO §7.12) · A Biblioteca vazia: o canal acabou de nascer.
// O "Continue" vira "Cole o link", com o fio de luz e a ÚNICA primária ("Baixar a
// live"). Embaixo, o caminho em três passos; no pé, para onde os cortes vão.

const CAMINHO: Array<{ icone: IconName; titulo: string; texto: string }> = [
  { icone: 'download', titulo: 'Ela baixa e transcreve', texto: 'O vídeo e o áudio chegam ao disco e viram texto com tempo.' },
  { icone: 'scissors', titulo: 'A IA propõe os cortes', texto: 'Cada corte é um tema, com começo, fim e o porquê.' },
  { icone: 'rocket', titulo: 'Você aprova e publica', texto: 'Ajusta o que quiser, renderiza e manda para as redes.' },
];

export type CanalNovoProps = {
  /** O @ do canal de destino, quando ele já está ligado ao YouTube. */
  destino?: string;
  onBuscarLives: () => void;
  onLigarCanal: () => void;
};

export function CanalNovo({ destino, onBuscarLives, onLigarCanal }: CanalNovoProps) {
  return (
    <div className="flex flex-col gap-8">
      <CartaoComFio rotulo="Cole o link de uma live do YouTube" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-titulo text-fg">Cole o link de uma live do YouTube</h2>
          <p className="text-corpo text-fg-3">É por ela que tudo começa: o resto do caminho o app faz com você.</p>
        </div>
        <NovoProjetoForm primaria />
        <div>
          <LinkDeAcao onClick={onBuscarLives}>Ou buscar as lives do canal-fonte</LinkDeAcao>
        </div>
      </CartaoComFio>

      <ol aria-label="O caminho de uma live" className="grid list-none gap-3 p-0 md:grid-cols-3">
        {CAMINHO.map((passo, i) => (
          <li key={passo.titulo}>
            <Card variante="vidro" className="h-full p-4">
              <span className="inline-grid size-9 place-items-center rounded-ladrilho border border-fio-2 bg-vidro-2 text-fg-2">
                <Icon name={passo.icone} size={16} />
              </span>
              <h3 className="text-linha text-fg">
                <span className="num text-fg-3">{i + 1}. </span>
                {passo.titulo}
              </h3>
              <p className="text-corpo text-fg-3">{passo.texto}</p>
            </Card>
          </li>
        ))}
      </ol>

      <p className="flex flex-wrap items-center gap-2 text-corpo text-fg-3">
        <Icon name="radio" size={16} />
        {destino ? (
          <span>Os cortes vão ao ar em {destino}.</span>
        ) : (
          <>
            <span>Antes de publicar, ligue o canal de destino no YouTube.</span>
            <LinkDeAcao onClick={onLigarCanal}>Ligar o canal</LinkDeAcao>
          </>
        )}
      </p>
    </div>
  );
}
