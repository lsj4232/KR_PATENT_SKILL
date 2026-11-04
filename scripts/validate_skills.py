#!/usr/bin/env python3
"""Validate repository skill metadata, context budgets and local Markdown links."""
import argparse
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

import yaml


def prose_lines(text):
    fence = None
    for line in text.splitlines():
        marker = re.match(r'^\s*(`{3,}|~{3,})(.*)$', line)
        if marker:
            run, tail = marker.groups()
            if fence is None:
                fence = (run[0], len(run))
            elif run[0] == fence[0] and len(run) >= fence[1] and not tail.strip():
                fence = None
            continue
        if fence is None:
            yield line


def validate(root):
    errors = []
    skills = sorted(root.glob('*/SKILL.md'))
    if not skills:
        return ['No skills found'], []
    metrics = []
    for path in skills:
        text = path.read_text(encoding='utf-8')
        label = path.relative_to(root).as_posix()
        match = re.match(r'\A---\n(.*?)\n---\n(.*)\Z', text, re.S)
        if not match:
            errors.append(f'{label}: missing YAML frontmatter')
            continue
        try:
            data = yaml.safe_load(match[1])
        except yaml.YAMLError as exc:
            errors.append(f'{label}: invalid YAML: {exc}')
            continue
        if not isinstance(data, dict):
            errors.append(f'{label}: metadata must be a mapping')
            continue
        name = data.get('name')
        description = data.get('description')
        if (not isinstance(name, str) or name != path.parent.name
                or len(name) > 64 or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name)):
            errors.append(f'{label}: invalid name or directory mismatch')
        if not isinstance(description, str) or not description.strip() or len(description) > 280:
            errors.append(f'{label}: description must contain 1–280 characters (repository budget)')
        body = match[2]
        if not body.strip() or len(body.splitlines()) > 500:
            errors.append(f'{label}: body must contain 1–500 lines (repository budget)')
        metrics.append((path.parent.name, len(description) if isinstance(description, str) else 0,
                        len(body.splitlines()), len(text.encode('utf-8'))))

    docs = [root / 'README.md', root / 'CONTRIBUTING.md']
    docs.extend((root / 'docs').rglob('*.md'))
    for skill in skills:
        docs.append(skill)
        for directory in ('references', 'reference'):
            docs.extend((skill.parent / directory).rglob('*.md'))
    for path in docs:
        if not path.is_file():
            errors.append(f'{path.relative_to(root)}: missing documentation')
            continue
        for line in prose_lines(path.read_text(encoding='utf-8')):
            line = re.sub(r'(`+).*?\1', '', line)
            for raw in re.findall(r'!?\[[^\]\n]*\]\(([^)\n]+)\)', line):
                target = raw.strip().strip('<>')
                parsed = urlsplit(target)
                if parsed.scheme or target.startswith('#') or not parsed.path:
                    continue
                # This checks local file targets, not remote availability or heading anchors.
                destination = path.parent / unquote(parsed.path)
                if not destination.exists():
                    errors.append(f'{path.relative_to(root)}: missing link target {target}')
    return errors, metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors, metrics = validate(args.root.resolve())
    for name, description, lines, size in metrics:
        print(f'{name}: description={description} chars, body={lines} lines, total={size} bytes')
    for error in errors:
        print(f'ERROR: {error}', file=sys.stderr)
    print(f'{len(metrics)} skills checked; {len(errors)} errors')
    return bool(errors)


if __name__ == '__main__':
    raise SystemExit(main())
