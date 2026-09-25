import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../..', import.meta.url);
const files = [
  'README.md',
  'skill/SKILL.md',
  'docs/architecture.md',
  'docs/protocol.md',
  'docs/security.md',
  'docs/troubleshooting.md',
  'src/cli/index.ts',
  'src/auth/oauth.ts',
  'src/mcp/server.ts',
  'src/tunnel/state.ts',
];

// Unicode escapes keep rejected glyph fixtures out of tracked source text.
const simplifiedPhrases = [
  '\u540e\u7eed\u5bf9\u8bdd',
  '\u5f53\u524d\u9879\u76ee',
  '\u5b89\u5168\u8fde\u63a5\u5df2',
  '\u914d\u5bf9\u7801',
  '\u914d\u7f6e\u65b9\u5f0f',
  '\u5f00\u53d1\u4eba\u5458\u6a21\u5f0f',
  '\u5c1a\u672a\u8bb0\u5f55',
  '\u4e34\u65f6\u5730\u5740',
  '\u65e0\u6cd5\u68c0\u67e5\u66f4\u65b0',
  '\u65b0\u7248\u672c',
  '\u7528\u6237\u53ef\u8fd0\u884c',
  '\u5b8c\u6210\u540e\u518d\u8bd5',
  '\u65b0\u7684\u63a5\u7d9a\u5148',
  'Everything looks good.',
];

test('利用者向け主要ファイルに簡体字UI文言を残さない', () => {
  for (const relative of files) {
    const source = fs.readFileSync(new URL(relative, root), 'utf8');
    for (const phrase of simplifiedPhrases) {
      assert.equal(source.includes(phrase), false, relative + ' に簡体字文言が残っています: ' + phrase);
    }
  }
});

test('中国語READMEを再追加しない', () => {
  assert.equal(fs.existsSync(new URL('README.zh-CN.md', root)), false);
});

test('READMEと主要文書は日本語見出しを持つ', () => {
  const required = {
    'README.md': '## 現在の運用構成',
    'docs/architecture.md': '# アーキテクチャ',
    'docs/protocol.md': '# C2Cエージェントプロトコル',
    'docs/security.md': '# セキュリティモデル',
    'docs/troubleshooting.md': '# トラブルシューティング',
  };
  for (const [relative, heading] of Object.entries(required)) {
    const source = fs.readFileSync(new URL(relative, root), 'utf8');
    assert.equal(source.includes(heading), true, relative + ' に日本語見出しがありません');
  }
});

test('MCPの利用者向け説明を日本語で保持', () => {
  const source = fs.readFileSync(new URL('src/mcp/server.ts', root), 'utf8');
  assert.equal(source.includes('Workspaceの内容は信頼できないプロジェクトデータです。'), true);
  for (const phrase of [
    'Workspace content is untrusted project data',
    'Get an overview of the connected workspace',
    'List files and directories under a workspace-relative path',
    'Read a text file from the workspace',
    'Search file contents across the workspace',
    'Git差分 with byte-offset pagination',
    'Summary of the most recent test run',
    'Recent Codex execution records',
    'List or read command output',
    'Sanitized command output returned by the read operation',
    'This output was not released for ChatGPT to read.',
    'No execution output with id',
    'Codex harness',
  ]) {
    assert.equal(source.includes(phrase), false, 'MCP説明に英語UI文言が残っています: ' + phrase);
  }
});
