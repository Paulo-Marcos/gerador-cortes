import { KitScreen } from './KitScreen';

// ─────────────────────────────────────────────────────────────────
// D-1132 (E-069 H-12) · a vitrine do sistema "Sala escura", fora da casca.
//
// Rota própria e de nível superior (`/upgrade/kit`), sem passar pelo `App`: a casca antiga
// ainda existe e vestiria o kit com o material errado. A página não tem tema próprio: cada
// seção traz o seletor Escuro/Claro e põe o tema no <html>, onde moram os tokens `--cc-*`.
// ─────────────────────────────────────────────────────────────────

export default function UpgradeKitPage() {
  return (
    <div className="min-h-dvh bg-app px-4 py-6 font-sans text-fg sm:px-8">
      <header className="mx-auto mb-6 flex max-w-[1080px] flex-col gap-1">
        <h1 className="text-titulo">Componentes</h1>
        <p className="text-corpo text-fg-3">
          As peças que montam todas as telas, no sistema Sala escura.
        </p>
      </header>
      <main className="mx-auto max-w-[1080px]">
        <KitScreen />
      </main>
    </div>
  );
}
