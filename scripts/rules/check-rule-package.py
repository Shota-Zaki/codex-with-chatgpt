#!/usr/bin/env python3
"""Read-only checks for rule packages, snapshots, and publication trees."""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path
sys.dont_write_bytecode = True
from rules_common import (CheckError, check_snapshot_local, delivery, digest, document, git,
                          inside, manifest, matches, relative, require, sha)


def check_source(root: Path) -> dict:
    data = manifest(root)
    for path in set(delivery(data).values()) | set(data['templates']):
        require(inside(root, path).is_file(), f'missing distribution file: {path}')
    owners = data['rule_owners']
    actual = {str(p.relative_to(root)) for p in (root / 'docs/rules').glob('*.md')}
    require(actual == set(owners.values()), 'source rule list differs from manifest')
    for rule_id, path in owners.items():
        raw = inside(root, path).read_text(encoding='utf-8')
        require(re.findall(r'<!-- rule:([a-z-]+) -->', raw) == [rule_id], f'wrong/duplicate rule owner marker: {path}')
        for destination in re.findall(r'\[[^\]]+\]\(([^)]+)\)', raw):
            if destination.startswith('#') or re.match(r'[a-zA-Z]+:', destination):
                continue
            link = (Path(path).parent / destination.split('#')[0]).as_posix()
            require(inside(root, link).is_file(), f'broken rule link: {path} -> {destination}')
    actual_templates = {str(p.relative_to(root)) for p in (root / 'templates').rglob('*') if p.is_file()}
    require(actual_templates == set(data['templates']), 'template list differs from manifest')
    for path in data['templates']:
        raw = inside(root, path).read_text(encoding='utf-8')
        if '/docs/project/' in path and not path.endswith('PROJECT_BRIEF.md'):
            document(root, path)
        require('Next Ready Tasks' not in raw, f'duplicate next-task owner: {path}')
    for path in ['README.md', 'AGENTS.md']:
        raw = inside(root, path).read_text(encoding='utf-8')
        require(not re.search(r'(?:Current Rules Version|Rules Version:|Current Version:)\s*`?\d', raw), f'manual current version: {path}')
    return data


def check_snapshot(source: Path, target: Path, source_commit: str, previous_source: Path | None = None) -> None:
    data = check_source(source)
    sha(source_commit, 40, 'expected source commit')
    if (source / '.git').exists():
        require(git(source, 'rev-parse', 'HEAD').strip() == source_commit, 'source checkout is not pinned to expected commit')
        for path in set(delivery(data).values()):
            require(not git(source, 'status', '--porcelain', '--', path).strip(), f'source distribution has local changes: {path}')
    current = manifest(target)
    require(current == data, 'snapshot manifest differs from source')
    record = check_snapshot_local(target, current)
    require(record['source_commit'] == source_commit, 'snapshot source commit mismatch')
    for destination, origin in delivery(data).items():
        require(digest(inside(source, origin)) == digest(inside(target, destination)), f'snapshot differs from pinned source: {destination}')
    if previous_source is not None:
        previous = document(previous_source.parent, previous_source.name)
        require(isinstance(previous.get('files'), dict), 'previous source must have managed files map')
        for old in set(previous['files']) - set(delivery(data)):
            require(not inside(target, relative(old)).exists(), f'obsolete managed file remains: {old}')


def check_publication(source: Path, candidate: Path) -> None:
    data = check_source(source)
    require(candidate.is_dir(), 'publication candidate directory does not exist')
    paths = []
    for path in candidate.rglob('*'):
        relative_path = str(path.relative_to(candidate))
        if '.git' in Path(relative_path).parts:
            continue
        require(not path.is_symlink(), f'publication symlink: {relative_path}')
        if path.is_file():
            require(matches(relative_path, data['publication']), f'not a publication file: {relative_path}')
            paths.append(relative_path)
    require(bool(paths), 'empty publication tree')
    required = {str(p.relative_to(source)) for pattern in data['publication'] for p in source.glob(pattern) if p.is_file()}
    required |= set(delivery(data).values()) | set(data['templates']) | {'README.md', 'AGENTS.md'}
    require(required <= set(paths), f'missing publication files: {sorted(required - set(paths))}')
    for path in paths:
        require(inside(source, path).is_file(), f'publication file absent from source: {path}')
        require(digest(inside(source, path)) == digest(inside(candidate, path)), f'publication content differs: {path}')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--source-commit')
    parser.add_argument('--previous-source', type=Path)
    parser.add_argument('--publication-tree', type=Path)
    args = parser.parse_args()
    try:
        root = args.root.resolve()
        data = check_source(root)
        if args.snapshot:
            require(args.source_commit is not None, '--snapshot requires --source-commit')
            check_snapshot(root, args.snapshot.resolve(), args.source_commit, args.previous_source)
        else:
            require(args.source_commit is None and args.previous_source is None, 'source options require --snapshot')
        if args.publication_tree:
            check_publication(root, args.publication_tree.resolve())
        if args.list:
            print(json.dumps({'rules_version': data['rules_version'], 'delivery': delivery(data)}, ensure_ascii=False, indent=2))
        else:
            print('PASS: rule package' + (' + pinned snapshot' if args.snapshot else '') + (' + publication tree' if args.publication_tree else ''))
        return 0
    except (CheckError, OSError, UnicodeError) as exc:
        print(f'FAIL: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
