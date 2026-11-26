// Descoberta de skills locais (SKILL.md) e adaptação de instruções para múltiplos CLIs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CACHE_TTL_MS = 15_000;

export function parseSkillFrontmatter(markdown) {
  const text = String(markdown || '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text.trim() };

  const meta = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const idx = rawLine.indexOf(':');
    if (idx <= 0) continue;
    const key = rawLine.slice(0, idx).trim();
    let val = rawLine.slice(idx + 1).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    if (key && val && val !== '>-' && val !== '|') meta[key] = val;
  }
  return { meta, body: match[2].trim() };
}

function defaultSkillDirs(repoRoot, homeDir = os.homedir()) {
  return [
    { dir: path.join(repoRoot, '.agents', 'skills'), source: 'workspace' },
    { dir: path.join(homeDir, '.claude', 'skills'), source: 'claude' },
    { dir: path.join(homeDir, '.codex', 'skills'), source: 'codex' },
    { dir: path.join(homeDir, '.kiro', 'skills'), source: 'kiro' },
  ];
}

export function createSkillsRegistry({ repoRoot, homeDir = os.homedir(), dirs } = {}) {
  const searchDirs = dirs || defaultSkillDirs(repoRoot, homeDir);
  let cache = { at: 0, list: [], byName: new Map() };

  function scan() {
    const byName = new Map();
    for (const { dir, source } of searchDirs) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        let skillFile = null;
        let fallbackName = entry.name;

        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            const candidate = path.join(fullPath, 'SKILL.md');
            if (fs.existsSync(candidate)) skillFile = candidate;
          } else if (stat.isFile() && entry.name.endsWith('.md')) {
            skillFile = fullPath;
            fallbackName = entry.name.replace(/\.md$/i, '');
          }
        } catch {
          continue;
        }
        if (!skillFile) continue;

        let raw;
        try {
          raw = fs.readFileSync(skillFile, 'utf8');
        } catch {
          continue;
        }
        const { meta, body } = parseSkillFrontmatter(raw);
        const name = (meta.name || fallbackName).trim();
        if (!name || byName.has(name)) continue;

        const firstParagraph = body
          .split(/\r?\n\r?\n/)
          .map((p) => p.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim())
          .find((p) => p.length > 10);

        const description = (meta.description || firstParagraph || '').slice(0, 280);
        const category = /^azdevops[-_]/i.test(name) ? 'azdevops' : 'general';

        byName.set(name, {
          name,
          description,
          category,
          source,
          filePath: skillFile,
        });
      }
    }

    const list = [...byName.values()].sort((a, b) => {
      if (a.category !== b.category) return a.category === 'azdevops' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    cache = { at: Date.now(), list, byName };
    return cache;
  }

  function ensureFresh(force = false) {
    if (force || Date.now() - cache.at > CACHE_TTL_MS) return scan();
    return cache;
  }

  function listSkills({ force = false } = {}) {
    return ensureFresh(force).list.map(({ name, description, category, source }) => ({
      name,
      description,
      category,
      source,
    }));
  }

  function getSkill(name) {
    const clean = String(name || '').replace(/^\//, '').trim();
    if (!clean) return null;
    const hit = ensureFresh().byName.get(clean);
    if (!hit) return null;
    try {
      const content = fs.readFileSync(hit.filePath, 'utf8');
      return { ...hit, content };
    } catch {
      return null;
    }
  }

  // Extrai `/skill-name args...` caso o prompt comece com um comando de skill conhecido.
  function parseSlashSkill(prompt) {
    const m = String(prompt || '').trim().match(/^\/([a-zA-Z0-9._-]+)(?:\s+([\s\S]*))?$/);
    if (!m) return null;
    const skill = getSkill(m[1]);
    if (!skill) return null;
    return {
      skill,
      args: (m[2] || '').trim(),
    };
  }

  return {
    listSkills,
    getSkill,
    parseSlashSkill,
  };
}
