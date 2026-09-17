"""Read-only primitives shared by rules validators (Python 3.10+)."""
from __future__ import annotations
import fnmatch
import hashlib
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any


class CheckError(ValueError):
    """An actionable contract failure."""


def require(condition: Any, message: str) -> None:
    if not condition:
        raise CheckError(message)


def object_keys(value: Any, allowed: set[str], required: set[str], label: str) -> dict:
    require(isinstance(value, dict), f'{label}: expected object')
    require(not (set(value) - allowed), f'{label}: unknown fields {sorted(set(value) - allowed)}')
    require(required <= set(value), f'{label}: missing fields {sorted(required - set(value))}')
    return value


def text(value: Any, label: str) -> str:
    require(isinstance(value, str) and bool(value.strip()), f'{label}: expected nonempty string')
    return value


def strings(value: Any, label: str, nonempty: bool = False) -> list[str]:
    require(isinstance(value, list), f'{label}: expected list')
    for item in value:
        text(item, label)
    require(len(value) == len(set(value)), f'{label}: duplicate values')
    require(not nonempty or bool(value), f'{label}: empty list')
    return value


def relative(value: Any, *, glob: bool = False) -> str:
    name = text(value, 'path')
    require(not any(p in ('', '.', '..', '.git') for p in name.split('/')), f'unsafe path: {name}')
    require('\\' not in name and ':' not in name and not PurePosixPath(name).is_absolute(), f'unsafe path: {name}')
    require(not any(ord(c) < 32 for c in name), f'control character in path: {name!r}')
    require(glob or not any(c in name for c in '*?[]'), f'glob not allowed here: {name}')
    return name


def inside(root: Path, value: str) -> Path:
    name = relative(value)
    root = root.resolve()
    path = root / name
    current = root
    for part in name.split('/'):
        current = current / part
        require(not current.is_symlink(), f'symlink not allowed: {name}')
    require(path.resolve().is_relative_to(root), f'path escapes root: {name}')
    return path


def digest(path: Path) -> str:
    require(path.is_file(), f'missing file: {path}')
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for data in iter(lambda: stream.read(65536), b''):
            h.update(data)
    return h.hexdigest()


def unique_pairs(pairs: list[tuple[str, Any]]) -> dict:
    result = {}
    for key, value in pairs:
        require(key not in result, f'duplicate JSON key: {key}')
        result[key] = value
    return result


def parse_json(raw: str, label: str) -> Any:
    try:
        return json.loads(raw, object_pairs_hook=unique_pairs)
    except json.JSONDecodeError as exc:
        raise CheckError(f'{label}: invalid JSON: {exc.msg} at line {exc.lineno}') from exc


def document(root: Path, name: str) -> dict:
    path = inside(root, name)
    require(path.is_file(), f'missing canonical document: {name}')
    raw = path.read_text(encoding='utf-8')
    blocks = re.findall(r'^```json[ \t]*\r?\n(.*?)^```[ \t]*$', raw, re.M | re.S)
    require(len(blocks) == 1, f'{name}: exactly one JSON block required')
    value = parse_json(blocks[0], name)
    require(isinstance(value, dict), f'{name}: expected object')
    require(type(value.get('schema_version')) is int and value['schema_version'] == 1, f'{name}: unsupported schema_version')
    return value


def timestamp(value: Any, label: str) -> None:
    try:
        parsed = datetime.fromisoformat(text(value, label).replace('Z', '+00:00'))
        require(parsed.tzinfo is not None and parsed.utcoffset() is not None, f'{label}: timezone required')
    except (TypeError, ValueError) as exc:
        raise CheckError(f'{label}: invalid timezone-aware ISO timestamp') from exc


def sha(value: Any, length: int, label: str) -> None:
    require(isinstance(value, str) and re.fullmatch('[0-9a-f]{' + str(length) + '}', value), f'{label}: expected {length}-digit lowercase SHA')


def matches(path: str, patterns: list[str]) -> bool:
    return any(fnmatch.fnmatchcase(path, relative(pattern, glob=True)) for pattern in patterns)


def git(root: Path, *args: str) -> str:
    try:
        result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, check=False, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CheckError(f'Git unavailable: {exc}') from exc
    require(result.returncode == 0, 'Git failed: ' + result.stderr.decode('utf-8', errors='replace').strip())
    return result.stdout.decode('utf-8')


