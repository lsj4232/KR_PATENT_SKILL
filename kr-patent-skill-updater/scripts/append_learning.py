#!/usr/bin/env python3
"""
=============================================================================
 SKILL.md 누적 학습 항목 자동 추가 스크립트
=============================================================================

대상 SKILL.md 파일의 "누적 학습 항목" 섹션을 찾아 새 항목을 append한다.
원본은 자동 백업.

사용법:
    python3 append_learning.py \\
        --skill-path /path/to/SKILL.md \\
        --item "회로 발명에서 V_REF 정전위 조건은 시스템 효과로 명시"

여러 항목 한 번에:
    python3 append_learning.py \\
        --skill-path /path/to/SKILL.md \\
        --item "항목 1" \\
        --item "항목 2"

조회만 (실제 수정 X):
    python3 append_learning.py \\
        --skill-path /path/to/SKILL.md \\
        --list

=============================================================================
"""

import argparse
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path


# 누적 학습 항목 섹션의 헤더 패턴
# (좌측 정렬된 "### 누적 학습 항목" 또는 그 변형들 매칭)
SECTION_HEADER_PATTERNS = [
    r"^###\s*누적\s*학습\s*항목",
    r"^###\s*회고\s*노하우\s*누적",  # skill-updater 자기 자신용
    r"^###\s*누적\s*양식\s*개선",     # docx-builder용
]


def find_section_range(lines, header_patterns=None):
    """
    'lines' (str의 list)에서 누적 학습 항목 섹션의 시작/끝 줄 인덱스를 반환.

    Returns:
        (header_idx, content_start_idx, content_end_idx)
        - header_idx: "### 누적 학습 항목" 줄 인덱스
        - content_start_idx: 그 다음 줄
        - content_end_idx: 다음 ## 헤더 직전, 또는 파일 끝
        없으면 (None, None, None) 반환
    """
    patterns = header_patterns or SECTION_HEADER_PATTERNS
    compiled = [re.compile(p) for p in patterns]

    header_idx = None
    for i, line in enumerate(lines):
        for p in compiled:
            if p.match(line):
                header_idx = i
                break
        if header_idx is not None:
            break

    if header_idx is None:
        return None, None, None

    # 섹션 끝 찾기 (다음 ## 또는 # 헤더 직전, 또는 파일 끝)
    content_start = header_idx + 1
    content_end = len(lines)
    for j in range(content_start, len(lines)):
        # 새 섹션 헤더 (단, ### 으로 시작하는 동일 레벨은 OK)
        if re.match(r"^##\s", lines[j]) or re.match(r"^#\s", lines[j]):
            content_end = j
            break

    return header_idx, content_start, content_end


def list_items(skill_path):
    """현재 누적된 항목들을 출력."""
    p = Path(skill_path)
    if not p.exists():
        print(f"Error: 파일 없음: {skill_path}", file=sys.stderr)
        return 1

    lines = p.read_text(encoding="utf-8").splitlines()
    header_idx, start, end = find_section_range(lines)

    if header_idx is None:
        print(f"⚠ 누적 학습 항목 섹션을 찾을 수 없음: {skill_path}")
        return 2

    print(f"# {p}")
    print(f"# 섹션 위치: 줄 {header_idx + 1} ~ {end}")
    print()
    # 섹션 내용 출력 (헤더 포함)
    for line in lines[header_idx:end]:
        print(line)
    return 0


def append_items(skill_path, items, dry_run=False, no_backup=False):
    """새 항목들을 누적 학습 항목 섹션 끝에 추가."""
    p = Path(skill_path)
    if not p.exists():
        print(f"Error: 파일 없음: {skill_path}", file=sys.stderr)
        return 1

    original = p.read_text(encoding="utf-8")
    lines = original.splitlines()

    header_idx, start, end = find_section_range(lines)

    if header_idx is None:
        print(f"⚠ 누적 학습 항목 섹션을 찾을 수 없음: {skill_path}", file=sys.stderr)
        print(f"   SKILL.md에 '### 누적 학습 항목' 섹션이 있는지 확인하세요.", file=sys.stderr)
        return 2

    # 섹션의 마지막 비어있지 않은 줄 찾기 (그 뒤에 새 항목 추가)
    insert_at = end  # 기본: 섹션 끝 (다음 헤더 직전)
    # 끝에서부터 거꾸로 비어있는 줄 skip
    for k in range(end - 1, start - 1, -1):
        if lines[k].strip():
            insert_at = k + 1
            break

    # 새 항목들 (기존 줄 양식과 맞추기: "- " 접두사)
    new_lines = []
    for item in items:
        item = item.strip()
        if not item.startswith("-"):
            item = f"- {item}"
        new_lines.append(item)

    # dry run
    if dry_run:
        print("=== DRY RUN — 실제 수정 안 함 ===")
        print(f"대상 파일: {skill_path}")
        print(f"섹션: 줄 {header_idx + 1} ~ {end}")
        print(f"삽입 위치: 줄 {insert_at + 1} 직전")
        print(f"추가될 줄:")
        for line in new_lines:
            print(f"  | {line}")
        return 0

    # 백업
    if not no_backup:
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = p.with_suffix(p.suffix + f".bak.{ts}")
        shutil.copy2(p, backup_path)
        print(f"  백업: {backup_path}")

    # 삽입
    new_content_lines = lines[:insert_at] + new_lines + lines[insert_at:]
    new_content = "\n".join(new_content_lines)
    # 원본이 마지막에 개행이 있었다면 유지
    if original.endswith("\n"):
        new_content += "\n"

    p.write_text(new_content, encoding="utf-8")

    # 현재 항목 수 계산 (- 로 시작하는 줄 카운트)
    final_lines = p.read_text(encoding="utf-8").splitlines()
    _, fs, fe = find_section_range(final_lines)
    item_count = sum(1 for line in final_lines[fs:fe] if line.strip().startswith("-"))

    print(f"✓ {skill_path}")
    print(f"  추가: {len(new_lines)}개 / 총: {item_count}개")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="SKILL.md 누적 학습 항목 섹션에 새 항목 추가",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("--skill-path", required=True,
                        help="대상 SKILL.md 파일 경로")
    parser.add_argument("--item", action="append", default=[],
                        help="추가할 항목 (여러 번 사용 가능)")
    parser.add_argument("--list", action="store_true",
                        help="현재 누적 항목들을 조회만 (수정 X)")
    parser.add_argument("--dry-run", action="store_true",
                        help="실제 수정 없이 어떻게 바뀌는지만 확인")
    parser.add_argument("--no-backup", action="store_true",
                        help="백업 파일을 만들지 않음 (비추천)")

    args = parser.parse_args()

    if args.list:
        return list_items(args.skill_path)

    if not args.item:
        parser.print_help()
        print("\nError: --item을 하나 이상 지정하세요.", file=sys.stderr)
        return 1

    return append_items(
        args.skill_path,
        args.item,
        dry_run=args.dry_run,
        no_backup=args.no_backup
    )


if __name__ == "__main__":
    sys.exit(main())
