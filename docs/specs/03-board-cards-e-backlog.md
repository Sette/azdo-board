# Spec 03 — Kanban Board, Hierarquia dos Cards, Backlog e Tabelas

## 1. Contexto e problemas atuais

1. **Cabeçalhos de coluna desconectados das colunas (`Board.jsx`)**:
   - A linha sticky de cabeçalhos usa `rounded-t-md` com `pb-2` de espaço branco antes do container `Column` (`rounded-md`), parecendo blocos soltos (visível em `docs/images/board.png`), além de usar `float-right` para os pontos (`Board.jsx:291`).
   - No modo `Tasks`, o cabeçalho mostra apenas quantidade de tasks, sem soma de horas (`concluídas / restantes`), enquanto o modo `PBIs & Bugs` mostra soma de `pts`.
2. **Cards (`Card.jsx`) sem sinalização de Prioridade, Validação ou excesso de Tags**:
   - `item.priority` (`1`–`4`) já vem em `LIST_FIELDS` (`server/src/mappers.js`), mas não aparece nos cards nem nas linhas do Backlog.
   - Quando `item.tags.length > 3`, as tags extras são cortadas silenciosamente (`slice(0, 3)`) sem indicador `+N`.
   - Itens com `inValidation === true` em colunas que não sejam a coluna dedicada de validação não mostram selo visual no card.
   - Falta anel `:focus-visible` claro para navegação por teclado nos cards.
3. **Swimlanes (`groupBy="parent"` / `"assignee"`) podem comunicar melhor o progresso**:
   - Em `groupBy="parent"` (`docs/images/board-tasks.png`), o estado do PBI pai só aparece quando concluído (`parentDone`), sem o responsável do PBI nem barra compacta de progresso das tasks daquela raia.
   - Falta botão rápido "Recolher todas / Expandir todas" quando há muitas raias abertas.
4. **Backlog (`Backlog.jsx`) sem alça visual de arraste e resumo de status**:
   - As linhas inteiras são arrastáveis sem ícone de *grip* (`⋮⋮`), o que não comunica visualmente o *drag-and-drop* entre sprints.
   - O cabeçalho de cada sprint mostra apenas `pts` totais, sem divisão visual por categoria (`Proposed` / `InProgress` / `Completed`).
5. **`ItemsTable.jsx` sem ordenação por coluna**:
   - Em `Issues`, `Blocked` e `Validation`, não é possível clicar nos cabeçalhos (`Key`, `Summary`, `Sprint`, `Assignee`, `Status`, `Updated`) para ordenar crescente/decrescente.

---

## 2. Escopo da especificação

### 2.1. Colunas e Cabeçalhos do Kanban (`web/src/pages/Board.jsx`)

- **Cabeçalho de coluna estruturado com Flexbox**:
  - Substituir `float-right` por layout flex alinhado (`items-center justify-between gap-2`), com barra/ponto indicador sutil de categoria (`Proposed` cinza, `InProgress` azul, `Blocked` vermelho, `Completed` verde).
  - Contador em pílula compacta (`rounded-full bg-surface/80 px-1.5 text-[11px]`).
  - No modo `Tasks`, exibir no canto direito do cabeçalho o somatório de horas da coluna quando `> 0` (ex.: `11h` ou `6h / 5h`), espelhando o `pts` do modo `PBIs & Bugs`.
  - Melhorar continuidade visual entre o cabeçalho sticky e o trilho da coluna (bordas consistentes `rounded-md` e sombra sutil no cabeçalho apenas quando rolado verticalmente).
- **Feedback de Drop Zone**:
  - Destacar coluna alvo no arraste com borda tracejada suave (`ring-2 ring-brand/40 bg-brand-subtle/60`) para deixar nítido onde o card cairá em raias longas.
