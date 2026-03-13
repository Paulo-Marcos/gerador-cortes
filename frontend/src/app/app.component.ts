import { Component, OnInit, signal, computed } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from './services/api.service';
import { ProjectStateService, ProjetoResumido } from './services/project-state.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, FormsModule],
  template: `
    <div class="shell">
      <!-- Sidebar -->
      <aside class="sidebar" style="display:flex;flex-direction:column;overflow:hidden;">
        <!-- Logo -->
        <div class="sidebar-logo">
          <div class="logo-icon">✂️</div>
          <div>
            <div class="logo-text">CortadorLive</div>
            <div class="logo-sub">Pipeline de Cortes</div>
          </div>
        </div>

        <nav class="sidebar-nav" style="flex:1;overflow-y:auto;">
          <!-- ── Projetos ── -->
          <div class="nav-section-label">Projetos</div>

          <a (click)="irParaProjetos()" class="nav-link" style="cursor:pointer;"
             [style.background]="rotaAtual().includes('/projetos') && !projetoAtivo() ? 'var(--bg-600)' : ''">
            <span class="nav-icon">🏠</span> Todos os Projetos
          </a>

          <!-- Select com busca de projeto -->
          <div style="padding: 8px 4px; margin-top: 4px;">
            <div style="position:relative;">
              <input
                type="text"
                [(ngModel)]="buscaProjeto"
                (focus)="mostrarDropdown = true"
                (blur)="fecharDropdownComAtraso()"
                placeholder="🔍 Buscar projeto..."
                style="width:100%;background:var(--bg-700);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:12px;color:var(--text-100);box-sizing:border-box;outline:none;"
              />
              @if (mostrarDropdown && projetosFiltrados().length > 0) {
                <div style="position:absolute;top:100%;left:0;right:0;background:var(--bg-600);border:1px solid var(--border);border-radius:6px;max-height:180px;overflow-y:auto;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                  @for (p of projetosFiltrados(); track p.id) {
                    <div (mousedown)="selecionarProjeto(p)"
                         style="padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border);"
                         [style.background]="projetoAtivo()?.id === p.id ? 'var(--primary-800)' : ''">
                      <div style="font-weight:600;color:var(--text-100);">{{ p.titulo_live || 'Sem título' }}</div>
                      <div style="color:var(--text-400);font-size:10px;">{{ p.canal_origem }}</div>
                    </div>
                  }
                </div>
              }
            </div>

            @if (projetoAtivo()) {
              <div style="margin-top:6px;background:var(--bg-700);border:1px solid var(--primary-600);border-radius:6px;padding:6px 10px;">
                <div style="font-size:10px;color:var(--primary-400);margin-bottom:2px;">Projeto ativo:</div>
                <div style="font-size:11px;font-weight:600;color:var(--text-100);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  {{ projetoAtivo()!.titulo_live || 'Sem título' }}
                </div>
                <button (click)="limparProjeto()" style="font-size:10px;color:var(--text-400);background:none;border:none;cursor:pointer;padding:0;margin-top:2px;">✕ limpar</button>
              </div>
            }
          </div>

          <!-- ── Pipeline ── -->
          <div class="nav-section-label" style="margin-top: 16px;">Pipeline</div>
          <div style="font-size:10px;color:var(--text-600);padding:0 4px 6px;font-style:italic;">
            {{ projetoAtivo() ? 'Clique para navegar' : 'Selecione um projeto acima' }}
          </div>

          @for (etapa of etapasPipeline; track etapa.id) {
            <a (click)="navegarEtapa(etapa.id)"
               class="nav-link"
               [class.text-muted]="!projetoAtivo()"
               [style.cursor]="projetoAtivo() ? 'pointer' : 'default'"
               [style.background]="etapaAtiva() === etapa.id ? 'var(--primary-900)' : ''"
               [style.border-left]="etapaAtiva() === etapa.id ? '3px solid var(--primary-400)' : '3px solid transparent'"
               style="font-size:12px;transition:all 0.15s;">
              <span class="nav-icon">{{ etapa.emoji }}</span>
              {{ etapa.label }}
              @if (!projetoAtivo()) {
                <span style="font-size:9px;color:var(--text-600);margin-left:4px;">🔒</span>
              }
            </a>
          }
        </nav>

        <!-- Footer -->
        <div style="padding: 12px 16px; border-top: 1px solid var(--border);">
          <div class="text-xs text-muted">v1.0.0 · &#64;ateuinforma</div>
        </div>
      </aside>

      <!-- Conteúdo principal -->
      <main class="main-content">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppComponent implements OnInit {
  projetos = signal<ProjetoResumido[]>([]);
  buscaProjeto = '';
  mostrarDropdown = false;

  etapasPipeline = [
    { id: 'ingestao',  emoji: '1️⃣', label: 'Ingestão + Transcrição' },
    { id: 'analise',   emoji: '2️⃣', label: 'Análise IA → Cortes' },
    { id: 'editor',    emoji: '3️⃣', label: 'Editor de Cortes' },
    { id: 'metadados', emoji: '4️⃣', label: 'Metadados + Thumbnails' },
    { id: 'export',    emoji: '5️⃣', label: 'Export Final' },
  ];

  rotaAtual = signal('');
  etapaAtiva = computed(() => {
    const rota = this.rotaAtual();
    if (rota.includes('/export'))    return 'export';
    if (rota.includes('/metadados')) return 'metadados';
    if (rota.includes('/cortes'))    return 'editor';
    if (rota.match(/\/projetos\/[^/]+$/)) return 'ingestao';
    return '';
  });

  projetoAtivo = computed(() => this.state.projetoSelecionado());

  projetosFiltrados = computed(() => {
    const q = this.buscaProjeto.toLowerCase();
    if (!q) return this.projetos();
    return this.projetos().filter(p =>
      (p.titulo_live || '').toLowerCase().includes(q) ||
      (p.canal_origem || '').toLowerCase().includes(q)
    );
  });

  constructor(
    private api: ApiService,
    private state: ProjectStateService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.carregarProjetos();
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      const url = e.urlAfterRedirects ?? e.url ?? '';
      this.rotaAtual.set(url);
      
      const match = url.match(/\/projetos\/([a-zA-Z0-9-]+)/);
      if (match && match[1]) {
        const id = match[1];
        if (this.projetoAtivo()?.id !== id) {
           const p = this.projetos().find(x => x.id === id);
           if (p) {
              this.state.selecionarProjeto(p);
              this.buscaProjeto = p.titulo_live || p.id.slice(0, 8);
           }
        }
      }
    });
  }

  carregarProjetos() {
    this.api.listarProjetos().subscribe({
      next: (res: any) => {
        this.projetos.set(res.projetos ?? res ?? []);
        // Reavaliar rota atual após a carga assíncrona
        const match = this.rotaAtual().match(/\/projetos\/([a-zA-Z0-9-]+)/);
        if (match && match[1] && this.projetoAtivo()?.id !== match[1]) {
           const p = this.projetos().find(x => x.id === match[1]);
           if (p) {
              this.state.selecionarProjeto(p);
              this.buscaProjeto = p.titulo_live || p.id.slice(0, 8);
           }
        }
      },
      error: () => {},
    });
  }

  selecionarProjeto(p: ProjetoResumido) {
    this.state.selecionarProjeto(p);
    this.buscaProjeto = p.titulo_live || p.id.slice(0, 8);
    this.mostrarDropdown = false;
    this.router.navigate(['/projetos', p.id]);
  }

  limparProjeto() {
    this.state.limparProjeto();
    this.buscaProjeto = '';
  }

  navegarEtapa(etapaId: string) {
    if (!this.projetoAtivo()) return;
    this.state.navegarParaEtapa(etapaId);
  }

  irParaProjetos() {
    this.router.navigate(['/projetos']);
  }

  fecharDropdownComAtraso() {
    setTimeout(() => { this.mostrarDropdown = false; }, 200);
  }
}
