# Tools for this role. The control plane writes this list to inputs/TOOLS.txt for author runs.
# The network line names the public GIS hosts cr-site queries (src/cr_site/sources.py); the
# sandbox policy lets agent actions reach only these, and only for public or internal work of
# general-service grade. Pre-check runs of this role never get the network line.
network: arcgis.netl.doe.gov, epqs.nationalmap.gov, fwspublicservices.wim.usgs.gov, geo.dot.gov, geocoding.geo.census.gov, hazards.fema.gov, sdmdataaccess.sc.egov.usda.gov, tigerweb.geo.census.gov
Read
Write
Edit
Glob
Grep
WebSearch
WebFetch
Bash(cr-site:*)
Bash(python3:*)
