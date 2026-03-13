import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { Projeto, StatusProjeto } from '../../models/models';

@Component({
  selector: 'app-projetos',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="animate-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Projetos</h1>
          <p class="page-subtitle">Gerencie suas lives e pipelines de cortes</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" (click)="mostrarForm.set(!mostrarForm())">
            ➕ Novo Projeto
          </button>
        </div>
      </div>

      <!-- Formulário de criação -->
      @if (mostrarForm()) {
        <div class="card" style="margin-bottom: 24px; border-color: var(--accent-600);">
          <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 16px;">
            🎬 Iniciar novo projeto de Live
          </h3>
          <div class="form-group">
            <label class="form-label">URL do YouTube</label>
            <input
              class="form-input"
              type="url"
              [(ngModel)]="novaUrl"
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>
          <div class="form-group">
            <label class="form-label">Canal de Origem</label>
            <input
              class="form-input"
              [(ngModel)]="novoCanal"
              placeholder="@ateuinforma"
            />
          </div>
          <div class="flex gap-2">
            <button
              class="btn btn-primary"
              [disabled]="!novaUrl() || criando()"
              (click)="criarProjeto()"
            >
              @if (criando()) {
                <span class="spinner"></span> Criando...
              } @else {
                ✅ Criar e Iniciar Download
              }
            </button>
            <button class="btn btn-ghost" (click)="mostrarForm.set(false)">Cancelar</button>
          </div>
        </div>
      }

      <!-- Lista de Projetos -->
      @if (carregando()) {
        <div class="empty-state">
          <div class="spinner" style="width:32px;height:32px;border-width:3px;"></div>
          <p class="empty-title">Carregando projetos...</p>
        </div>
      } @else if (projetos().length === 0) {
        <div class="empty-state card">
          <div class="empty-icon">🎬</div>
          <p class="empty-title">Nenhum projeto ainda</p>
          <p class="empty-desc">Clique em "Novo Projeto" e cole a URL de uma live para começar</p>
          <button class="btn btn-primary mt-4" (click)="mostrarForm.set(true)">Criar Primeiro Projeto</button>
        </div>
      } @else {
        <div class="grid-auto">
          @for (projeto of projetos(); track projeto.id) {
            <div class="card" style="cursor: pointer;" [routerLink]="['/projetos', projeto.id]">
              <div class="flex justify-between items-center mb-4">
                <span [class]="getBadgeClass(projeto.status)">
                  {{ getStatusLabel(projeto.status) }}
                </span>
                <span class="text-xs text-muted font-mono">
                  {{ formatarDuracao(projeto.duracao_segundos) }}
                </span>
              </div>

              <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 8px; line-height: 1.4;">
                {{ projeto.titulo_live || 'Carregando título...' }}
              </h3>

              <p class="text-sm text-muted" style="margin-bottom: 12px;">
                {{ projeto.canal_origem }}
              </p>

              @if (projeto.status === 'baixando') {
                <div class="progress-track">
                  <div class="progress-fill" [style.width.%]="projeto.progresso_download"></div>
                </div>
                <p class="text-xs text-muted" style="margin-top: 4px;">
                  {{ projeto.progresso_download.toFixed(0) }}% baixado
                </p>
              }

              <div class="flex gap-2 mt-4">
                <button class="btn btn-secondary btn-sm" [routerLink]="['/projetos', projeto.id]">
                  Ver Detalhes →
                </button>
                @if (projeto.status === 'analisado') {
                  <button class="btn btn-primary btn-sm" [routerLink]="['/projetos', projeto.id, 'cortes']">
                  ✂️ Editar Cortes
                  </button>
                }
                <button class="btn btn-ghost btn-sm" style="color: var(--error); margin-left: auto;" (click)="removerProjeto(projeto); $event.stopPropagation()">
                  🗑️
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ProjetosComponent implements OnInit {
  private api = inject(ApiService);

  projetos = signal<Projeto[]>([]);
  carregando = signal(true);
  mostrarForm = signal(false);
  criando = signal(false);
  novaUrl = signal('');
  novoCanal = signal('@ateuinforma');

  ngOnInit() {
    this.carregarProjetos();
  }

  carregarProjetos() {
    this.carregando.set(true);
    this.api.listarProjetos().subscribe({
      next: (p) => { this.projetos.set(p); this.carregando.set(false); },
      error: () => this.carregando.set(false),
    });
  }

  criarProjeto() {
    if (!this.novaUrl()) return;
    this.criando.set(true);
    this.api.criarProjeto({ youtube_url: this.novaUrl(), canal_origem: this.novoCanal() }).subscribe({
      next: (p) => {
        this.projetos.update(list => [p, ...list]);
        this.mostrarForm.set(false);
        this.novaUrl.set('');
        this.criando.set(false);
      },
      error: () => this.criando.set(false),
    });
  }

  removerProjeto(projeto: Projeto) {
    if (!confirm(`Tem certeza que deseja remover o projeto "${projeto.titulo_live || projeto.youtube_url}"? Todos os cortes e metadados gerados serão excluídos permanentemente.`)) {
      return;
    }
    this.api.removerProjeto(projeto.id).subscribe({
      next: () => {
        this.projetos.update(list => list.filter(p => p.id !== projeto.id));
      },
      error: (err) => alert('Erro ao remover projeto.')
    });
  }

  getBadgeClass(status: StatusProjeto): string {
    const map: Record<StatusProjeto, string> = {
      pendente: 'badge badge-proposto',
      baixando: 'badge badge-baixando',
      transcrevendo: 'badge badge-baixando',
      pronto: 'badge badge-aprovado',
      analisando: 'badge badge-baixando',
      analisado: 'badge badge-pronto',
      erro: 'badge badge-rejeitado',
    };
    return map[status] ?? 'badge';
  }

  getStatusLabel(status: StatusProjeto): string {
    const labels: Record<StatusProjeto, string> = {
      pendente: '⏳ Pendente',
      baixando: '⬇️ Baixando',
      transcrevendo: '📝 Transcrevendo',
      pronto: '✅ Pronto',
      analisando: '🤖 Analisando',
      analisado: '✂️ Cortes prontos',
      erro: '❌ Erro',
    };
    return labels[status] ?? status;
  }

  formatarDuracao(seg: number): string {
    if (!seg) return '--:--';
    const h = Math.floor(seg / 3600);
    const m = Math.floor((seg % 3600) / 60);
    const s = seg % 60;
    return h > 0
      ? `${h}h ${m.toString().padStart(2, '0')}m`
      : `${m}m ${s.toString().padStart(2, '0')}s`;
  }
}
