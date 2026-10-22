"""Public data sources and how each one was verified.

`verified` records how each endpoint was checked on 2026-10-22: first against its REST
directory page or documentation, then by live queries from the build environment's shell
for a parcel near Greenville, SC. FEMA and NETL each needed a second try, so every call
retries once; a second failure is a hold. FEMA returned its 2,000-record limit for a wide box,
so a truncated answer (`exceededTransferLimit`) is a hold too.

Rejected: a public "HIFLD electric power substations" ArcGIS Online service. It held 128
features in one region, so an empty answer would have read as "no substation nearby".
Substations stay a hold until a national source is verified.
"""

from __future__ import annotations

SOURCES: dict[str, dict] = {
    "census_geocoder": {
        "name": "US Census Bureau Geocoder",
        "url": "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
        "params": {"benchmark": "Public_AR_Current", "format": "json"},
        "verified": "documentation (Geocoding_Services_API.html): URL pattern and "
        "result.addressMatches[].coordinates.{x,y}; not yet queried live",
    },
    "fema_nfhl": {
        "name": "FEMA National Flood Hazard Layer, Flood Hazard Zones",
        "url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query",
        "verified": "MapServer root in the AmeriGEOSS catalog; fields from FEMA's S_FLD_HAZ_AR "
        "schema; live: layer 28 returned flood zone features (record limit 2,000)",
    },
    "usfws_nwi": {
        "name": "USFWS National Wetlands Inventory",
        "url": "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/"
        "Wetlands/MapServer/0/query",
        "verified": "REST directory: layer 0 'Wetlands', JSON and geoJSON, MaxRecordCount 500; "
        "live: returned wetland polygons with WETLAND_TYPE and ATTRIBUTE",
    },
    "usgs_epqs": {
        "name": "USGS Elevation Point Query Service (3DEP)",
        "url": "https://epqs.nationalmap.gov/v1/json",
        "verified": "parameters from a published client's documentation (usgs-ned); live: "
        "returned 'value' in feet for each grid point",
    },
    "hifld_transmission": {
        "name": "HIFLD Electric Power Transmission Lines (DOE NETL mirror)",
        "url": "https://arcgis.netl.doe.gov/server/rest/services/Hosted/"
        "Energy_Transition_Atlas_493d6/FeatureServer/18/query",
        "verified": "layer page: fields voltage, owner, type, status, sub_1, sub_2, "
        "MaxRecordCount 2000, data HIFLD 2022; live: returned line features",
    },
    "eia_gas_pipelines": {
        "name": "EIA Natural Gas Interstate and Intrastate Pipelines (USDOT NTAD host)",
        "url": "https://geo.dot.gov/server/rest/services/hosted/Natural_Gas_Pipelines_US_EIA/"
        "FeatureServer/0/query",
        "verified": "item info: EIA, updated January 2020, public use; live: layer 0 holds "
        "32,961 features nationally and answered envelope queries",
    },
    "census_roads": {
        "name": "Census TIGERweb Transportation (2020)",
        "url": "https://tigerweb.geo.census.gov/arcgis/rest/services/Census2020/"
        "Transportation/MapServer",
        "layers": {"primary": 2, "local": 8},
        "verified": "REST directory: layer 2 Primary Roads, 8 Local Roads, MaxRecordCount "
        "100000; live: returned named road features",
    },
    "nrcs_soils": {
        "name": "NRCS Soil Data Access",
        "url": "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest",
        "verified": "not implemented: the POST request and response format could not be "
        "confirmed; soils are reported as a hold",
    },
}
