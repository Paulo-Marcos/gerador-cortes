// ─────────────────────────────────────────────────────────────────
// D-599 · O que uma tecla significa para a casca.
//
// A casca responde a ⌘B, ⌘K, J, K e Enter. As três últimas são teclas
// comuns — as mesmas que a pessoa usa para digitar e para apertar
// botões —, então a pergunta difícil não é "o que J faz", e sim "quando
// J é da casca e quando é de outra pessoa".
//
// A decisão mora aqui, sem DOM, para poder ser testada caso a caso: um
// Enter que aprova um corte no momento errado custa uma decisão
// editorial, e esse tipo de erro não se descobre olhando a tela.
// ─────────────────────────────────────────────────────────────────

export type AcaoDaCasca = 'trilho' | 'busca' | 'proximo' | 'anterior' | 'primario';

export type Contexto = {
  tecla: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  /** Foco num campo de texto, select ou área editável. */
  digitando: boolean;
  /** Foco num controle que já responde a Enter sozinho (botão, link, aba…). */
  focoEmControle: boolean;
  /** Diálogo, menu ou popover aberto. */
  overlayAberto: boolean;
  /** Algum handler anterior já tratou o evento. */
  jaTratado: boolean;
  /** A barra tem primário ligado a uma ação e não desabilitado. */
  primarioDisponivel: boolean;
};

export function acaoDaTecla(c: Contexto): AcaoDaCasca | null {
  const comando = c.meta || c.ctrl;
  const tecla = c.tecla.toLowerCase();

  // ⌘B e ⌘K valem até digitando: o modificador já diz que não é texto.
  if (comando && tecla === 'b') return 'trilho';
  if (comando && tecla === 'k') return 'busca';

  // Daqui para baixo são teclas sem modificador. Elas pertencem a quem
  // estiver escrevendo ou a um diálogo aberto — nunca à casca nesses casos.
  if (c.digitando || c.meta || c.ctrl || c.alt || c.overlayAberto) return null;

  if (tecla === 'j') return 'proximo';
  if (tecla === 'k') return 'anterior';

  if (tecla === 'enter') {
    // Com o foco num botão, o navegador JÁ vai clicar nele. Disparar o
    // primário também seria ação dupla: foco em "Rejeitar" + Enter
    // rejeitaria e aprovaria o mesmo corte num toque.
    if (c.jaTratado || c.focoEmControle || !c.primarioDisponivel) return null;
    return 'primario';
  }

  return null;
}
