# Tools for this role. The control plane writes this list to inputs/TOOLS.txt for author runs.
# The network line names the only hosts this role's agent actions may reach. Pre-check runs of
# this role never get the network line.
network: docs.example.org, standards.example.org
Read
Write
Edit
Glob
Grep
WebSearch
WebFetch
Bash(python3:*)
