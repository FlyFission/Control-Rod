#!/bin/sh
# Mutation check for host-git-filter-pins. Each mutation removes one control
# from daemon/internal/runner/git_host.go; the named tests must fail. The file
# is restored after each mutation. Run from the repository root.
set -u
f=daemon/internal/runner/git_host.go
cp "$f" "$f.orig"
trap 'mv "$f.orig" "$f"' EXIT
mutate() {
  name=$1; from=$2; to=$3; tests=$4
  cp "$f.orig" "$f"
  python3 -I -c 'import sys
p,a,b=sys.argv[1:4]
s=open(p).read()
assert s.count(a)==1, "pattern not unique: "+a
open(p,"w").write(s.replace(a,b))' "$f" "$from" "$to" || exit 2
  printf '== %s\n' "$name"
  if (cd daemon && go test ./internal/runner/ -count=1 -run "$tests" >"$out" 2>&1); then
    printf 'SURVIVED (tests passed)\n'; status=1
  else
    grep -E '^(--- FAIL|FAIL|ok)' "$out" | grep -v '^FAIL$'; printf 'KILLED\n'
  fi
}
status=0
out=$(mktemp)
mutate M1-no-pins 'pins, err := filterPins(entries)' 'pins, err := filterPins(nil)' 'Neutralizes|KeepsGlobal'
mutate M2-no-verify 'if after := repoFilterEntries(again); !slices.Equal(before, after) {' 'if after := repoFilterEntries(again); false && !slices.Equal(before, after) {' 'DetectsFilterConfigChange'
mutate M3-empty-dir 'if dir == "" {
		return nil, errors.New' 'if false && dir == "" {
		return nil, errors.New' 'RequiresDir'
mutate M4-local-scope-only 'return scope == "local" || scope == "worktree"' 'return scope == "local"' 'WorktreeFilterDriver|FilterPins'
mutate M5-no-trusted-value 'trusted[subsection+"."+strings.ToLower(variable)] = value' '_ = value' 'KeepsGlobal|FilterPins'
mutate M6-required-not-false 'value = "false"' 'value = ""' 'Neutralizes|FilterPins'
mutate M7-unpinnable-name-allowed 'if strings.Contains(name, "=") {' 'if false && strings.Contains(name, "=") {' 'UnpinnableFilterName'
mutate M8-valueless-trusted-dropped 'value = "true"
			}
			trusted' 'value = ""
			}
			trusted' 'ValuelessTrusted'
exit $status
