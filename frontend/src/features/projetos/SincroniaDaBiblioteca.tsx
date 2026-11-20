import { Selo } from '@/components/ui/selo';

// D-1148 (E-069 H-15) · O status de sincronização da lista, dentro da Biblioteca.
//
// Era o chip da TopBar ("sincronizado"/"atualizando"). A TopBar saiu com a D-1137 e o
// `ScreenHeader` não desenha `chrome.estado`, então o status tinha sumido da tela. A
// §7.0 o manda para o pé do trilho, que ainda não existe: até lá ele mora aqui, numa
// linha discreta (decisão do Paulo em 20/11, "Manter o chip por ora"). Quando o aviso
// do pé do trilho existir, esta peça sai.
export type Sincronia = 'sincronizado' | 'atualizando';

export function SincroniaDaBiblioteca({ sincronia }: { sincronia: Sincronia }) {
  const atualizando = sincronia === 'atualizando';
  return (
    <p className="flex justify-end" aria-live="polite">
      <Selo
        tom={atualizando ? 'curso' : 'ok'}
        dica={atualizando ? 'Buscando a lista de lives de novo' : 'A lista de lives está em dia com o backend'}
      >
        {atualizando ? 'Atualizando' : 'Sincronizado'}
      </Selo>
    </p>
  );
}
