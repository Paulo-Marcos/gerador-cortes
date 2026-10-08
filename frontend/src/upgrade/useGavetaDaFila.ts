import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// D-897 · quem dispara um envio em lote passa a acompanhar na gaveta da fila.
//
// O modal do lote prendia a tela: para ver o progresso era preciso ficar nele,
// e trocar de projeto fazia a referência sumir. O lote sempre correu no backend;
// faltava só a vista sair da tela que o disparou. A gaveta já é essa vista, mas
// mora na casca, e a tela do lote não a enxerga. O pedido é um evento de
// janela: a tela não precisa conhecer a casca, só dizer "abra".

const PEDIDO = 'casca:abrir-gaveta-da-fila';

/** Abre a gaveta da fila de onde estiver — o modal que disparou o lote chama isto ao fechar. */
export function pedirGavetaDaFila(): void {
  window.dispatchEvent(new Event(PEDIDO));
}

/** Escuta os pedidos de abrir a gaveta; devolve o desligar. */
export function aoPedirGavetaDaFila(abrir: () => void): () => void {
  window.addEventListener(PEDIDO, abrir);
  return () => window.removeEventListener(PEDIDO, abrir);
}

/**
 * D-746: a fila é consulta, não destino — gaveta sobre a tela atual. Trocar de
 * tela (⌘[, "Onde eu estava", link) fecha a gaveta: ela não viaja junto.
 */
export function useGavetaDaFila(pathname: string) {
  const navigate = useNavigate();
  const [aberta, setAberta] = useState(false);
  const abrir = useCallback(() => setAberta(true), []);
  const fechar = useCallback(() => setAberta(false), []);
  const telaCheia = useCallback(() => {
    setAberta(false);
    navigate('/fila');
  }, [navigate]);

  useEffect(() => setAberta(false), [pathname]);
  useEffect(() => aoPedirGavetaDaFila(abrir), [abrir]);

  return { aberta, abrir, fechar, telaCheia };
}
