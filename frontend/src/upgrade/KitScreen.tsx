import { KitAcao } from './kit/KitAcao';
import { KitEntrada } from './kit/KitEntrada';
import { KitEstado } from './kit/KitEstado';
import { KitFlutua } from './kit/KitFlutua';
import { KitListas } from './kit/KitListas';
import { KitLuz } from './kit/KitLuz';
import { KitTempo } from './kit/KitTempo';

// D-1132 (E-069 H-12) · o Kit é a vitrine do sistema novo, e só dele. Esta tela apenas empilha
// as sete seções `Kit*`, uma por família de componente; cada seção mora em `kit/` e prova os
// próprios estados. As peças da casca antiga (botão `.btn`, chip `.chip`, `UpgradeModal`,
// `UpgradeToast`) saíram: o que elas mostravam, a Sala escura mostra com o componente novo.

export function KitScreen() {
  return (
    <div data-screen-label="Componentes" className="flex max-w-[1080px] flex-col gap-6">
      <KitAcao />
      <section
        aria-labelledby="kit-entrada"
        className="flex flex-col gap-5 rounded-cartao border border-fio bg-app p-6 text-fg"
      >
        <h2 id="kit-entrada" className="text-secao">
          Entrada
        </h2>
        <KitEntrada />
      </section>
      <KitEstado />
      <KitTempo />
      <KitListas />
      <KitFlutua />
      <KitLuz />
    </div>
  );
}
