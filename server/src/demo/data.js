// Fictional sample data for demo mode (AZDO_DEMO=1). Everything here is made up.

export const DEMO_ENV = {
  AZDO_ORG: 'contoso',
  AZDO_PROJECT: 'Fabrikam Web',
  AZDO_TEAM: 'Fabrikam Team',
  AZDO_ME: 'alex@example.com',
};

const P = {
  alex: 'Alex Morgan <alex@example.com>',
  priya: 'Priya Shah <priya@example.com>',
  diego: 'Diego Alvarez <diego@example.com>',
  mei: 'Mei Chen <mei@example.com>',
  sam: 'Sam Okafor <sam@example.com>',
  lena: 'Lena Fischer <lena@example.com>',
};
export const ME = P.alex;

export const STATES = {
  Epic: [
    ['New', 'Proposed', 'b2b2b2'],
    ['In Progress', 'InProgress', '007acc'],
    ['Done', 'Completed', '339933'],
    ['Removed', 'Removed', 'ffffff'],
  ],
  Feature: [
    ['New', 'Proposed', 'b2b2b2'],
    ['In Progress', 'InProgress', '007acc'],
    ['Done', 'Completed', '339933'],
    ['Removed', 'Removed', 'ffffff'],
  ],
  'Product Backlog Item': [
    ['New', 'Proposed', 'b2b2b2'],
    ['Approved', 'Proposed', '5688e0'],
    ['Committed', 'InProgress', '007acc'],
    ['In Review', 'InProgress', 'f2cb1d'],
    ['Done', 'Completed', '339933'],
    ['Removed', 'Removed', 'ffffff'],
  ],
  Bug: [
    ['New', 'Proposed', 'b2b2b2'],
    ['Approved', 'Proposed', '5688e0'],
    ['Committed', 'InProgress', '007acc'],
    ['In Review', 'InProgress', 'f2cb1d'],
    ['Done', 'Completed', '339933'],
    ['Removed', 'Removed', 'ffffff'],
  ],
  Task: [
    ['New', 'Proposed', 'b2b2b2'],
    ['In Progress', 'InProgress', '007acc'],
    ['Done', 'Completed', '339933'],
    ['Removed', 'Removed', 'ffffff'],
  ],
};

// Team sprint-board (taskboard) columns: Validation and Blocked are extra columns of "In Progress".
export const TASKBOARD = [
  { name: 'New', mappings: { Task: 'New' } },
  { name: 'In Progress', mappings: { Task: 'In Progress' } },
  { name: 'Validation', mappings: { Task: 'In Progress' } },
  { name: 'Blocked', mappings: { Task: 'In Progress' } },
  { name: 'Done', mappings: { Task: 'Done' } },
];

const day = 86_400_000;
const iso = (d) => new Date(d).toISOString();

