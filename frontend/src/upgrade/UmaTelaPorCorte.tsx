import { Fragment, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { corteDaLive } from './upgradeRoutes';

/**
 * D-1033: cada corte abre numa instância nova da tela. J e K agora ficam na
 * mesma rota, e a instância que seguia viva levava o estado de um corte para o
 * outro: o trecho selecionado no corte 5 era riscado no 6 pelo Ctrl+Delete, e o
 * desfazer e o rascunho do layout gravavam no corte errado. Cada estado teria
 * de lembrar de se zerar; trocando a instância, nenhum precisa.
 */
export function UmaTelaPorCorte({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  return <Fragment key={corteDaLive(pathname, search) ?? ''}>{children}</Fragment>;
}