def changed_paths(root: Path, base: str) -> list[str]:
    sha(base, 40, 'base commit')
    require(git(root, 'rev-parse', '--verify', base + '^{commit}').strip() == base, 'base commit mismatch')
    git(root, 'merge-base', '--is-ancestor', base, 'HEAD')
    tracked = git(root, 'diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', base, '--').split('\0')
    untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z').split('\0')
    return sorted({relative(p) for p in tracked + untracked if p})


def manifest(root: Path) -> dict:
    value = parse_json(inside(root, 'docs/rules/manifest.json').read_text(encoding='utf-8'), 'manifest')
    fields = {'schema_version', 'rules_version', 'rule_owners', 'support_files', 'templates', 'commands', 'publication'}
    object_keys(value, fields, fields, 'manifest')
    require(type(value['schema_version']) is int and value['schema_version'] == 1, 'unsupported manifest schema')
    require(isinstance(value['rules_version'], str) and re.fullmatch(r'\d+\.\d+\.\d+', value['rules_version']), 'invalid rules_version')
    owners = value['rule_owners']
    require(isinstance(owners, dict) and bool(owners), 'rule_owners required')
    for key, path in owners.items():
        require(re.fullmatch(r'[a-z][a-z-]*', key), f'invalid rule ID: {key}')
        relative(path)
    require(len(set(owners.values())) == len(owners), 'multiple owners for one document')
    require(isinstance(value['support_files'], list), 'support_files must be list')
    for entry in value['support_files']:
        object_keys(entry, {'source', 'target'}, {'source', 'target'}, 'support file')
        relative(entry['source']); relative(entry['target'])
    strings(value['templates'], 'templates', True)
    strings(value['publication'], 'publication', True)
    for path in value['templates']:
        relative(path)
    for path in value['publication']:
        relative(path, glob=True)
    require(isinstance(value['commands'], dict), 'commands must be object')
    for command, paths in value['commands'].items():
        text(command, 'command')
        strings(paths, 'command paths')
        for path in paths:
            relative(path, glob=True)
    require(value['commands'].get('status') == [] and value['commands'].get('rules') == [], 'status/rules must be read-only')
    return value


def delivery(value: dict) -> dict[str, str]:
    """Return destination -> source, without self-referential manifest hashes."""
    result = {'docs/rules/manifest.json': 'docs/rules/manifest.json'}
    for source in value['rule_owners'].values():
        require(source not in result, f'duplicate delivery: {source}')
        result[source] = source
    for entry in value['support_files']:
        target = entry['target']
        require(target not in result, f'duplicate delivery: {target}')
        result[target] = entry['source']
    return result


def source_record(root: Path) -> dict:
    value = document(root, 'docs/rules/RULES_SOURCE.md')
    fields = {'schema_version', 'rules_version', 'source_repository', 'source_branch', 'source_commit', 'synced_at', 'files'}
    object_keys(value, fields, fields, 'RULES_SOURCE')
    require(value['source_repository'] == 'Shota-Zaki/development-rules', 'unexpected rules source repository')
    require(value['source_branch'] == 'main', 'Snapshot must identify formal main')
    sha(value['source_commit'], 40, 'source commit')
    timestamp(value['synced_at'], 'synced_at')
    require(isinstance(value['files'], dict) and value['files'], 'source files required')
    for path, hash_value in value['files'].items():
        relative(path); sha(hash_value, 64, 'source file hash')
    return value


def check_snapshot_local(root: Path, value: dict) -> dict:
    record = source_record(root)
    expected = delivery(value)
    require(record['rules_version'] == value['rules_version'], 'snapshot version mismatch')
    require(set(record['files']) == set(expected), 'snapshot file set mismatch')
    for target, hash_value in record['files'].items():
        require(digest(inside(root, target)) == hash_value, f'snapshot digest mismatch: {target}')
    actual_rules = {str(p.relative_to(root)) for p in (root / 'docs/rules').glob('*.md') if p.name != 'RULES_SOURCE.md'}
    require(actual_rules == set(value['rule_owners'].values()), 'unlisted or missing rule documents')
    return record
