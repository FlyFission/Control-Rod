# Tools for this role. The control plane writes this list to inputs/TOOLS.txt for author runs.
# "network: on" lets a sandboxed runtime (Codex) reach the public GIS services cr-site queries.
# Pre-check runs of this role never get the network line.
network: on
Read
Write
Edit
Glob
Grep
WebSearch
WebFetch
Bash(cr-site:*)
Bash(python3:*)
