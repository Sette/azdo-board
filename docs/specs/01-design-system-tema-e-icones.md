# Spec 01 — Design System, Tema (Dark Mode), Ícones SVG e Seletores

## 1. Contexto e problemas atuais

1. **Cores hardcoded espalhadas nos componentes**:
   - Apesar de `web/src/index.css` definir tokens base no bloco `@theme` (`--color-brand`, `--color-surface`, `--color-ink`, etc.), estados semânticos usam hexadecimais diretos nos JSX:
     - Erro / Bloqueio: `#ffebe6`, `#ffd5d2`, `#fff1ef`, `#ae2e24`, `#e2483d`, `#de350b` (`ItemModal.jsx`, `Card.jsx`, `Board.jsx`, `SaveItem.jsx`, `App.jsx`).
     - Alerta / Aviso: `#fff7d6`, `#7f5f01` (`ItemModal.jsx`, `Backlog.jsx`, `SaveItem.jsx`).
     - Sucesso / Concluído: `#e3fcef`, `#006644`, `#1f845a`, `#22a06b` (`Backlog.jsx`, `ItemModal.jsx`, `StateLozenge.jsx`).
     - Backdrop de modais: `#091e427a` (`ItemModal.jsx`, `CreateModal.jsx`, `SaveItem.jsx`).
2. **Ausência de Dark Mode**:
   - Sem tokens semânticos para superfícies de status, sombras de card e backdrop, não é possível alternar para tema escuro.
3. **Ícones em caracteres Unicode / emojis**:
   - O app usa glifos de texto (`☰`, `▦`, `≡`, `⚑`, `✓`, `⌕`, `⟳`, `🔗`, `✕`, `▾`, `▸`), que variam de espessura, cor e alinhamento vertical entre Linux, macOS e Windows (ex.: `🔗` colorido no cabeçalho do `ItemModal`, `⌕` desalinhado em `FilterBar`).
4. **Mistura entre `<select>` nativo e `Dropdown.jsx`**:
   - `ItemModal.jsx` usa `Dropdown.jsx`, mas `Board.jsx` (Sprint e Group), `Issues.jsx` (Status e Assignee), `CreateModal.jsx` (Assignee, Sprint, Parent e campos do processo) e `SaveItem.jsx` usam `<select>` nativo do sistema operacional — sem busca, sem avatares e com aparência inconsistente.

---

## 2. Escopo da especificação

### 2.1. Tokens semânticos completos (`web/src/index.css`)

Expandir `@theme` (e variáveis CSS em `:root` / `[data-theme="dark"]`) cobrindo:

| Token | Uso | Light (referência) | Dark (referência) |
|---|---|---|---|
| `--color-surface` | Fundo principal e cards | `#ffffff` | `#1d2125` |
| `--color-surface-overlay` | Popovers, modais e menus | `#ffffff` | `#282e33` |
| `--color-sunken` | Sidebar, inputs, hover sutil | `#f7f8f9` | `#161a1d` |
| `--color-column` | Colunas Kanban, pílulas neutras | `#f1f2f4` | `#22272b` |
| `--color-hover` | Hover em botões/linhas | `#ebecf0` | `#2c333a` |
| `--color-line` | Bordas e divisores | `#dcdfe4` | `#38414a` |
| `--color-ink` | Texto primário | `#172b4d` | `#dee4ea` |
| `--color-ink-subtle` | Texto secundário / labels | `#44546f` | `#9fadbc` |
| `--color-ink-muted` | Metadados / placeholders | `#626f86` | `#8c9bab` |
| `--color-brand` | Ações primárias e links | `#0052cc` | `#579dff` |
| `--color-brand-hover` | Hover primário | `#0065ff` | `#85b8ff` |
| `--color-brand-subtle` | Fundo selecionado / ativo | `#deebff` | `#1c2b41` |
| `--color-danger-bg` / `--color-danger-ink` / `--color-danger-border` | Bloqueios, erros e alertas críticos | `#ffebe6` / `#ae2e24` / `#e2483d` | `#42221f` / `#fd9891` / `#f87168` |
| `--color-danger-column` | Fundo da coluna Blocked | `#fff1ef` | `#2e1a19` |
| `--color-warn-bg` / `--color-warn-ink` | Avisos de processo (`warnings`) | `#fff7d6` / `#7f5f01` | `#332e1b` / `#f5cd47` |
| `--color-success-bg` / `--color-success-ink` / `--color-success-solid` | Lozenge Done, barra de tasks, sprint ativa | `#dcfff1` / `#216e4e` / `#1f845a` | `#1c3329` / `#7ee2b8` / `#2abb7f` |
| `--color-backdrop` | Overlay de modais | `#091e427a` | `#030404ad` |
| `--shadow-card` | Sombra de repouso do `Card` | `0 1px 1px #091e4240, 0 0 1px #091e424f` | `0 1px 1px #03040480, 0 0 1px #030404a0` |

