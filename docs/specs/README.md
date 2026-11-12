# Plano de Melhorias Visuais e de UX — `azdo-board`

Este diretório reúne as especificações técnicas e visuais para evoluir a interface, ergonomia, acessibilidade e consistência visual do **azdo-board**, mantendo sua arquitetura enxuta (React 19 + Tailwind CSS 4 + `@tanstack/react-query` + `@dnd-kit`, sem dependências pesadas de UI).

## Princípios norteadores

1. **Zero peso desnecessário**: continuar usando CSS variables no `@theme` do Tailwind 4 (`web/src/index.css`) e componentes próprios enxutos em vez de bibliotecas externas de componentes.
2. **Bilinguismo obrigatório (`en` / `pt`)**: todo texto visível, `aria-label`, `title` ou dica de atalho deve entrar nos dicionários de `web/src/lib/i18n.jsx`.
3. **Regras de processo intactas**: nenhuma melhoria visual deve contornar `useSaveItem().save(...)`, `test /rev` ou configurações de `process.config.json`.
4. ** Foco em leitura rápida no dia a dia**: densidade de informação inspirada em Jira / Linear, com hierarquia clara de estado, bloqueio, validação, prioridade e responsável.
5. **Documentação viva**: ao concluir qualquer entrega que altere a interface visível, regenerar as imagens de demonstração com `npm run screenshots` (sempre a partir do modo demo).

---

## Mapa de especificações

| Ordem | Especificação | Foco principal | Esforço | Impacto |
|---|---|---|---|---|
| **01** | [01-design-system-tema-e-icones.md](./01-design-system-tema-e-icones.md) | Tokens semânticos de cor, Dark Mode (`light`/`dark`/`system`), ícones SVG uniformes e substituição de `<select>` nativos por `Dropdown` | Médio | Alto |
| **02** | [02-layout-navegacao-e-estados.md](./02-layout-navegacao-e-estados.md) | TopBar sem CTA duplicado, Sidebar retrátil + responsiva, contadores em `Blocked`/`Validation`, Skeletons sem *layout shift* e Empty States ricos | Baixo–Médio | Alto |
| **03** | [03-board-cards-e-backlog.md](./03-board-cards-e-backlog.md) | Cabeçalhos de coluna integrados, cards com prioridade/progresso/ações rápidas, raias com barra de conclusão, *drag handle* no Backlog e ordenação na `ItemsTable` | Médio | Alto |
| **04** | [04-modal-editor-e-atalhos.md](./04-modal-editor-e-atalhos.md) | Cabeçalho fixo no `ItemModal`, feedback ao copiar link/ID, barra de formatação + aba Preview no editor Markdown, navegação por teclado e atalhos globais (`/`, `c`, `[`, `?`, `Ctrl+K`) | Médio | Médio–Alto |

---

## Sequência recomendada de execução

```
Fase 1: Fundação Visual (Spec 01)
  └─ Tokens semânticos + Ícones SVG + Dark Mode + Dropdown unificado
        │
Fase 2: Estrutura & Feedback (Spec 02)
  └─ Shell / Sidebar retrátil + Badges + Skeletons + Empty States + Toast melhorado
        │
Fase 3: Fluxo Principal de Sprint (Spec 03)
  └─ Kanban Board, Cards, Swimlanes, Backlog e Tabelas ordenáveis
        │
Fase 4: Edição Rica & Produtividade (Spec 04)
  └─ ItemModal sticky, Toolbar/Preview Markdown e Atalhos / Command Palette
```

## Checklist de validação por entrega

- [ ] `npm test` passando nas versões Node 20, 22 e 24.
- [ ] `npm run build` sem erros.
- [ ] Conferência visual em **Inglês (`EN`)** e **Português (`PT`)**, nos temas **Claro** e **Escuro** (após Spec 01).
- [ ] Navegação básica por teclado (`Tab`, `Escape`, `Enter`, foco visível `:focus-visible`).
- [ ] `npm run screenshots` atualizado caso telas documentadas no `README.md` mudem.
