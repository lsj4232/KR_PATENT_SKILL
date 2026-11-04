import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    'learning', ROOT / 'kr-patent-skill-updater/scripts/append_learning.py'
)
learning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learning)


class AppendLearningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'SKILL.md'

    def append(self, *items, **kwargs):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return learning.append_items(self.path, items, **kwargs)

    def test_level_two_and_three_stop_before_sibling(self):
        for hashes in ('##', '###'):
            with self.subTest(hashes=hashes):
                self.path.write_text(f'{hashes} 누적 학습 항목\n- 기존\n\n{hashes} 다른 절\n내용\n', encoding='utf-8')
                self.assertEqual(self.append('새 항목', no_backup=True), 0)
                result = self.path.read_text(encoding='utf-8')
                self.assertLess(result.index('- 새 항목'), result.index('다른 절'))
                self.assertTrue(result.endswith('다른 절\n내용\n'))

    def test_fenced_headings_are_not_sections(self):
        self.path.write_text('```markdown\n### 누적 학습 항목\n```\n## 실제\n내용\n', encoding='utf-8')
        original = self.path.read_bytes()
        self.assertEqual(self.append('항목'), 2)
        self.assertEqual(self.path.read_bytes(), original)

    def test_fence_inside_section_does_not_end_it(self):
        lines = '## 누적 학습 항목\n~~~md\n# 예시\n~~~\n- 기존\n## 다음\n'.splitlines()
        self.assertEqual(learning.find_section_range(lines), (0, 1, 5))

    def test_child_heading_keeps_new_item_at_parent_level(self):
        self.path.write_text('## 누적 학습 항목\n- 기존\n\n### 세부 사례\n- 세부\n## 다음\n', encoding='utf-8')
        self.assertEqual(self.append('새 항목'), 0)
        result = self.path.read_text(encoding='utf-8')
        self.assertLess(result.index('- 새 항목'), result.index('### 세부 사례'))

    def test_repeated_items_are_idempotent_without_extra_backup(self):
        self.path.write_text('### 누적 학습 항목\n- 기존\n', encoding='utf-8')
        self.assertEqual(self.append('기존', '새 항목', '새 항목'), 0)
        content = self.path.read_bytes()
        backups = list(self.path.parent.glob('*.bak.*'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(self.append('- 새 항목', '기존'), 0)
        self.assertEqual(self.path.read_bytes(), content)
        self.assertEqual(list(self.path.parent.glob('*.bak.*')), backups)

    def test_dry_run_preserves_source_and_creates_no_backup(self):
        self.path.write_text('## 누적 학습 항목\n', encoding='utf-8')
        original = self.path.read_bytes()
        self.assertEqual(self.append('항목', dry_run=True), 0)
        self.assertEqual(self.path.read_bytes(), original)
        self.assertEqual(list(self.path.parent.glob('*.bak.*')), [])

    def test_invalid_items_do_not_mutate(self):
        for item in ('', '  ', '-', '항목\n## 주입'):
            with self.subTest(item=item):
                self.path.write_text('## 누적 학습 항목\n', encoding='utf-8')
                original = self.path.read_bytes()
                self.assertEqual(self.append(item), 1)
                self.assertEqual(self.path.read_bytes(), original)
                self.assertEqual(list(self.path.parent.glob('*.bak.*')), [])

    def test_backup_preserves_original_bytes(self):
        original = '### 누적 학습 항목\r\n- 기존\r\n'.encode('utf-8')
        self.path.write_bytes(original)
        self.assertEqual(self.append('새 항목'), 0)
        self.assertEqual(next(self.path.parent.glob('*.bak.*')).read_bytes(), original)

    def test_missing_file_and_missing_section(self):
        self.assertEqual(self.append('항목'), 1)
        self.path.write_text('# 다른 문서\n', encoding='utf-8')
        self.assertEqual(self.append('항목'), 2)
        self.assertEqual(self.path.read_text(encoding='utf-8'), '# 다른 문서\n')


if __name__ == '__main__':
    unittest.main()
