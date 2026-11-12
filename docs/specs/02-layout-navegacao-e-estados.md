# Spec 02 — Layout, Navegação, Estados de Carregamento (Skeletons) e Feedback

## 1. Contexto e problemas atuais

1. **Botão "Create" duplicado na mesma tela**:
   - A `TopBar` (`web/src/App.jsx`) exibe o botão azul `+ Create` permanentemente, e tanto `Board.jsx` quanto `Backlog.jsx` renderizam um segundo botão azul `Create` logo abaixo no cabeçalho da página (visível em `docs/images/board.png` e `docs/images/backlog.png`).
2. **Sidebar fixa de `240px` (`w-60`) sem recolhimento nem responsividade**:
   - Em notebooks de `1366px`–`1440px` ou janelas divididas ao meio, a `Sidebar` consome `240px` fixos mesmo quando o usuário precisa de espaço horizontal para enxergar 5–6 colunas do Kanban. Em telas `< 768px`, espreme o conteúdo principal.
3. **Falta de sinalização de gargalos na navegação**:
   - Não há indicação na `Sidebar` de quantos itens estão em `Blocked` ou `Validation` sem entrar em cada página.
4. **Estados de carregamento e vazio crus**:
   - Carregamentos exibem apenas uma frase solta (`Loading the sprint from Azure DevOps…`), gerando *layout shift* brusco quando as colunas/tabelas aparecem.
   - Estados vazios exibem apenas `<p>` simples, sem ação direta para limpar filtros quando `applyFilters` zera os resultados.
5. **Toast minimalista**:
   - Verificar posicionamento, empilhamento, botão de fechar manual e transição de entrada/saída em `Toast.jsx`.

---

## 2. Escopo da especificação

### 2.1. TopBar enxuta e botão `Create` contextual (`web/src/App.jsx`, `Board.jsx`, `Backlog.jsx`)

- Manter **um único CTA primário `+ Create`** na `TopBar`, tornando-o sensível à rota atual:
  - Em `/board`: pré-preenche `iterationPath` da sprint selecionada na URL (ou sprint atual) e `type: 'Task'` quando `mode=tasks`.
  - Em `/backlog`: pré-preenche `iterationPath: meta?.project` (Backlog).
  - Nas demais páginas: comportamento padrão atual.
- Remover os botões primários `Create` redundantes do `<header>` de `Board.jsx` e `Backlog.jsx` (mantendo o botão `+ Create issue` ao pé de cada seção no `Backlog` e `+ Task` em `Child issues` no `ItemModal`).
- Adicionar atalho visual discreto no campo de busca da `TopBar` (`/` badge à direita quando desfocado) e botão `✕` para limpar texto digitado.

### 2.2. Sidebar retrátil e responsiva (`web/src/App.jsx`)

- **Modo recolhido (Desktop)**:
  - Botão de recolher/expandir na borda ou rodapé da `Sidebar` (persistido em `prefs`: `sidebarCollapsed`).
  - Quando recolhida (`w-14` / `56px`): exibe o avatar de iniciais do projeto, os ícones de navegação centralizados com `title`/tooltip e os pontos indicadores de `Blocked`/`Validation`.
  - Quando expandida (`w-60` / `240px`): layout atual refinado com transição suave de largura (`transition-[width] duration-150`).
- **Modo gaveta (Telas estreitas `< 1024px`)**:
  - Botão hambúrguer na `TopBar` visível em `< lg`, abrindo a `Sidebar` como *drawer* sobreposto com backdrop e fechamento automático ao navegar.

### 2.3. Contadores de atenção na Sidebar (`Blocked` e `Validation`)

- Quando as queries `['blocked']` ou `['validation']` estiverem em cache — ou derivando da sprint atual carregada / prefetch leve com `staleTime: 2 * 60_000`:
  - Exibir pílula numérica discreta à direita de **Blocked** (tom `danger` quando `> 0`) e **Validation** (tom `brand-subtle` quando `> 0`).
  - No modo recolhido, exibir um pequeno ponto colorido (`6px`) no canto do ícone quando `> 0`.

### 2.4. Skeletons sem *layout shift* (`web/src/components/Skeleton.jsx`)

Criar esqueletos leves com `animate-pulse` usando `bg-column` / `bg-hover`:

- **`BoardSkeleton`**: 4–5 colunas de `272px` com cabeçalho cinza e 2–3 blocos de card simulados por coluna.
- **`BacklogSkeleton`**: 2 seções com cabeçalho e 4 linhas simuladas de `40px`.
- **`TableSkeleton`**: cabeçalho da `ItemsTable` + 6 linhas com barras simulando ícone, ID, título, responsável e status.
- **`ItemModalSkeleton`**: substitui `<div className="p-10 text-center">Loading #id</div>` no `ItemModal.jsx` pelo grid real de 2 colunas (`1fr` + `300px`), preservando a altura aproximada do modal e evitando pulo visual ao abrir uma issue.

### 2.5. Empty States acionáveis (`web/src/components/EmptyState.jsx`)

Componente reutilizável com ícone SVG sutil, título curto, descrição opcional e ação contextual:

- **Quando há filtros ativos (`FilterBar` com `active === true`) e `visible.length === 0`**:
  - Mensagem clara indicando que nenhum item corresponde aos filtros atuais + botão direto **"Limpar filtros" / "Clear filters"** (e, se `filters.mine` estiver ativo, dica específica de que *"Só meus itens"* está ligado!).
- **Quando a lista está genuinamente vazia** (ex.: `Blocked` = 0 itens, `Validation` = 0 itens):
  - Estado positivo sutil (ex.: ícone de check verde em `Blocked`: *"Nenhum item bloqueado no momento"*).

### 2.6. Refinamento de `Toast.jsx` e indicador global de sincronização

- Garantir animação curta de entrada (`translate-y` + `opacity`), ícone correspondente ao tipo (`success`, `error`, `info`), botão `✕` para dispensar imediatamente e suporte a `toast.info(...)` (útil para *"Link copiado"* na Spec 04).

---

## 3. Arquivos impactados

- `web/src/App.jsx`
- `web/src/components/Skeleton.jsx` *(novo)*
- `web/src/components/EmptyState.jsx` *(novo)*
- `web/src/components/Toast.jsx`
- `web/src/components/FilterBar.jsx`
- `web/src/components/ItemModal.jsx`
- `web/src/pages/Board.jsx`, `Backlog.jsx`, `Issues.jsx`, `FlagList.jsx`
- `web/src/lib/i18n.jsx`

## 4. Critérios de aceite

- [ ] Apenas um botão primário de criação visível por tela, mantendo os padrões contextuais da rota atual.
- [ ] Sidebar pode ser recolhida/expandida no desktop (estado salvo no navegador) e funciona como *drawer* em janelas estreitas.
- [ ] Abrir o Board, Backlog, Issues ou o Modal de um item não causa *layout shift* brusco durante o carregamento.
- [ ] Quando "Só meus itens" ou busca esconde todos os resultados, o estado vazio oferece botão de 1 clique para limpar os filtros.
