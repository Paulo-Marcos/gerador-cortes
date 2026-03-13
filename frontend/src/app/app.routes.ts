import { Routes } from '@angular/router';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'projetos',
        pathMatch: 'full',
    },
    {
        path: 'projetos',
        loadComponent: () =>
            import('./pages/projetos/projetos.component').then(m => m.ProjetosComponent),
    },
    {
        path: 'projetos/:id',
        loadComponent: () =>
            import('./pages/projeto-detalhe/projeto-detalhe.component').then(m => m.ProjetoDetalheComponent),
    },
    {
        path: 'projetos/:id/cortes',
        loadComponent: () =>
            import('./pages/cortes-editor/cortes-editor.component').then(m => m.CortesEditorComponent),
    },
    {
        path: 'projetos/:id/metadados',
        loadComponent: () =>
            import('./pages/metadados/metadados.component').then(m => m.MetadadosComponent),
    },
    {
        path: 'projetos/:id/export',
        loadComponent: () =>
            import('./pages/export/export.component').then(m => m.ExportComponent),
    },
];
