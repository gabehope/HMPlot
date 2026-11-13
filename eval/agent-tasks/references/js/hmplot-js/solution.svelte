<script>
  import { Plot, Points, Legend } from 'hmplot';
  import csv from './data/penguins.csv?raw';
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  const rows = lines.map(line => Object.fromEntries(line.split(',').map((value, i) => [headers[i], value]))).filter(row => row.bill_length_mm && row.bill_depth_mm)
    .map(row => ({...row, bill_length_mm: +row.bill_length_mm, bill_depth_mm: +row.bill_depth_mm}));
</script>
<h1>Penguin bills</h1>
<p>Bill length (mm) · Bill depth (mm)</p>
<Plot data={rows} height={530} responsive axes2d x={{label:'Bill length (mm)'}} y={{label:'Bill depth (mm)'}}>
  <Points x="bill_length_mm" y="bill_depth_mm" fill="species" size={8} />
  <Legend channel="fill" label="Species" position="right" />
</Plot>
<p>Adelie · Chinstrap · Gentoo</p>
