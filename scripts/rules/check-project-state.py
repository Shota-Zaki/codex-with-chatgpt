#!/usr/bin/env python3
"""Validate canonical project state, then optionally a Git Work Unit change gate."""
from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path
sys.dont_write_bytecode = True
from rules_common import (CheckError, changed_paths, check_snapshot_local, digest, document,
                          git, inside, manifest, matches, object_keys, parse_json, relative,
                          require, sha, strings, text, timestamp)

TASKS = 'docs/project/TASKS.md'
NEXT = 'docs/project/NEXT_WORK.md'
STATE = 'docs/project/AI_WORK_STATE.md'
BRIEF = 'docs/project/PROJECT_BRIEF.md'
REQ = 'docs/design/REQUIREMENTS.md'
BASIC = 'docs/design/BASIC_DESIGN.md'
DETAIL = 'docs/design/DETAILED_DESIGN.md'
STATES = {'Backlog', 'Ready', 'In Progress', 'Review', 'Blocked', 'Deferred', 'Done'}
ACTIVE = {'Ready', 'In Progress', 'Review', 'Done'}


def check_evidence(root: Path, path: str, fresh: bool) -> dict:
    require(path.startswith('docs/evidence/'), 'Evidence must be in docs/evidence')
    data = document(root, path)
    fields = {'schema_version', 'id', 'recorded_at', 'environment', 'target', 'checks'}
    object_keys(data, fields, fields, path)
    text(data['id'], 'Evidence ID'); text(data['environment'], 'environment')
    timestamp(data['recorded_at'], 'recorded_at')
    target = object_keys(data['target'], {'kind', 'files'}, {'kind', 'files'}, 'target')
    require(target['kind'] == 'files-sha256', 'unsupported Evidence target')
    require(isinstance(target['files'], dict) and target['files'], 'Evidence needs target files')
    for name, hash_value in target['files'].items():
        require(name not in {TASKS, NEXT, STATE, path}, 'Evidence cannot hash itself or mutable state')
        sha(hash_value, 64, 'Evidence target hash')
        file = inside(root, name)
        if fresh:
            require(digest(file) == hash_value, f'stale Evidence: {name}')
    require(isinstance(data['checks'], list) and data['checks'], 'Evidence checks required')
    checks = {}
    for check in data['checks']:
        object_keys(check, {'id', 'status', 'method', 'summary'}, {'id', 'status', 'method', 'summary'}, 'Evidence check')
        key = text(check['id'], 'Verification ID')
        require(key not in checks, f'duplicate Evidence check: {key}')
        require(isinstance(check['status'], str) and check['status'] in {'pass', 'fail', 'not-run', 'not-required', 'blocked', 'deferred'}, 'invalid Verification status')
        text(check['method'], 'method'); text(check['summary'], 'summary')
        checks[key] = check
    return {'checks': checks, 'files': target['files']}


