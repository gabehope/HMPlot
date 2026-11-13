"""The click oracle rejects wrong sums, missing bars and unsupported adapters."""
import tempfile
import unittest
from pathlib import Path

from agenteval.click_drilldown import bar_geometry, compare_totals, sales_totals, check_click_drilldown
from agenteval.tasks import TASKS


class ClickDrilldownTests(unittest.TestCase):
    def test_geometry_is_compared_to_independent_2024_csv_sums(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sales.csv'
            path.write_text('quarter,region,product,revenue_k\n2023-Q1,North,Hardware,999\n'
                            '2024-Q1,North,Hardware,10\n2024-Q2,North,Hardware,20\n'
                            '2024-Q1,South,Hardware,7\n')
            regions, totals = sales_totals(path)
        self.assertEqual(regions, {'North': 30, 'South': 7})
        self.assertEqual(totals, {'all': {'Hardware': 37}, 'North': {'Hardware': 30}, 'South': {'Hardware': 7}})
        svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160">
          <g transform="translate(0 20)">
          <g class="x-tick" transform="translate(50,100)"><text>Hardware</text></g>
          <g class="y-tick" data-value="0" transform="translate(0,100)"/>
          <g class="y-tick" data-value="50" transform="translate(0,0)"/>
          <g clip-path="url(#plot)"><path fill="#3478c7" d="M30 100 L70 100 L70 26 L30 26 Z"/></g>
          </g></svg>'''
        geometry = bar_geometry(svg)
        compare_totals(geometry, totals['all'])
        self.assertEqual(geometry['bars']['Hardware']['y'], 83)
        # Unchanged bars after clicking North cannot pass, nor can an arbitrary image change.
        with self.assertRaises(AssertionError):
            compare_totals(geometry, totals['North'])
        with self.assertRaises(AssertionError):
            compare_totals(geometry, {'Hardware': 37, 'Software': 5})
        with self.assertRaises(AssertionError):
            compare_totals(bar_geometry(svg.replace('M30 100 L70 100 L70 26 L30 26',
                                                   'M30 90 L70 90 L70 16 L30 16')), totals['all'])
        with self.assertRaises(ValueError):
            bar_geometry(svg.replace('L70 26', 'L65 26'))

    def test_catalog_runs_the_targeted_click_oracle_and_other_adapters_are_unknown(self):
        task = next(task for task in TASKS if task['id'] == 'click-drilldown')
        self.assertIn({'kind': 'interaction', 'action': 'click'}, task['checks'])
        self.assertEqual(check_click_drilldown(None, Path('/unused'), 'plotly')['status'], 'unknown')


if __name__ == '__main__':
    unittest.main()
