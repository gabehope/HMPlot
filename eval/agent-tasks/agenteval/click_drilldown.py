"""Numeric click oracle for the sales drilldown; no screenshot-difference success heuristic.

The initial adapter reads HMPlot's exported vector geometry. Unsupported renderers remain
unknown until they have a geometry adapter; they never pass merely because pixels changed.
"""
from __future__ import annotations

import base64
import csv
import math
import re
import shutil
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

from PIL import Image

NS = '{http://www.w3.org/2000/svg}'
NUMBER = r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?'


def sales_totals(path: Path):
    regions, products = defaultdict(float), defaultdict(lambda: defaultdict(float))
    with path.open(newline='') as stream:
        for row in csv.DictReader(stream):
            if row['quarter'].startswith('2024-'):
                amount = float(row['revenue_k'])
                regions[row['region']] += amount
                products['all'][row['product']] += amount
                products[row['region']][row['product']] += amount
    return dict(regions), {key: dict(value) for key, value in products.items()}


def bar_geometry(svg: str):
    """Read vertical rectangular bar paths and linear tick positions, including translations."""
    root = ET.fromstring(svg)
    xticks, yticks, bars = [], [], []

    def walk(node, tx=0., ty=0., clipped=False):
        transform = node.get('transform', '')
        if transform:
            match = re.fullmatch(r'translate\(\s*(' + NUMBER + r')[ ,]+(' + NUMBER + r')\s*\)', transform)
            # Text rotations do not affect the tick anchors or the bar paths.
            if match:
                tx += float(match[1]); ty += float(match[2])
        classes = node.get('class', '').split()
        if 'x-tick' in classes:
            xticks.append((''.join(node.itertext()).strip(), tx))
        if 'y-tick' in classes:
            yticks.append((float(node.attrib['data-value']), ty))
        clipped = clipped or bool(node.get('clip-path'))
        if clipped and node.tag == NS + 'path' and node.get('fill', 'none') != 'none':
            coords = [float(x) for x in re.findall(NUMBER, node.attrib['d'])]
            if len(coords) != 8 or not re.fullmatch(r'[MLZmlz\s\d.,+eE-]+', node.attrib['d']):
                raise ValueError('Click oracle needs rectangular vertical bar geometry')
            xs, ys = coords[::2], coords[1::2]
            if len(set(xs)) != 2 or len(set(ys)) != 2:
                raise ValueError('Click oracle needs rectangular vertical bars')
            bars.append({'x': tx + (min(xs) + max(xs)) / 2,
                         'y': ty + (min(ys) + max(ys)) / 2,
                         'height': max(ys) - min(ys), 'bottom': ty + max(ys),
                         'width': max(xs) - min(xs)})
        for child in node:
            walk(child, tx, ty, clipped)
    walk(root)
    if len(yticks) < 2 or not xticks or not bars:
        raise ValueError('Missing bars or numeric/category ticks')
    low, high = min(yticks), max(yticks)
    slope = abs((high[1] - low[1]) / (high[0] - low[0]))
    zero = low[1] - low[0] * (high[1] - low[1]) / (high[0] - low[0])
    result = {}
    for bar in bars:
        label = min(xticks, key=lambda tick: abs(tick[1] - bar['x']))[0]
        if label in result:
            raise ValueError('Expected one aggregate bar per category')
        result[label] = {**bar, 'value': bar['height'] / slope, 'pixels_per_unit': slope,
                         'baseline_error_px': abs(bar['bottom'] - zero)}
    return {'width': float(root.attrib['width']), 'height': float(root.attrib['height']), 'bars': result}


def compare_totals(geometry, expected):
    if set(geometry['bars']) != set(expected):
        raise AssertionError(f"Bar categories {list(geometry['bars'])}; expected {list(expected)}")
    for label, value in expected.items():
        bar = geometry['bars'][label]
        # Fractional CSS layout and integer GPU viewports differ by subpixel rounding.
        error_px = abs(bar['value'] - value) * bar['pixels_per_unit']
        if bar['baseline_error_px'] > .75:
            raise AssertionError(f'{label}: bar baseline does not meet zero')
        if not math.isfinite(error_px) or error_px > .75:
            raise AssertionError(f'{label}: rendered {bar["value"]:.4f}, expected {value:.4f} ({error_px:.3f}px error)')


def check_click_drilldown(page, folder: Path, library: str):
    if not library.startswith('hmplot'):
        return {'status': 'unknown', 'detail': 'No click-drilldown geometry adapter for ' + library}
    regions, totals = sales_totals(folder / 'data/sales.csv')
    snapshots = []
    try:
        page.wait_for_function("""() => document.querySelectorAll('.canvas').length === 2 &&
            [...document.querySelectorAll('.canvas')].every(n => n.getAttribute('aria-busy') === 'false') &&
            !document.querySelector('#hmplot-root.hmplot-loading')""", timeout=60000)
        ids = page.evaluate("""() => {
          const result = {}; const visit = n => {if(n.kind === 'Plot') result[n.props.title] = n.id;
            (n.children ?? []).forEach(visit)};
          visit(JSON.parse(document.getElementById('hmplot-state').textContent).state.root); return result;
        }""")
        hosts = page.locator('[data-export-host]')

        def capture(name, target):
            deadline = time.monotonic() + 30
            while True:
                try:
                    pair = []
                    for title in ('Revenue by region', 'Revenue by product'):
                        exported = page.evaluate("async id => await hmplotExport('export_svg', id, {})", ids[title])
                        svg = base64.b64decode(exported['payload']).decode()
                        geometry = bar_geometry(svg)
                        compare_totals(geometry, regions if len(pair) == 0 else totals[target])
                        pair.append(geometry)
                    break
                except Exception:
                    if time.monotonic() >= deadline:
                        raise
                    page.wait_for_timeout(100)
            image_path = folder / f'click-{name}.png'
            page.screenshot(path=str(image_path), full_page=True)
            if name == 'north':
                shutil.copy2(image_path, folder / 'after.png')
            # Verify the live canvas also visibly paints each exported bar's interior (DPR 2).
            with Image.open(image_path) as image:
                for index, geometry in enumerate(pair):
                    box = hosts.nth(index).bounding_box()
                    for label, bar in geometry['bars'].items():
                        x = box['x'] + bar['x'] * box['width'] / geometry['width']
                        y = box['y'] + bar['y'] * box['height'] / geometry['height']
                        pixel = image.convert('RGB').getpixel((round(x * 2), round(y * 2)))
                        if max(pixel) - min(pixel) < 15:
                            raise AssertionError(f'{name}: {label} has no visible colored bar at its geometry center')
            snapshots.append({'step': name, 'expected': totals[target], 'geometry': pair})
            return pair[0]

        source = capture('initial', 'all')

        def click(label):
            box = hosts.first.bounding_box()
            bar = source['bars'][label]
            page.mouse.click(box['x'] + bar['x'] * box['width'] / source['width'],
                             box['y'] + bar['y'] * box['height'] / source['height'])

        click('North'); source = capture('north', 'North')
        click('South'); source = capture('south', 'South')
        click('South'); source = capture('repeat', 'all')
        click('North'); source = capture('before-background', 'North')
        # Empty plot interior above the bars, away from ticks/title.
        box = hosts.first.bounding_box()
        page.mouse.click(box['x'] + box['width'] - 4, box['y'] + 45)
        capture('background', 'all')
        return {'status': 'pass', 'detail': 'CSV totals match rendered bars through North, South, repeat and background',
                'snapshots': snapshots}
    except Exception as error:
        return {'status': 'fail', 'detail': str(error), 'snapshots': snapshots}
