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

const simplifiedPhrases = [
  '后续对话',
  '当前项目',
  '安全连接已',
  '配对码',
  '配置方式',
  '开发人员模式',
  '尚未记录',
  '临时地址',
  '无法检查更新',
  '新版本',
  '用户可运行',
  '完成后再试',
  '新的接続先',
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