def check_tasks(root: Path) -> dict[str, dict]:
    data = document(root, TASKS)
    object_keys(data, {'schema_version', 'tasks'}, {'schema_version', 'tasks'}, TASKS)
    require(isinstance(data['tasks'], list), 'tasks must be list')
    tasks = {}
    fields = {'id', 'purpose', 'status', 'priority', 'scope', 'dependencies', 'references', 'acceptance', 'verification', 'evidence', 'blocker', 'reason'}
    for task in data['tasks']:
        object_keys(task, fields, {'id', 'purpose', 'status'}, 'Task')
        key = text(task['id'], 'Task ID')
        require(re.fullmatch(r'[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+', key), f'invalid Task ID: {key}')
        require(key not in tasks, f'duplicate Task ID: {key}')
        text(task['purpose'], 'purpose')
        require(isinstance(task['status'], str) and task['status'] in STATES, f'invalid Task status: {key}')
        if 'reason' in task:
            text(task['reason'], 'reason')
        if task['status'] in {'Blocked', 'Deferred'}:
            blocker = task.get('blocker')
            object_keys(blocker, {'cause', 'impact', 'resume_condition'}, {'cause', 'impact', 'resume_condition'}, f'{key} blocker')
            for value in blocker.values():
                text(value, 'blocker detail')
        if task['status'] in ACTIVE:
            object_keys(task, fields, {'priority', 'scope', 'dependencies', 'references', 'acceptance', 'verification', 'evidence'}, key)
        if 'priority' in task:
            require(isinstance(task['priority'], str) and re.fullmatch(r'P\d+', task['priority']), 'priority must be P<number>')
        for name in ('scope', 'dependencies', 'references', 'evidence'):
            if name in task:
                strings(task[name], key + ' ' + name, name in {'scope', 'references'})
        for pattern in task.get('scope', []):
            relative(pattern, glob=True)
        for reference in task.get('references', []):
            require(inside(root, reference).is_file(), f'broken Task reference: {reference}')
        acceptance = task.get('acceptance', [])
        verification = task.get('verification', [])
        require(isinstance(acceptance, list) and isinstance(verification, list), 'acceptance/verification must be lists')
        if task['status'] in ACTIVE:
            require(acceptance and verification, f'{key}: acceptance and verification required')
        criteria = set()
        for item in acceptance:
            object_keys(item, {'id', 'condition'}, {'id', 'condition'}, 'acceptance')
            aid = text(item['id'], 'Acceptance ID')
            require(aid not in criteria, f'duplicate Acceptance ID: {aid}')
            text(item['condition'], 'condition'); criteria.add(aid)
        vids, covered = set(), set()
        for check in verification:
            required = {'id', 'required', 'method', 'acceptance', 'targets'}
            object_keys(check, required | {'not_required_reason'}, required, 'Verification plan')
            vid = text(check['id'], 'Verification ID')
            require(vid not in vids, f'duplicate Verification ID: {vid}'); vids.add(vid)
            require(type(check['required']) is bool, 'required must be a boolean')
            text(check['method'], 'Verification method')
            strings(check['acceptance'], 'Verification acceptance', True)
            strings(check['targets'], 'Verification targets', True)
            require(set(check['acceptance']) <= criteria, 'Verification refers to missing acceptance')
            for target in check['targets']:
                require(inside(root, target).is_file(), f'missing Verification target: {target}')
            if check['required']:
                covered.update(check['acceptance'])
            else:
                text(check.get('not_required_reason'), 'not_required_reason')
        require(criteria <= covered, f'{key}: acceptance not covered by Required Verification')
        results = {}
        for path in task.get('evidence', []):
            evidence = check_evidence(root, path, task['status'] == 'Done')
            for vid, result in evidence['checks'].items():
                if vid not in vids:
                    continue  # A single run may provide Evidence for several Tasks.
                require(vid not in results, f'ambiguous current Evidence for {vid}')
                results[vid] = (result, evidence['files'])
        if task['status'] == 'Done':
            for check in verification:
                if not check['required']:
                    continue
                vid = check['id']
                require(vid in results and results[vid][0]['status'] == 'pass', f'{key}: Required Verification not pass: {vid}')
                require(set(check['targets']) <= set(results[vid][1]), f'{key}: Evidence target does not cover {vid}')
        tasks[key] = task
    all_vids = {v['id'] for task in tasks.values() for v in task.get('verification', [])}
    for evidence_path in {p for task in tasks.values() for p in task.get('evidence', [])}:
        checks = check_evidence(root, evidence_path, False)['checks']
        require(set(checks) <= all_vids, f'Evidence refers to unknown Verification: {sorted(set(checks) - all_vids)}')
    for key, task in tasks.items():
        for dep in task.get('dependencies', []):
            require(dep in tasks and dep != key, f'{key}: missing/self dependency {dep}')
            if task['status'] in ACTIVE:
                require(tasks[dep]['status'] == 'Done', f'{key}: dependency not Done: {dep}')
    visiting, visited = set(), set()
    def visit(key: str) -> None:
        require(key not in visiting, f'cyclic Task dependency: {key}')
        if key in visited:
            return
        visiting.add(key)
        for dep in tasks[key].get('dependencies', []):
            visit(dep)
        visiting.remove(key); visited.add(key)
    for key in tasks:
        visit(key)
    return tasks


