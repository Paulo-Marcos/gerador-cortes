import { AppShell } from '@/components/layout/AppShell';
import { AvisoSincronizacao } from '@/features/sincronizacao/AvisoSincronizacao';

// D-879: uma coluna da altura da janela. O aviso, quando aparece, pega a altura
// dele no topo; a casca fica com o resto. Antes ele flutuava por cima e a casca
// media a janela inteira, então os 31 px do aviso eram 31 px de barra sem clique.
const COLUNA = { display: 'flex', flexDirection: 'column', height: '100dvh' } as const;
const RESTO_DA_COLUNA = { flex: '1 1 0', minHeight: 0 } as const;

export default function App() {
  return (
    <div style={COLUNA}>
      {/* D-491: aqui, e nao dentro de um shell, porque existem DOIS — o
          workbench (ligado em PROD) e o legado (o da worktree). Montar num
          deles faria o aviso existir em metade dos ambientes, e a metade sem
          aviso e exatamente onde a divergencia passa despercebida.
          `AppShell` esta travado; `App` nao, e daqui os dois sao cobertos. */}
      <AvisoSincronizacao />
      <div style={RESTO_DA_COLUNA}>
        <AppShell />
      </div>
    </div>
  );
}
