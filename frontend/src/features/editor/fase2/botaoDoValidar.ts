// O botão "Validar o plano" do painel de cenas: rótulo, dica e trava (D-1070).
// D-1072 (RN-38): o plano vazio também se valida, e é a validação que destrava o
// render final. Com zero cenas e fora da geração, o botão diz "Validar sem cenas";
// durante a geração as cenas ainda vão chegar, então ele espera.

export interface EstadoDoValidar {
  cenasValidadas: boolean;
  faltam: number;
  totalDeCenas: number;
  dirty: boolean;
  emGeracao: boolean;
  validando: boolean;
}

export interface BotaoDoValidar {
  rotulo: string;
  dica: string;
  desabilitado: boolean;
}

export function montarBotaoDoValidar(e: EstadoDoValidar): BotaoDoValidar {
  const semCenas = e.totalDeCenas === 0 && !e.emGeracao;
  return {
    rotulo: rotuloDoValidar(e, semCenas),
    dica: dicaDoValidar(e, semCenas),
    desabilitado: e.validando || e.dirty || e.emGeracao,
  };
}

function rotuloDoValidar(e: EstadoDoValidar, semCenas: boolean): string {
  if (e.cenasValidadas) return 'Plano validado';
  if (semCenas) return 'Validar sem cenas';
  return e.faltam > 0 ? `Validar o plano (faltam ${e.faltam})` : 'Validar o plano';
}

function dicaDoValidar(e: EstadoDoValidar, semCenas: boolean): string {
  if (e.emGeracao) return 'Espere as cenas terminarem de ser geradas';
  if (e.dirty) return 'Salve as cenas antes de validar';
  if (e.cenasValidadas) return 'Desfazer a validação do plano';
  if (semCenas) return 'Validar o plano vazio: o render final sai sem cenas';
  return e.faltam > 0
    ? `${e.faltam} cena(s) pedem conferência; os avisos não impedem validar`
    : 'Validar o plano de cenas';
}