def check_state(root: Path, profile: str = 'project') -> dict[str, dict]:
    data = manifest(root)
    if profile == 'project':
        check_snapshot_local(root, data)
    else:
        require(profile == 'rules-source', 'unknown profile')
    canonical = {Path(p).name: p for p in (TASKS, NEXT, STATE, BRIEF, REQ, BASIC, DETAIL)}
    for name in ('AGENTS.md', *canonical.values()):
        require(inside(root, name).is_file(), f'missing canonical file: {name}')
    candidates = list(root.glob('*.md')) + list((root / 'docs').rglob('*.md'))
    for file in candidates:
        name = str(file.relative_to(root))
        if name.startswith('docs/evidence/'):
            continue  # Historical migration evidence is not a live state owner.
        if file.name in canonical:
            require(name == canonical[file.name], f'duplicate canonical location: {name}')
    tasks = check_tasks(root)
    data = document(root, NEXT)
    object_keys(data, {'schema_version', 'work_unit', 'reason'}, {'schema_version', 'work_unit'}, NEXT)
    ready = {key for key, task in tasks.items() if task['status'] in {'Ready', 'In Progress'}}
    unit = data['work_unit']
    if unit is None:
        text(data.get('reason'), 'NEXT_WORK reason')
        require(not ready, 'NEXT_WORK is empty despite executable Tasks')
    else:
        fields = {'task_id', 'work_unit_id', 'goal', 'scope', 'steps', 'exit_condition', 'verification_ids'}
        object_keys(unit, fields, fields, 'next Work Unit')
        key = text(unit['task_id'], 'next Task ID')
        require(key in ready, 'next Task must exist and be Ready/In Progress')
        for field in ('work_unit_id', 'goal', 'exit_condition'):
            text(unit[field], field)
        for field in ('scope', 'steps', 'verification_ids'):
            strings(unit[field], field, True)
        for path in unit['scope']:
            relative(path, glob=True)
            require(matches(path, tasks[key]['scope']), 'next Work Unit scope exceeds Task scope')
        require(set(unit['verification_ids']) <= {v['id'] for v in tasks[key]['verification']}, 'next Work Unit has unknown Verification ID')
    data = document(root, STATE)
    fields = {'schema_version', 'branch', 'base_commit', 'checkpoint_id', 'pending_changes', 'resume_notes'}
    object_keys(data, fields, fields, STATE)
    require(data['branch'] == 'work', 'AI state must identify work branch')
    if data['base_commit'] is not None:
        sha(data['base_commit'], 40, 'observed base commit')
    text(data['checkpoint_id'], 'checkpoint_id')
    strings(data['pending_changes'], 'pending_changes')
    strings(data['resume_notes'], 'resume_notes')
    return tasks


