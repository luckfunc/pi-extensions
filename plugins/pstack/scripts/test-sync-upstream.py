#!/usr/bin/env python3
"""Exercise the sync transform offline, without cloning or touching an install."""
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name("sync-upstream.sh")
TRANSFORM = SCRIPT.read_text().split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]


class SyncTest(unittest.TestCase):
    def test_preserves_pi_files_and_reconciles_upstream(self):
        with tempfile.TemporaryDirectory() as work:
            root = pathlib.Path(work)
            src, dst = root / "upstream", root / "package"

            def put(base, name, text):
                file = base / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(text)

            preserved = {
                "skills/setup-pstack/SKILL.md": "pi model setup\n",
                "skills/setup-pstack/nested/config.json": "{}\n",
                "roles/poteto-agent.md": "pi delegate\n",
                "roles/comment-sicko.md": "pi reviewer\n",
            }
            for name, text in preserved.items():
                put(dst, name, text)
                put(src, name.replace("roles/", "agents/"), "cursor version\n")
            put(dst, "skills/removed/SKILL.md", "stale")
            put(dst, "roles/removed.md", "stale")
            put(src, "skills/new-skill/SKILL.md",
                "---\nname: New Skill\nicon: star\ncolor: blue\ndescription: Test\n"
                "disable-model-invocation: true\n---\nBody\n")
            put(src, "skills/new-skill/references/data.txt", "unchanged\n")
            put(src, "agents/new-role.md", "new role\n")
            for _ in range(2):
                subprocess.run(["python3", "-", str(src), str(dst)],
                               input=TRANSFORM, text=True, check=True)
                for name, text in preserved.items():
                    self.assertEqual((dst / name).read_text(), text)
                self.assertFalse((dst / "skills/removed").exists())
                self.assertFalse((dst / "roles/removed.md").exists())
                self.assertEqual((dst / "roles/new-role.md").read_text(), "new role\n")
                self.assertEqual((dst / "skills/new-skill/references/data.txt").read_text(), "unchanged\n")
                self.assertEqual((dst / "skills/new-skill/SKILL.md").read_text(),
                                 "---\nname: new-skill\ndescription: Test\n"
                                 "disable-model-invocation: true\n---\nBody\n")


if __name__ == "__main__":
    unittest.main()
