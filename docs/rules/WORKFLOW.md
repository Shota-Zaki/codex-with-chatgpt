# Workflow
<!-- rule:workflow -->

## 1. Work Unit開始

状態復元は [AI Execution Standard](AI_EXECUTION_STANDARD.md) に従う。読み取り専用操作には終了時の文書更新を適用しない。
Rules同期専用操作ではRULES_SOURCEを記録とし、ProjectのTask・Work Unit記録を書き換えない。
変更作業は対象Task、Work Unit、command、開始Commitとその時点のcommand Scopeを特定し、既存の未コミット変更を保全する。基準不明の既存差分を自分の変更として扱わない。共有workでは短い論理変更にし、並行変更を上書きしない。

## 2. 影響判定

各Work Unitで、実際に行う変更を `implementation / requirements / architecture / contracts / rules / tasks / resume / verification / publication` に分類する。
Work Unit記録は `docs/evidence/work-units/<ID>.md` の1か所だけ。対象Task ID、開始SHA、command、変更パスの集合、影響を受ける正本への `update` または `unchanged` 判断を残す。

[ファイル責務表](REPOSITORY_STANDARD.md) と変更種別に基づいて判断する。implementationでは要件・基本設計・詳細設計への影響を判定し、影響なしの場合だけ具体的理由を残す。requirements、architecture、contracts変更では対応する正本更新を必須とする。仕様を変えない修正に全設計更新を要求しない。
変化のない正本を日付だけで更新せず、全ファイルへ毎回「変更なし」と書かない。更新が不要な判断はWork Unit記録の該当箇所だけで完結する。

## 3. 実装・Verification

必要な設計が揃ってからScope内の実装を行う。必要十分なVerificationは [Verification Standard](VERIFICATION_STANDARD.md)。独立して進められる作業は継続する。

## 4. 終了Gate

1. 必要な正本を情報所有に従って更新する。
2. Evidenceを実際の対象版に結び付け、Taskの受入条件と照合する。
3. 次の1 Work Unitを確定する。実行可能TaskがなければNEXT_WORKをnullとし理由を残す。
4. 中断・checkpointに必要な差分だけAI_WORK_STATEへ記録する。
5. 状態checkに加え、開始SHAとの差分・Work Unit記録・commandを与えた変更gateを実行する。
6. 論理的に一体のcode・文書・Evidenceをまとめ、Gitへ反映する。

例（配布先）:

```sh
python scripts/rules/check-project-state.py --root . --base <開始SHA> --command continue --unit docs/evidence/work-units/<ID>.md
```

check成功は文書構造・参照整合の確認であり、意味的な設計レビュー・実行テストの代替ではない。必要な検証を実行できなければ、その項目を正確に残しDoneにしない。checkpointの保存は可能で、全体を停止する理由にはしない。

## 5. Git反映と並行変更

commit直前に変更範囲と既存差分を再確認する。検証後に対象ファイルが変わったら対象検証をやり直す。
API更新は開始Commitを親としたtree/commitを作り、branch tipを再読してから非forceで更新する。tipが変わった場合は最新変更へ再適用・再検証し、forceで上書きしない。部分同期する1ファイル1remote commitへ退避しない。
Git headの自己参照を文書に書かず、Evidenceは検証対象file digest、AI_WORK_STATEは観測時のbase commitで識別する。保存commitはGitから取得する。

## 6. 公開と次作業

main反映は明示された別の公開作業。許可対象だけのcandidate treeを検証し、不要物・削除・build/deploy成立性を確認する。通常Task完了に公開を含めない。
終了後は実行可能なIn Progress、現在のReady、依存を満たした高優先Readyの順で次を選ぶ。存在しない自動継続機能を前提にしない。