def check_gate(root: Path, tasks: dict, base: str, command: str, unit_path: str | None) -> None:
    data = manifest(root)
    changes = changed_paths(root, base)
    base_paths = git(root, 'ls-tree', '-r', '--name-only', base).splitlines()
    policy = data
    if 'docs/rules/manifest.json' in base_paths:
        policy = parse_json(git(root, 'show', base + ':docs/rules/manifest.json'), 'baseline manifest')
        require(isinstance(policy, dict) and isinstance(policy.get('commands'), dict), 'invalid baseline command contract')
    else:
        require(command in {'dev', 'maintenance'}, 'missing baseline manifest requires explicit bootstrap/migration')
    require(command in policy['commands'], f'unknown command: {command}')
    strings(policy['commands'][command], 'baseline command scope')
    for path in changes:
        require(matches(path, policy['commands'][command]), f'command {command} cannot write: {path}')
    if not changes:
        return
    require(command != 'release', 'release requires separate explicit authorization and publication gate')
    require(git(root, 'branch', '--show-current').strip() == 'work', 'write gate requires work branch')
    if command == 'sync-rules':
        check_snapshot_local(root, data)
        return  # RULES_SOURCE is the sync record; do not write Project Task/Evidence.
    require(unit_path is not None, 'write gate requires Work Unit record')
    unit = document(root, unit_path)
    fields = {'schema_version', 'id', 'task_ids', 'base_commit', 'command', 'changes', 'documents', 'notes'}
    object_keys(unit, fields, fields, 'Work Unit record')
    text(unit['id'], 'Work Unit ID')
    require(unit['base_commit'] == base and unit['command'] == command, 'Work Unit base/command mismatch')
    strings(unit['task_ids'], 'Work Unit Tasks', True)
    require(set(unit['task_ids']) <= set(tasks), 'Work Unit refers to missing Task')
    strings(unit['notes'], 'Work Unit notes')
    allowed = [pattern for key in unit['task_ids'] for pattern in tasks[key].get('scope', [])]
    for path in changes:
        require(matches(path, allowed), f'path outside Task scope: {path}')
    require(isinstance(unit['changes'], list) and unit['changes'], 'change classification required')
    kinds, patterns = set(), []
    valid_kinds = {'implementation', 'requirements', 'architecture', 'contracts', 'rules', 'tasks', 'resume', 'verification', 'publication'}
    for entry in unit['changes']:
        object_keys(entry, {'kind', 'paths'}, {'kind', 'paths'}, 'change classification')
        require(isinstance(entry['kind'], str) and entry['kind'] in valid_kinds, 'unknown change kind')
        strings(entry['paths'], 'change paths', True)
        for path in entry['paths']:
            relative(path, glob=True)
        require(any(matches(path, entry['paths']) for path in changes), 'change classification matches no change')
        patterns.extend(entry['paths']); kinds.add(entry['kind'])
    for path in changes:
        require(matches(path, patterns), f'unclassified change: {path}')
    require('publication' not in kinds, 'publication not allowed in ordinary Work Unit')
    require(isinstance(unit['documents'], list), 'documents must be a list')
    decisions = {}
    for decision in unit['documents']:
        object_keys(decision, {'path', 'decision', 'reason'}, {'path', 'decision', 'reason'}, 'document impact')
        path = relative(decision['path'])
        require(path not in decisions, f'duplicate impact decision: {path}')
        require(inside(root, path).is_file(), f'impact document missing: {path}')
        text(decision['reason'], 'impact reason')
        require(decision['decision'] in ('update', 'unchanged'), 'invalid impact decision')
        require((path in changes) == (decision['decision'] == 'update'), f'impact decision differs from actual diff: {path}')
        decisions[path] = decision['decision']
    required_updates = set()
    for kind, path in [('requirements', REQ), ('architecture', BASIC), ('contracts', DETAIL), ('tasks', TASKS)]:
        if kind in kinds:
            required_updates.add(path)
    for path in required_updates:
        require(decisions.get(path) == 'update', f'required canonical update missing: {path}')
    if 'implementation' in kinds:
        for path in (REQ, BASIC, DETAIL, TASKS):
            require(path in decisions, f'implementation impact not assessed: {path}')
    # Compare prior persisted contracts; justification is required for weakening.
    old_raw = git(root, 'show', base + ':' + TASKS) if TASKS in base_paths else ''
    blocks = re.findall(r'^```json[ \t]*\r?\n(.*?)^```[ \t]*$', old_raw, re.M | re.S)
    if blocks:
        old_data = parse_json(blocks[0], 'prior TASKS')
        require(isinstance(old_data, dict) and isinstance(old_data.get('tasks'), list), 'invalid baseline TASKS contract')
        for old_task in old_data['tasks']:
            require(isinstance(old_task, dict) and isinstance(old_task.get('id'), str), 'invalid baseline Task')
        old_tasks = {t['id']: t for t in old_data['tasks']}
        for key in unit['task_ids']:
            old, new = old_tasks.get(key), tasks[key]
            if not old:
                continue
            if old.get('status') == 'Done' and new['status'] != 'Done':
                text(new.get('reason'), 'reopen reason')
            old_required = {v['id'] for v in old.get('verification', []) if v.get('required') is True}
            new_required = {v['id'] for v in new.get('verification', []) if v.get('required') is True}
            new_plan = {v['id']: v for v in new.get('verification', [])}
            changed_required = any(new_plan.get(v['id']) != v for v in old.get('verification', []) if v.get('required') is True)
            if not old_required <= new_required or changed_required or old.get('acceptance') != new.get('acceptance') or old.get('scope') != new.get('scope'):
                require(bool(unit['notes']), 'changing acceptance/Required Verification needs specification or alternative rationale')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--profile', choices=('project', 'rules-source'), default='project')
    parser.add_argument('--base')
    parser.add_argument('--command')
    parser.add_argument('--unit')
    args = parser.parse_args()
    try:
        root = args.root.resolve()
        require(bool(args.base) == bool(args.command), '--base and --command must be supplied together')
        require(args.unit is None or args.base is not None, '--unit requires --base and --command')
        tasks = check_state(root, args.profile)
        if args.base:
            check_gate(root, tasks, args.base, args.command, args.unit)
        done = sum(task['status'] == 'Done' for task in tasks.values())
        print(f'PASS: {"change gate" if args.base else "state check only"}; Done {done}/{len(tasks)}')
        return 0
    except (CheckError, OSError, UnicodeError, RecursionError) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
