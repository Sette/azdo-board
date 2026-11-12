# Spec 04 — Modal do Item, Editor Markdown e Atalhos de Produtividade

## 1. Contexto e problemas atuais

1. **Rolagem inteira no `ItemModal.jsx`**:
   - Hoje o overlay inteiro (`fixed inset-0 overflow-y-auto`) rola como um bloco único. Em itens com descrição grande, muitas tasks filhas ou vários comentários, o cabeçalho (ID, link para o Azure, botão fechar `✕`) e o painel lateral `Details` somem da tela ao rolar.
2. **Falta de feedback ao copiar link/ID**:
   - O botão de copiar link (`ItemModal.jsx:85`) chama `navigator.clipboard?.writeText(item.webUrl)` sem nenhum feedback visual (nem troca temporária para `✓` nem toast), e não há opção rápida de copiar a referência `#201 Título` ou apenas `#201` para colar em PRs/commits/chat.
3. **Edição Markdown sem atalho `Ctrl+Enter`, sem barra de apoio e sem Preview**:
   - Enquanto `Comments` aceita `Ctrl+Enter` / `Cmd+Enter` para enviar (`ItemModal.jsx:282`), o `<textarea>` de `RichField` (`ItemModal.jsx:175`) só trata `Escape` — o usuário precisa clicar manualmente no botão `Save`.
   - Não há aba **Write / Preview** nem botões rápidos de formatação (negrito, código, link, checklist `- [ ]`), obrigando a salvar para conferir tabelas/listas ou reabrir se houver erro de sintaxe.
4. **Ausência de atalhos rápidos de teclado no estilo Jira/Linear**:
   - Ações recorrentes (focar busca, criar item, alternar "Só meus itens", ir para Board/Backlog, buscar item por `#id`) exigem sempre uso do mouse.

---

## 2. Escopo da especificação

### 2.1. Layout com Cabeçalho Fixo e Colunas Independentes no `ItemModal.jsx`

- Limitar a altura máxima do container do modal em telas grandes (`lg:max-h-[calc(100vh-4rem)] lg:flex lg:flex-col overflow-hidden`):
  - **Cabeçalho fixo (`shrink-0 border-b border-line`)**: breadcrumb do pai, link para Azure DevOps, badge `Blocked` / `In Validation`, status `Saving…`, botões de cópia e fechar `✕` sempre visíveis.
  - **Corpo com rolagem suave**: em `lg+`, coluna principal (`Description`, `Acceptance criteria`, `Child issues`, `Comments`) e barra lateral `Details` com rolagem independente (ou `Details` `sticky top-4`), permitindo consultar/alterar estado, sprint e horas mesmo lendo o último comentário.
- **Ações de cópia com confirmação visual**:
  - Botão de copiar URL do Azure DevOps troca o ícone `link` por `check` verde por `1.5s` (+ `toast.info`).
  - Clique no badge/código `#201` (ou botão ao lado) copia `#201` para a área de transferência com o mesmo feedback instantâneo.

### 2.2. Editor Markdown com Toolbar Compacta e Preview (`web/src/components/MarkdownEditor.jsx`)

Criar componente reutilizável `MarkdownEditor.jsx` usado em `RichField` (`ItemModal.jsx`), `Comments` (`ItemModal.jsx`) e `CreateModal.jsx`:

- **Abas `Editar` / `Visualizar` (`Write` / `Preview`)**:
  - Aba `Preview` renderiza exatamente `toSafeHtml(draft, 'markdown')` com `.prose-azdo`, garantindo fidelidade total ao resultado salvo.
- **Barra de ferramentas enxuta**:
  - Botões que envolvem a seleção atual do `<textarea>` (ou inserem no cursor): **Negrito** (`**…**`), *Itálico* (`*…*`), `Código inline` (`` `…` ``), Bloco de código (` ``` `), Lista (`- `), **Checklist** (`- [ ] `) e Link (`[texto](url)`).
- **Ergonomia de teclado no `<textarea>`**:
  - `Ctrl+Enter` / `Cmd+Enter`: salva imediatamente em `RichField` (igual aos comentários) — atualizar `markdownSaveHint` em `i18n.jsx` informando `Ctrl+Enter`.
  - `Enter` ao final de uma linha de lista (`- `, `* `, `1. `) ou checklist (`- [ ] `, `- [x] `): continua automaticamente o próximo item (`- [ ] `), ou encerra a lista se o item atual estiver vazio!
  - `Tab` / `Shift+Tab` em linhas de lista: indenta / desindenta 2 espaços.

### 2.3. Melhorias na lista de `Child issues` e `Comments` (`ItemModal.jsx`)

- **Child issues**:
  - Permitir reordenar/filtrar ou ocultar tasks concluídas quando houver muitas tasks (> 6), além de exibir o `Remaining Work` quando existir ao lado do `Completed Work`.
- **Comments**:
  - Exibir avatar real do usuário atual (`meta?.me` buscado em `people`) ao lado da caixa *"Add a comment…"* em vez de `Avatar person={null}` (`ItemModal.jsx:277`).

### 2.4. Atalhos Globais de Teclado e Paleta Rápida (`Ctrl+K` / `Cmd+K`)

Ignorando eventos quando o foco estiver em `input`, `textarea`, `select` ou `[contenteditable]`:

| Atalho | Ação |
|---|---|
| `/` | Foca o campo de busca da página atual (ou busca global na `TopBar`) |
| `c` | Abre o `CreateModal` com o contexto da página atual |
| `m` | Alterna o filtro *"Só meus itens"* (`Only my issues`) nas páginas com `FilterBar` |
| `[` | Recolhe / expande a `Sidebar` |
| `?` | Abre modal compacto listando os atalhos disponíveis |
| `Ctrl+K` / `Cmd+K` | Abre **Command Palette** leve: pular para `#id` ou buscar item nos itens carregados, trocar de sprint, alternar modo `PBIs & Bugs` ↔ `Tasks`, navegar entre páginas e alternar tema/idioma |

---

## 3. Arquivos impactados

- `web/src/components/MarkdownEditor.jsx` *(novo)*
- `web/src/components/CommandPalette.jsx` *(novo)*
- `web/src/components/ShortcutsModal.jsx` *(novo, ou integrado à CommandPalette)*
- `web/src/components/ItemModal.jsx`
- `web/src/components/CreateModal.jsx`
- `web/src/App.jsx`
- `web/src/lib/i18n.jsx`

## 4. Critérios de aceite

- [ ] No `ItemModal`, o cabeçalho permanece fixo ao rolar issues extensas e os botões de copiar dão feedback visual imediato.
- [ ] `RichField`, `Comments` e `CreateModal` compartilham `MarkdownEditor` com toolbar, aba `Preview`, continuação automática de checklists (`- [ ]`) no `Enter` e salvamento com `Ctrl+Enter` / `Cmd+Enter`.
- [ ] Caixa de novo comentário mostra o `Avatar` do usuário configurado em `AZDO_ME`.
- [ ] Atalhos `/`, `c`, `m`, `[`, `?` e `Ctrl+K` funcionam sem interferir na digitação em campos de formulário.
