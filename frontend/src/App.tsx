import { AppShell } from '@/components/layout/AppShell';
import { AvisoSincronizacao } from '@/features/sincronizacao/AvisoSincronizacao';

export default function App() {
  return (
    <>
      {/* D-491: aqui, e nao dentro de um shell, porque existem DOIS — o
          workbench (ligado em PROD) e o legado (o da worktree). Montar num
          deles faria o aviso existir em metade dos ambientes, e a metade sem
          aviso e exatamente onde a divergencia passa despercebida.
          `AppShell` esta travado; `App` nao, e daqui os dois sao cobertos. */}
      <AvisoSincronizacao />
      <AppShell />
    </>
  );
}
