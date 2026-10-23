// D-832, D-895 e D-980: cada um salva sozinho, com a própria mutation — fora do
// `isBusy` do formulário de ajustes. D-938: o layout da capa do TikTok (D-532)
// saiu daqui — ajusta-se no "Estilizar capa", por canal; o layout global já
// salvo continua sendo a base da cascata (RN-10).
import { ContasDosDestinos } from './ContasDosDestinos';
import { NavegadorDoRobo } from './NavegadorDoRobo';
import { RoboDoStudio } from './RoboDoStudio';

export function AjustesQueSalvamSozinhos() {
  return (
    <>
      <NavegadorDoRobo />
      <RoboDoStudio />
      <ContasDosDestinos />
    </>
  );
}
