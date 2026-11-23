# Re-run every script from the committed inputs and compare with the committed outputs. Prints one line per output.
set -e
cd "$(dirname "$0")"
( cd personas && python3 -I score.py inputs.json | cmp - outputs.json && echo "personas/outputs.json: identical" )
cd repos
for p in classify:counts.json classify_all:counts_all.json onboarding_count:onboarding_counts.json top60:top60.json; do
  python3 -B "${p%%:*}.py" | cmp - "${p##*:}" && echo "repos/${p##*:}: identical"
done
python3 -B tally_top60.py | cmp - top60_counts.txt && echo "repos/top60_counts.txt: identical"
