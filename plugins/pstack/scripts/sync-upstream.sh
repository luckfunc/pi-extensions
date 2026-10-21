#!/usr/bin/env bash
# Re-copy pstack skills from cursor/plugins and re-apply the pi frontmatter rules.
# Roles are copied to roles/; the two pi-adapted briefs are hand maintained.
# setup-pstack is pi-specific and is NOT overwritten; review it by hand after a sync.
set -euo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM_REF="${1:-main}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone --depth 1 --filter=blob:none --sparse --branch "$UPSTREAM_REF" \
  https://github.com/cursor/plugins.git "$WORK/plugins" >/dev/null
git -C "$WORK/plugins" sparse-checkout set pstack >/dev/null

COMMIT="$(git -C "$WORK/plugins" log -1 --format='%H %ci')"

python3 - "$WORK/plugins/pstack" "$PKG" <<'PY'
import glob, os, re, shutil, sys

src, pkg = sys.argv[1], sys.argv[2]
skills_src = os.path.join(src, "skills")
skills_dst = os.path.join(pkg, "skills")
roles_dst = os.path.join(pkg, "roles")

skip = {"setup-pstack"}  # pi-specific, hand maintained
role_skip = {"poteto-agent.md", "comment-sicko.md"}  # pi-adapted briefs
for dst, preserved in ((skills_dst, skip), (roles_dst, role_skip)):
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(dst):
        if name in preserved:
            continue
        target = os.path.join(dst, name)
        if os.path.isdir(target) and not os.path.islink(target):
            shutil.rmtree(target)
        else:
            os.unlink(target)

for name in sorted(os.listdir(skills_src)):
    source = os.path.join(skills_src, name)
    if not os.path.isdir(source) or name in skip:
        continue
    target = os.path.join(skills_dst, name)
    shutil.copytree(source, target)

    path = os.path.join(target, "SKILL.md")
    if not os.path.exists(path):
        continue
    text = open(path).read()
    match = re.match(r"---\n(.*?\n)---\n", text, re.S)
    if not match:
        continue
    kept = []
    for line in match.group(1).split("\n"):
        if re.match(r"^(icon|color):", line):
            continue
        if re.match(r"^name:", line):
            kept.append("name: " + name)
            continue
        kept.append(line)
    open(path, "w").write("---\n" + "\n".join(kept) + "---\n" + text[match.end():])

agents_src = os.path.join(src, "agents")
os.makedirs(roles_dst, exist_ok=True)
for name in sorted(os.listdir(agents_src)):
    if name.endswith(".md") and name not in role_skip:
        shutil.copy2(os.path.join(agents_src, name), os.path.join(roles_dst, name))
PY

printf '%s\n' "$COMMIT" > "$PKG/.upstream-rev"
echo "synced pstack@${COMMIT%% *}"
echo "review upstream changes to roles/poteto-agent.md, roles/comment-sicko.md,"
echo "and skills/setup-pstack/SKILL.md (all preserved, not synced) before committing."
