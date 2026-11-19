#!/usr/bin/env bash
# Runs the readme-shots `commit` job's script against local fixture artifacts and a local bare
# remote, to show which artifacts it accepts and refuses. Usage, from the repository root:
#   bash .nuclear/changes/readme-shots-lockdown/evidence/commit-step-test.sh
set -uo pipefail
WF="$(pwd)/.github/workflows/readme-shots.yml"
T="$(mktemp -d)"
python3 -c "import sys,yaml;d=yaml.safe_load(open(sys.argv[1]));print(d['jobs']['commit']['steps'][-1]['run'])" "$WF" > "$T/commit.sh"
png() { printf '\x89PNG\r\n\x1a\n%s' "$2" > "$1"; }
fresh() {
  rm -rf "$T/remote.git" "$T/repo" "$T/shots"; mkdir "$T/shots"
  git init -q --bare "$T/remote.git"; git clone -q "$T/remote.git" "$T/repo" 2>/dev/null
  (cd "$T/repo" && git checkout -q -b feat && mkdir -p docs/assets/readme/app && echo x > README && git add . \
    && git -c user.name=t -c user.email=t@t commit -qm init && git push -q origin feat 2>/dev/null)
}
run() {
  local sha="${1:-}"
  (cd "$T/repo" && SHOTS="$T/shots" HEAD_REF=feat HEAD_SHA="${sha:-$(git rev-parse HEAD)}" bash "$T/commit.sh" 2>&1) \
    | grep -Ev 'push negotiation|expected .acknowledgments|^To |->' ; echo "exit ${PIPESTATUS[0]}"
  echo "remote commits: $(git -C "$T/remote.git" rev-list --count feat)"
}
echo "== 1. two valid pictures: committed and pushed"; fresh; png "$T/shots/office.png" a; png "$T/shots/inbox.png" b; run
echo "== 2. same pictures again: no change, no commit"; (cd "$T/repo" && git pull -q origin feat 2>/dev/null); run
echo "== 3. name with shell characters: refused"; fresh; png "$T/shots/Evil\$(id).png" a; run
echo "== 4. not a PNG: refused"; fresh; echo hi > "$T/shots/office.png"; run
echo "== 5. symlink to /etc/passwd: refused"; fresh; ln -s /etc/passwd "$T/shots/office.png"; run
echo "== 6. a subfolder: refused"; fresh; mkdir "$T/shots/sub"; png "$T/shots/sub/a.png" a; png "$T/shots/office.png" a; run
echo "== 7. over 5 MB: refused"; fresh; png "$T/shots/office.png" "$(head -c 5300000 /dev/zero | tr '\0' a)"; run
echo "== 8. branch moved since the run started: skipped"; fresh; png "$T/shots/office.png" a; run 0000000000000000000000000000000000000000
echo "== 9. empty artifact: refused"; fresh; run
rm -rf "$T"
