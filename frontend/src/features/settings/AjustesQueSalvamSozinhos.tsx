// D-532, D-832 e D-895: cada um salva sozinho, com a própria mutation — fora do
// `isBusy` do formulário de ajustes.
import { CapaTikTokLayoutEditor } from './CapaTikTokLayoutEditor';
import { NavegadorDoRobo } from './NavegadorDoRobo';
import { RoboDoStudio } from './RoboDoStudio';

export function AjustesQueSalvamSozinhos() {
  return (
    <>
      <CapaTikTokLayoutEditor />
      <NavegadorDoRobo />
      <RoboDoStudio />
    </>
  );
}