- **Controles de Swimlanes**:
  - Quando `groupBy !== 'none'` e houver mais de 1 raia, exibir botão compacto para **Recolher todas / Expandir todas** ao lado do seletor `Group`.
  - Nas raias de `Parent PBI`: exibir sempre o `StateLozenge` do PBI pai, `Avatar` do responsável do PBI, mini-barra de conclusão (`done/total` tasks da raia) e botão `+ Task` direto no cabeçalho da raia (criando task já vinculada àquele PBI e sprint!).

### 2.2. Hierarquia e polimento do `Card.jsx`

- **Indicador de Prioridade**:
  - Ícone discreto de prioridade no rodapé do card (especialmente visível para Prioridade `1` crítica em vermelho/laranja e `2` alta; neutro/discreto para `3` e `4`), com `title={t('priorityValue', { n: item.priority })}`.
- **Tags com contador de excedente**:
  - Manter até 3 tags visíveis e, se `item.tags.length > 3`, exibir `+${item.tags.length - 3}` com `title` listando as demais tags.
  - Diferenciar sutilmente tags de planejamento (`planned` / `unplanned`, quando configuradas em `meta.planning`) das tags de domínio.
- **Microinterações e Ações Rápidas no Hover**:
  - Transição suave `transition-shadow duration-150 hover:shadow-md` (mantendo o fundo limpo) e `focus-visible:ring-2 focus-visible:ring-brand`.
  - Ao passar o mouse ou focar o card, revelar botão discreto `⋯` (ou ação rápida de copiar `#id` / alternar bloqueio) no canto superior direito sem empurrar o texto do título.

### 2.3. Melhorias na página `Backlog.jsx`

- **Alça de arraste (`Grip`) e Prioridade na linha (`Row`)**:
  - Adicionar ícone `grip-vertical` à esquerda da linha que aparece com mais contraste no hover (`cursor-grab active:cursor-grabbing`).
  - Exibir indicador de prioridade ao lado do `StateLozenge`.
- **Resumo de progresso no cabeçalho da Sprint (`Section`)**:
  - Exibir mini-barra segmentada ou pílulas de esforço por categoria (`Concluído` verde / `Em andamento` azul / `A fazer` cinza) ao lado do total de `pts` da sprint.

### 2.4. Ordenação e polimento na `ItemsTable.jsx`

- Tornar as colunas `Key` (`id`), `Summary` (`title`), `Sprint` (`sprint`), `Assignee` (`assignee.name`), `Status` (`state`) e `Updated` (`changedDate`) clicáveis para ordenação local (`asc` / `desc`), com seta indicadora na coluna ativa e `aria-sort`.
- Cabeçalho `<thead>` sticky (`sticky top-0 bg-surface z-10`) ao rolar listas grandes em `Issues`, `Blocked` e `Validation`.

### 2.5. Barra de Filtros (`FilterBar.jsx`)

- Quando houver mais de ~7 pessoas na sprint/lista, agrupar os avatares excedentes num botão `+N` com popover pesquisável para evitar quebra de linha na barra de filtros.
- Destacar contagem de itens filtrados vs total quando houver filtro ativo (ex.: `Showing 4 of 17`).

---

## 3. Arquivos impactados

- `web/src/components/Card.jsx`
- `web/src/components/FilterBar.jsx`
- `web/src/components/ItemsTable.jsx`
- `web/src/pages/Board.jsx`
- `web/src/pages/Backlog.jsx`
- `web/src/lib/i18n.jsx`

## 4. Critérios de aceite

- [ ] Cabeçalhos do Kanban alinhados com Flexbox, mostrando resumo de `pts` (modo Items) ou horas (modo Tasks).
- [ ] Em `Tasks` agrupado por `Parent PBI`, cada raia permite criar `+ Task` diretamente para aquele PBI e exibe seu status/progresso.
- [ ] Cards exibem prioridade, contador `+N` para mais de 3 tags e estados claros de hover, drag e foco por teclado.
- [ ] `ItemsTable` permite ordenar qualquer coluna com cabeçalho fixo durante a rolagem.
