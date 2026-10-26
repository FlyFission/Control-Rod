"""Check bundled passive SVG artwork, provenance, integrity and resource limits."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ELEMENTS = {'svg','g','path','rect','circle','ellipse','line','polyline','polygon','defs','linearGradient','radialGradient','stop','clipPath','mask','title','desc','use'}
ATTRS = {'id','xmlns','version','width','height','viewBox','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','transform','gradientUnits','gradientTransform','offset','stop-color','stop-opacity','clip-path','mask','href','preserveAspectRatio'}


def check_svg(raw):
    if len(raw) > 1024*1024:
        return ['SVG exceeds byte limit']
    if re.search(rb'<!\s*(DOCTYPE|ENTITY)', raw, re.I):
        return ['DTD/entity declarations are forbidden']
    try:
        tree = ET.fromstring(raw)
    except ET.ParseError:
        return ['Invalid SVG/XML']
    errors = []
    for node in tree.iter():
        tag = node.tag.split('}')[-1]
        if tag not in ELEMENTS:
            errors.append(f'Forbidden SVG element {tag}')
        for key, value in node.attrib.items():
            name = key.split('}')[-1]
            if name not in ATTRS:
                errors.append(f'Forbidden attribute {name}')
            if name == 'href' and not re.fullmatch(r'#[\w-]+', value):
                errors.append('Only local fragment hrefs are permitted')
            if 'url(' in value.lower() and not re.fullmatch(r'url\(#[\w-]+\)', value):
                errors.append('Only local paint/clip references are permitted')
            if re.search(r'(?:https?:|data:|javascript:|file:|//)', value, re.I):
                errors.append('External references are forbidden')
    if tree.tag.split('}')[-1] != 'svg':
        errors.append('Root must be SVG')
    return errors


def check_manifest(directory, manifest, complete=True):
    errors, total, seen = [], 0, set()
    assets = manifest.get('assets', [])
    if complete:
        if manifest.get('schemaVersion') != 1 or not manifest.get('packId') or not manifest.get('version'):
            errors.append('Missing or incompatible pack metadata')
        required = {'scene', 'thumbnail'} | {f'character-{i}' for i in range(6)} | {f'prop-{i}' for i in range(6)}
        if {a.get('key') for a in assets} != required:
            errors.append('Complete pack requires scene, thumbnail, six characters and six props')
    for a in assets:
        key = a.get('key')
        if key in seen:
            errors.append(f'Duplicate asset key {key}')
        seen.add(key)
        relative = Path(a.get('path', ''))
        path = directory / relative
        if relative.is_absolute() or '..' in relative.parts or any((directory/Path(*relative.parts[:i+1])).is_symlink() for i in range(len(relative.parts))):
            errors.append(f'{key}: escaping or symlink path')
            continue
        if not path.is_file() or not path.resolve().is_relative_to(directory.resolve()):
            errors.append(f'{key}: missing or escaping file')
            continue
        if path.stat().st_size > 1024*1024:
            errors.append(f'{key}: asset too large')
            continue
        raw = path.read_bytes()
        errors += [f'{key}: {e}' for e in check_svg(raw)]
        sha = hashlib.sha256(raw).hexdigest()
        if a.get('sha256') != sha or a.get('bytes') != len(raw):
            errors.append(f'{key}: hash/size mismatch')
        if complete and f'.{sha[:12]}.svg' not in path.name:
            errors.append(f'{key}: filename must contain content hash')
        try:
            svg = ET.fromstring(raw)
            if str(a.get('width')) != svg.get('width') or str(a.get('height')) != svg.get('height'):
                errors.append(f'{key}: dimension mismatch')
        except ET.ParseError:
            pass
        if not a.get('creator') or not a.get('licenseNoticeId') or a.get('rightsBasis') not in {'original','licensed','public-domain'}:
            errors.append(f'{key}: missing provenance')
        if key == 'thumbnail' and len(raw) > 100*1024:
            errors.append('Thumbnail exceeds 100 KiB')
        total += len(raw)
    if total > 1024*1024:
        errors.append('Pack exceeds 1 MiB')
    return errors


def check_release_records(records, manifests):
    if not isinstance(records, list):
        return ['Release manifest must be an array']
    errors, seen = [], set()
    for record in records:
        if not isinstance(record, dict):
            errors.append('Invalid release record')
            continue
        pid = record.get('packId')
        manifest = manifests.get(pid)
        if pid in seen or not manifest:
            errors.append(f'{pid}: duplicate or unknown release pack')
            continue
        seen.add(pid)
        if any(not isinstance(record.get(k),str) or not record[k].strip() for k in ['id','version','title','reviewer','reviewedAt','evidence','distribution']):
            errors.append(f'{pid}: incomplete release decision')
        if not isinstance(record.get('approvedInfluenceText'),str):
            errors.append(f'{pid}: missing explicit influence-text decision')
        if record.get('version') != manifest.get('version') or record.get('title') != manifest.get('title') or record.get('assets') != [a['sha256'] for a in manifest['assets']]:
            errors.append(f'{pid}: release does not bind actual art, version and title')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    args = parser.parse_args()
    directory = args.root / 'apps/web/public/floor-themes'
    manifests = sorted(directory.glob('*/assets.json'))
    errors, thumbnail_bytes, by_id = [], 0, {}
    for path in manifests:
        try:
            data = json.loads(path.read_text())
            by_id[data['packId']] = data
            errors += [f'{path.parent.name}: {e}' for e in check_manifest(path.parent, data)]
            thumbnail_bytes += sum(a['bytes'] for a in data['assets'] if a['key'] == 'thumbnail')
        except (ValueError, KeyError, TypeError) as exc:
            errors.append(f'{path}: invalid manifest {exc}')
    if len(manifests) != 15:
        errors.append(f'Expected fifteen complete art packs; found {len(manifests)}')
    if thumbnail_bytes > 1536*1024:
        errors.append('Catalog thumbnails exceed 1.5 MiB')
    try:
        release_file = args.root / 'apps/web/src/features/floor/themes/release-manifest.json'
        errors += check_release_records(json.loads(release_file.read_text()), by_id)
    except (OSError, ValueError):
        errors.append('Missing or malformed release manifest')
    if errors:
        print('\n'.join(errors))
        raise SystemExit(1)
    print(f'PASS: {len(manifests)} complete passive-art packs; thumbnails {thumbnail_bytes} bytes. No legal clearance inferred.')


if __name__ == '__main__': main()
