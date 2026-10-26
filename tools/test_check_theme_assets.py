import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib
import xml.etree.ElementTree as ET
from check_theme_assets import check_svg, check_manifest, check_release_records


class AssetGateTests(unittest.TestCase):
    def test_human_and_guild_casts_have_six_distinct_structural_silhouettes(self):
        root=Path(__file__).resolve().parents[1]/'design/overlay-themes'
        for pack in ['midnight-bureau','lanternwood-guild','corner-cafe','button-and-spool']:
            geometries=[]
            for i in range(6):
                tree=ET.parse(root/pack/f'character-{i}.svg')
                geometry=[(n.tag.split('}')[-1], tuple(sorted((k,v) for k,v in n.attrib.items() if k in {'d','points','x','y','cx','cy','r','rx','ry','width','height','transform'}))) for n in tree.iter() if n.tag.split('}')[-1] not in {'defs','linearGradient','stop'}]
                geometries.append(str(geometry))
            self.assertEqual(len(set(geometries)),6,pack)
    def test_accepts_passive_local_gradient(self):
        self.assertEqual(check_svg(b'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><linearGradient id="a"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path fill="url(#a)" d="M0 0h1"/></svg>'), [])

    def test_rejects_executable_or_external_content(self):
        for content in [b'<script/>', b'<foreignObject/>', b'<style/>', b'<use href="https://tracker.test/a"/>', b'<path onload="x()"/>', b'<path style="fill:red"/>', b'<image href="data:x"/>', b'<animate/>', b'<path fill="url(https://bad.test)"/>']:
            with self.subTest(content=content):
                self.assertTrue(check_svg(b'<svg xmlns="http://www.w3.org/2000/svg">'+content+b'</svg>'))
        self.assertTrue(check_svg(b'<!DOCTYPE svg [<!ENTITY hi "x">]><svg/>'))

    def test_rejects_wrong_hash_and_escape(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            raw=b'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"/>'
            (root/'a.svg').write_bytes(raw)
            asset=dict(key='character-0',path='a.svg',sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),width=128,height=128,creator='Original artist',rightsBasis='original',licenseNoticeId='Apache-2.0')
            self.assertEqual(check_manifest(root,{'packId':'sample','version':'0.1.0','schemaVersion':1,'assets':[asset]},complete=False),[])
            self.assertTrue(check_manifest(root,{'assets':[{**asset,'sha256':'0'*64}]},complete=False))
            self.assertTrue(check_manifest(root,{'assets':[{**asset,'path':'../a.svg'}]},complete=False))
            (root/'link.svg').symlink_to(root/'a.svg')
            self.assertTrue(check_manifest(root,{'assets':[{**asset,'path':'link.svg'}]},complete=False))

    def test_complete_pack_requires_six_characters_and_budgets(self):
        with TemporaryDirectory() as tmp:
            self.assertTrue(check_manifest(Path(tmp),{'assets':[]},complete=True))

    def test_public_release_records_must_match_actual_art_and_identity(self):
        manifest={'packId':'sample','version':'0.1.0','title':'Sample','assets':[{'sha256':'a'*64}]}
        record=dict(id='review-1',packId='sample',version='0.1.0',title='Sample',assets=['a'*64],reviewer='Example reviewer',reviewedAt='2026-10-26',evidence='record-1',distribution='Apache-2.0',approvedInfluenceText='')
        self.assertEqual(check_release_records([],{'sample':manifest}),[])
        self.assertEqual(check_release_records([record],{'sample':manifest}),[])
        for changed in [{'assets':['b'*64]},{'title':'A different title'},{'reviewer':''},{'evidence':''},{'packId':'unknown'}]:
            self.assertTrue(check_release_records([{**record,**changed}],{'sample':manifest}))
        self.assertTrue(check_release_records({},{}))


if __name__=='__main__': unittest.main()