export function createStore(now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() - 6 * day;
  const root = DEMO_ENV.AZDO_PROJECT;
  const sprints = [
    { id: 'sprint-11', name: 'Sprint 11', path: `${root}\\Sprint 11`, startDate: iso(start - 14 * day), finishDate: iso(start - day), timeFrame: 0 },
    { id: 'sprint-12', name: 'Sprint 12', path: `${root}\\Sprint 12`, startDate: iso(start), finishDate: iso(start + 13 * day), timeFrame: 1 },
    { id: 'sprint-13', name: 'Sprint 13', path: `${root}\\Sprint 13`, startDate: iso(start + 14 * day), finishDate: iso(start + 27 * day), timeFrame: 2 },
  ];
  const [s11, s12, s13] = sprints.map((s) => s.path);

  let ago = 0;
  const items = new Map();
  const add = (id, type, title, state, extra = {}) => {
    ago += 1;
    const changed = now.getTime() - ago * 47 * 60 * 1000;
    items.set(id, {
      id,
      rev: 3,
      formats: {},
      links: [],
      fields: {
        'System.Id': id,
        'System.WorkItemType': type,
        'System.Title': title,
        'System.State': state,
        'System.AreaPath': root,
        'System.IterationPath': root,
        'System.CreatedBy': extra.createdBy || P.alex,
        'System.CreatedDate': iso(changed - 9 * day),
        'System.ChangedBy': extra.assignee || P.alex,
        'System.ChangedDate': iso(changed),
        'Microsoft.VSTS.Common.Priority': 2,
        'Microsoft.VSTS.Common.BacklogPriority': id * 10,
        ...(extra.assignee ? { 'System.AssignedTo': extra.assignee } : {}),
        ...(extra.parent ? { 'System.Parent': extra.parent } : {}),
        ...(extra.sprint ? { 'System.IterationPath': extra.sprint } : {}),
        ...(extra.tags ? { 'System.Tags': extra.tags } : {}),
        ...(extra.effort ? { 'Microsoft.VSTS.Scheduling.Effort': extra.effort } : {}),
        ...(extra.done !== undefined ? { 'Microsoft.VSTS.Scheduling.CompletedWork': extra.done } : {}),
        ...(extra.left !== undefined ? { 'Microsoft.VSTS.Scheduling.RemainingWork': extra.left } : {}),
        ...(extra.activity ? { 'Microsoft.VSTS.Common.Activity': extra.activity } : {}),
        ...(extra.blocked ? { 'Microsoft.VSTS.CMMI.Blocked': 'Yes' } : {}),
      },
    });
    const it = items.get(id);
    if (extra.description) {
      it.fields['System.Description'] = extra.description;
      it.formats['System.Description'] = 'markdown';
    }
    if (extra.criteria) {
      it.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] = extra.criteria;
      it.formats['Microsoft.VSTS.Common.AcceptanceCriteria'] = 'markdown';
    }
    if (extra.links) it.links = extra.links;
  };

  add(100, 'Epic', 'Online store relaunch', 'In Progress', { assignee: P.priya });
  add(101, 'Feature', 'Checkout', 'In Progress', { parent: 100, assignee: P.alex, effort: 21 });
  add(102, 'Feature', 'Product search', 'In Progress', { parent: 100, assignee: P.diego, effort: 13 });
  add(103, 'Feature', 'Customer accounts', 'In Progress', { parent: 100, assignee: P.lena, effort: 13 });

  add(201, 'Product Backlog Item', 'Pay with a saved card at checkout', 'Committed', {
    parent: 101,
    assignee: P.alex,
    sprint: s12,
    effort: 8,
    tags: 'planned; payments',
    description:
      'Returning customers should be able to pay with a card they saved before, without typing the number again.\n\n' +
      '- Cards are **tokenized** by the payment provider; we never store the number.\n- Up to 5 saved cards per account.',
    criteria: '- [x] Saved cards are listed on the payment step\n- [ ] The default card is pre-selected\n- [ ] Removing a card asks for confirmation',
    links: [{ rel: 'Hyperlink', url: 'https://github.com/fabrikam/web/pull/412', attributes: { name: 'PR #412: saved cards' } }],
  });
  add(202, 'Product Backlog Item', 'Show the delivery estimate on the cart page', 'In Review', {
    parent: 101,
    assignee: P.priya,
    sprint: s12,
    effort: 5,
    tags: 'planned',
    description: 'Show "Arrives Tue–Thu" under each cart line, based on the carrier API and the shipping address.',
  });
  add(203, 'Product Backlog Item', 'Search suggestions while typing', 'Committed', {
    parent: 102,
    assignee: P.diego,
    sprint: s12,
    effort: 5,
    tags: 'planned; blocked',
    description: 'Suggest products and categories after 3 characters. **Blocked**: waiting for the search cluster upgrade.',
  });
  add(204, 'Bug', 'Coupon codes are case-sensitive', 'Done', { parent: 101, assignee: P.mei, sprint: s12, effort: 2, tags: 'unplanned' });
  add(205, 'Product Backlog Item', 'Filter search results by price', 'New', { parent: 102, assignee: P.sam, sprint: s12, effort: 3, tags: 'planned' });
  add(206, 'Product Backlog Item', 'Sign in with a magic link', 'Approved', { parent: 103, assignee: P.alex, sprint: s12, effort: 8, tags: 'unplanned' });
  add(207, 'Bug', 'Order history shows page 2 twice', 'Committed', { parent: 103, assignee: P.lena, sprint: s12, effort: 3, tags: 'unplanned' });
  add(208, 'Product Backlog Item', 'Export orders to CSV', 'Done', { parent: 103, assignee: P.alex, sprint: s12, effort: 3, tags: 'planned' });
  add(209, 'Product Backlog Item', 'Share a wishlist by link', 'New', { parent: 103, assignee: P.lena, sprint: s13, effort: 5 });
  add(210, 'Product Backlog Item', 'Gift cards', 'New', { parent: 101, effort: 13 });
  add(211, 'Bug', 'Product images are blurry on high-density screens', 'Approved', { parent: 102, assignee: P.mei, sprint: s13, effort: 2 });
  add(212, 'Product Backlog Item', 'Recently viewed products', 'Approved', { parent: 102, effort: 5 });
  add(213, 'Product Backlog Item', 'Guest checkout', 'Done', { parent: 101, assignee: P.priya, sprint: s11, effort: 8, tags: 'planned' });

  const task = (id, title, parent, state, extra) => add(id, 'Task', title, state, { parent, sprint: s12, ...extra });
  task(301, 'Tokenize cards with the payment provider', 201, 'In Progress', { assignee: P.alex, activity: 'Development', done: 6, left: 4 });
  task(302, 'Saved cards list on the payment step', 201, 'In Progress', { assignee: P.mei, activity: 'Development', done: 5, left: 1 });
  task(303, 'Contract tests for the payment API', 201, 'New', { assignee: P.alex, activity: 'Testing', left: 3 });
  task(304, 'Update the checkout runbook', 201, 'New', { activity: 'Documentation', left: 1 });
  task(305, 'Carrier API client', 202, 'Done', { assignee: P.priya, activity: 'Development', done: 5 });
  task(306, 'Delivery estimate component', 202, 'Done', { assignee: P.priya, activity: 'Development', done: 4 });
  task(307, 'Check the estimate on mobile', 202, 'In Progress', { assignee: P.sam, activity: 'Testing', done: 1, left: 1 });
  task(308, 'Suggestions endpoint', 203, 'In Progress', {
    assignee: P.diego,
    activity: 'Development',
    done: 3,
    left: 5,
    blocked: true,
    description: 'Needs the new analyzer from the search cluster upgrade (ops ticket OPS-118).',
  });
  task(309, 'Debounced search input', 203, 'Done', { assignee: P.mei, activity: 'Development', done: 2 });
  task(310, 'Index product synonyms', 203, 'New', { assignee: P.diego, activity: 'Development', left: 3 });
  task(311, 'Normalize coupon codes', 204, 'Done', { assignee: P.mei, activity: 'Development', done: 2 });
  task(312, 'Email token service', 206, 'In Progress', { assignee: P.alex, activity: 'Development', done: 2, left: 6 });
  task(313, 'Sign-in page copy', 206, 'New', { assignee: P.lena, activity: 'Design', left: 2 });
  task(314, 'Fix cursor pagination', 207, 'In Progress', { assignee: P.lena, activity: 'Development', done: 1.5, left: 1 });
  task(315, 'Regression test for paging', 207, 'New', { assignee: P.sam, activity: 'Testing', left: 1 });
  task(316, 'CSV export job', 208, 'Done', { assignee: P.alex, activity: 'Development', done: 3 });
  task(317, 'Price range facet', 205, 'New', { assignee: P.sam, activity: 'Development', left: 4 });

  const comments = new Map();
  let commentId = 1;
  const comment = (id, who, text, hoursAgo) =>
    (comments.get(id) || comments.set(id, []).get(id)).push({
      id: commentId++,
      text,
      format: 0,
      createdBy: who,
      createdDate: iso(now.getTime() - hoursAgo * 3600e3),
      modifiedDate: iso(now.getTime() - hoursAgo * 3600e3),
    });
  comment(201, P.mei, 'The provider sandbox now returns tokens for test cards. UI is ready for review.', 26);
  comment(201, P.alex, 'Great, I will pair with @Sam on the contract tests tomorrow.', 20);
  comment(203, P.diego, 'Still waiting on **OPS-118**; moved the endpoint task to Blocked.', 5);
  comment(308, P.diego, 'Blocked until the analyzer is deployed to staging.', 5);

  // Taskboard columns (otherwise the first column of the state).
  const columns = new Map([
    [302, 'Validation'],
    [307, 'Validation'],
    [308, 'Blocked'],
  ]);

  return { items, comments, sprints, columns, nextId: 400, nextCommentId: commentId };
}
