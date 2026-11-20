import { Selo, type TomDoSelo } from '@/components/ui/selo';
import { cn } from '@/lib/utils';
import type { Sincronia } from './useSincronia';

// D-1160 (E-069 H-13; DIRECAO §7.0) · O aviso de sincronização no pé do trilho.
//
// O Selo é só o que se vê (decorativo para o leitor de tela); quem fala é a região
// `role="status"` ao lado, cujo texto só muda quando o ESTADO muda. Atualizar sem
// trocar de estado não mexe no DOM, então o leitor de tela não repete nada. Recolhido
// (64 px), fica só o ícone do selo, com o rótulo no `title` e na região.
const TEXTO: Record<Sincronia, { tom: TomDoSelo; rotulo: string; dica: string }> = {
  sincronizado: { tom: 'ok', rotulo: 'Sincronizado', dica: 'Tudo em dia com o backend' },
  atualizando: { tom: 'curso', rotulo: 'Atualizando', dica: 'Buscando dados de novo' },
  erro: { tom: 'erro', rotulo: 'Erro de sincronização', dica: 'Uma busca falhou; os dados na tela podem estar velhos' },
};

export function AvisoDeSincronia({ sincronia, expandido }: { sincronia: Sincronia; expandido: boolean }) {
  const { tom, rotulo, dica } = TEXTO[sincronia];
  return (
    <div data-sincronia={sincronia} className={cn('flex flex-none', expandido ? 'px-1.5 pb-1' : 'justify-center')}>
      <Selo tom={tom} dica={dica} aria-hidden className={expandido ? undefined : 'px-1.5'}>
        {expandido ? rotulo : null}
      </Selo>
      <span role="status" className="sr-only">
        {rotulo}
      </span>
    </div>
  );
}
