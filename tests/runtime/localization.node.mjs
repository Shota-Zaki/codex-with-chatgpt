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
