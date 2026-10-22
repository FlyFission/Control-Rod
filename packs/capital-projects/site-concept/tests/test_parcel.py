import io
import json
import zipfile

import pytest
import shapefile

from cr_site.fetch import Fetcher
from cr_site.geo import qval
from cr_site.parcel import ParcelError, resolve

from .conftest import E, N, S, W, failing_transport, parcel_geojson

ACRES = 68.8  # the fixture rectangle, measured independently below


def _area(feat):
    return qval(feat["properties"]["area"])


def test_geojson_file_is_exact(parcel_file):
    f = resolve(str(parcel_file))
    p = f["properties"]
    assert p["derivation"] == "exact"
    assert p["confirmation_required"] is False
    assert _area(f) == pytest.approx(ACRES, rel=0.01)
    assert p["measured_in"] == "EPSG:32617"


KML = f"""<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
<Polygon><outerBoundaryIs><LinearRing><coordinates>
{W},{S},0 {E},{S},0 {E},{N},0 {W},{N},0 {W},{S},0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>"""


def test_kml_and_kmz(tmp_path, parcel_file):
    ref = _area(resolve(str(parcel_file)))
    k = tmp_path / "p.kml"
    k.write_text(KML)
    assert _area(resolve(str(k))) == pytest.approx(ref, rel=1e-6)
    z = tmp_path / "p.kmz"
    with zipfile.ZipFile(z, "w") as zz:
        zz.writestr("doc.kml", KML)
    f = resolve(str(z))
    assert f["properties"]["input_kind"] == "kmz"
    assert _area(f) == pytest.approx(ref, rel=1e-6)


def test_shapefile_zip(tmp_path, parcel_file):
    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    w = shapefile.Writer(shp=shp, shx=shx, dbf=dbf, shapeType=shapefile.POLYGON)
    w.field("NAME", "C")
    w.poly([[[W, S], [W, N], [E, N], [E, S], [W, S]]])
    w.record("test")
    w.close()
    z = tmp_path / "p.zip"
    with zipfile.ZipFile(z, "w") as zz:
        zz.writestr("p.shp", shp.getvalue())
        zz.writestr("p.shx", shx.getvalue())
        zz.writestr("p.dbf", dbf.getvalue())
        zz.writestr("p.prj", 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984"]]')
    f = resolve(str(z))
    assert f["properties"]["input_kind"] == "shapefile"
    assert _area(f) == pytest.approx(_area(resolve(str(parcel_file))), rel=1e-6)


def test_wkt_text():
    f = resolve(f"POLYGON(({W} {S}, {E} {S}, {E} {N}, {W} {N}, {W} {S}))")
    assert f["properties"]["input_kind"] == "wkt"
    assert _area(f) == pytest.approx(ACRES, rel=0.01)


def test_point_with_acres_is_an_approximate_square():
    f = resolve("34.752, -82.296", acres_hint=50)
    p = f["properties"]
    assert p["derivation"] == "approximate-from-point"
    assert p["confirmation_required"] is True
    assert _area(f) == pytest.approx(50, rel=1e-3)
    assert "HOLD-PARCEL-BOUNDARY" in {h["id"] for h in p["holds"]}


def test_point_without_acres_is_a_hold():
    f = resolve("34.752 -82.296")
    assert f["geometry"]["type"] == "Point"
    assert "HOLD-PARCEL-ACRES" in {h["id"] for h in f["properties"]["holds"]}


def test_address_is_geocoded_with_a_citation(fetcher):
    f = resolve("1 Example Rd, Greenville, SC 29601", acres_hint=40, fetcher=fetcher)
    p = f["properties"]
    assert p["input_kind"] == "address"
    src = p["sources"][0]
    assert src["sha256"]
    assert src["retrieved_at"] == "2026-10-22T16:00:00Z"
    assert "HOLD-PARCEL-GEOCODE" in {h["id"] for h in p["holds"]}


def test_failed_geocode_is_refused():
    with pytest.raises(ParcelError, match="could not be geocoded"):
        resolve("1 Nowhere Rd", fetcher=Fetcher(transport=failing_transport))


def test_unregistered_county_is_refused():
    with pytest.raises(ParcelError, match="no parcel service registered"):
        resolve("Greenville County SC 0123456789")


def test_plat_pdf_points_to_closure(tmp_path):
    pdf = tmp_path / "plat.pdf"
    pdf.write_bytes(b"%PDF-1.4")
    with pytest.raises(ParcelError, match="plat closure"):
        resolve(str(pdf))


def test_geojson_text():
    f = resolve(json.dumps(parcel_geojson()))
    assert f["properties"]["derivation"] == "exact"