- Substituir todos os hexadecimais hardcoded em `web/src/components/*.jsx` e `web/src/pages/*.jsx` pelas classes utilitárias geradas pelos tokens (`bg-danger-bg text-danger-ink`, `bg-warn-bg text-warn-ink`, `bg-success-bg text-success-ink`, `bg-backdrop`, etc.).
- Garantir contraste no botão primário em Dark Mode (`--color-brand-contrast`: branco no claro, `#1d2125` quando `--color-brand` for azul claro no escuro, ou manter `#0c66e4` com texto branco para AA >= 4.5:1).

### 2.2. Seletor de Tema (`ThemeSwitch`)

- Novo hook/provider leve `web/src/lib/theme.jsx` (ou integrado a `prefs` em `format.js`):
  - Opções: `light`, `dark`, `system` (padrão `system`, respeitando `prefers-color-scheme: dark` em tempo real via `matchMedia`).
  - Persistência em `localStorage` (`azdo-board:theme`) e aplicação imediata no `<html data-theme="...">` antes do primeiro *paint* (pequeno script inline em `web/index.html` para evitar *flash* claro ao recarregar).
- Botão compacto de alternância ao lado do `LangSwitch` na `TopBar` (`web/src/App.jsx`), com ícone Sol / Lua / Monitor e `aria-label` traduzido.

### 2.3. Componente de Ícones SVG (`web/src/components/Icon.jsx`)

- Criar `web/src/components/Icon.jsx` com conjunto enxuto (~16 ícones inline `16x16` / `20x20`, `stroke="currentColor"`, `strokeWidth="1.75"`):
  - Navegação: `board`, `backlog`, `issues`, `flag`, `check-circle`, `sidebar-collapse`, `external-link`.
  - Ações e controles: `plus`, `search`, `refresh` (com `animate-spin` quando `isFetching` for `true`!), `link`, `copy`, `check`, `close`, `chevron-down`, `chevron-right`, `grip-vertical`, `sun`, `moon`.
- Substituir os caracteres Unicode equivalentes em `App.jsx`, `Board.jsx`, `Backlog.jsx`, `FilterBar.jsx`, `ItemModal.jsx` e `FlagList.jsx`.

### 2.4. Evolução do `Dropdown.jsx` e fim dos `<select>` nativos

- Evoluir `web/src/components/Dropdown.jsx`:
  - Navegação completa por teclado: `ArrowDown`, `ArrowUp`, `Enter` para selecionar, `Escape` para fechar, `Home`/`End`.
  - Suporte a modo `multi` opcional (para filtro de `states` em `Issues.jsx`).
  - Posicionamento seguro próximo à borda inferior/direita da janela (ajuste automático ou `max-h-72`).
  - Variante visual de botão de formulário (`variant="input"`) para substituir `<select>` em modais e barras de controle.
- Substituir `<select>` nativos em:
  - `Board.jsx`: seletor de Sprint (destacando a sprint atual com badge `Active`) e seletor de `Group`.
  - `CreateModal.jsx`: `Assignee` (com `Avatar` e busca!), `Sprint`, `Parent` (com busca por `#id` ou título e `TypeIcon` — essencial quando há dezenas de PBIs!) e campos de opções do processo.
  - `Issues.jsx`: seletores de `Status` (multi-seleção clara com badges) e `Assignee` (com `Avatar` e busca).
  - `SaveItem.jsx`: campos `options` no `RequiredFieldsDialog` (hoje inclusive tem `"Selecione…"` fixo em português na linha 254 — corrigir para `t('select')`!).

---

## 3. Arquivos impactados

- `web/index.html` (script anti-FOUC de tema)
- `web/src/index.css` (tokens semânticos Light + Dark e foco acessível `:focus-visible`)
- `web/src/components/Icon.jsx` *(novo)*
- `web/src/lib/theme.jsx` *(novo)*
- `web/src/components/Dropdown.jsx`
- `web/src/components/StateLozenge.jsx`, `Card.jsx`, `ItemModal.jsx`, `CreateModal.jsx`, `SaveItem.jsx`, `FilterBar.jsx`, `Toast.jsx`
- `web/src/pages/Board.jsx`, `Backlog.jsx`, `Issues.jsx`, `FlagList.jsx`
- `web/src/App.jsx`, `web/src/lib/i18n.jsx`

## 4. Critérios de aceite

- [ ] Nenhum hexadecimal de status/superfície hardcoded restante nos componentes (exceto paleta determinística de avatares/ícones de tipo em `TypeIcon.jsx` e `format.js`).
- [ ] Alternância `Light` / `Dark` / `System` sem *flash* branco ao atualizar a página (`F5`).
- [ ] Ícones nítidos e alinhados em qualquer sistema operacional; botão de recarregar gira suavemente durante `isFetching`.
- [ ] Todos os seletores de pessoa exibem `Avatar` + filtro por nome; seletor de item pai (`Parent`) permite buscar por `#id` ou texto.
- [ ] Texto `"Selecione…"` hardcoded em `SaveItem.jsx` substituído por chave i18n (`t('select')`).
