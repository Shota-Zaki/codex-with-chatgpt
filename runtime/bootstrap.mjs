import { installPrivacyFetch } from './privacy.mjs';
installPrivacyFetch();

// 起動時の自動更新確認は行わない。更新は利用者のforkで別途レビューする。
if (process.argv[2] === 'update-check') {
  const note = 'プライバシー設定により自動更新確認を停止しています。更新状況は未確認です。';
  process.stdout.write(process.argv.includes('--json')
    ? JSON.stringify({ ok: true, checked: false, updateAvailable: false, disabled: true, note }) + '\n'
    : note + '\n');
  process.exit(0);
}
