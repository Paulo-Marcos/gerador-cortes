import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface ProjetoResumido {
  id: string;
  titulo_live: string;
  canal_origem: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectStateService {
  /** Projeto atualmente selecionado no menu lateral */
  projetoSelecionado = signal<ProjetoResumido | null>(null);

  constructor(private router: Router) {}

  /** Selecionar projeto e, opcionalmente, navegar para uma etapa da pipeline */
  selecionarProjeto(projeto: ProjetoResumido, etapa?: string) {
    this.projetoSelecionado.set(projeto);
    if (etapa) {
      this.navegarParaEtapa(etapa, projeto.id);
    }
  }

  limparProjeto() {
    this.projetoSelecionado.set(null);
  }

  navegarParaEtapa(etapa: string, projetoId?: string) {
    const id = projetoId ?? this.projetoSelecionado()?.id;
    if (!id) {
      this.router.navigate(['/projetos']);
      return;
    }
    const rotas: Record<string, string[]> = {
      'ingestao':   ['/projetos', id],
      'analise':    ['/projetos', id],
      'editor':     ['/projetos', id, 'cortes'],
      'metadados':  ['/projetos', id, 'metadados'],
      'export':     ['/projetos', id, 'export'],
    };
    const rota = rotas[etapa] ?? ['/projetos', id];
    this.router.navigate(rota);
  }
}
