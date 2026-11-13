"""Independent reference oracles. Read task data and observable DOM, never authored debug state."""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import pandas as pd
from playwright.sync_api import sync_playwright, expect


def check_reference(name: str, run: Path, chrome: str) -> dict:
    checks=[]
    def record(label, operation):
        try:
            operation()
            checks.append({'name':label,'status':'pass'})
        except Exception as error:
            checks.append({'name':label,'status':'fail','detail':repr(error)})
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=chrome,headless=True,args=['--enable-unsafe-webgpu'])
        context=browser.new_context(viewport={'width':1280,'height':1000},device_scale_factor=2)
        context.route('http://**/*',lambda route:route.abort())
        context.route('https://**/*',lambda route:route.abort())
        page=context.new_page()
        page.goto((run/'output/chart.html').as_uri(),wait_until='load')
        def settle():
            report=page.evaluate('() => window.hmplotInspect()')
            assert report['ready'],report['errors']
            return report
        record('completed initial draw without errors',settle)
        page.screenshot(path=str(run/'reference-initial.png'),full_page=True)
        def slider(label,value):
            page.get_by_role('slider',name=label,exact=True).fill(str(value))
            return settle()
        def screen(handle, index, x, y):
            canvas=page.locator('.canvas').nth(index)
            canvas.scroll_into_view_if_needed()
            box=canvas.bounding_box()
            point=page.evaluate('([name,x,y]) => window.referencePlots[name].getScreenMapping()?.project({x,y})',[handle,x,y])
            assert point and point['inside'],(handle,x,y,point)
            return box['x']+point['x'],box['y']+point['y']
        def rectangle(handle,index,x0,y0,x1,y1):
            a=screen(handle,index,x0,y0);b=screen(handle,index,x1,y1)
            page.keyboard.down('Shift')
            page.mouse.move(*a);page.mouse.down();page.mouse.move(*b,steps=16);page.mouse.up()
            page.keyboard.up('Shift')
            return settle()
        if name=='epidemic-network':
            people=pd.read_csv(run/'data/people.csv')
            for day in [0,7,20,int(people.infected_day.max())+8]:
                def verify(day=day):
                    report=slider('Day',day)
                    infection=people.infected_day
                    expected={'Susceptible':int((infection.isna()|(infection>day)).sum()),'Infectious':int(((infection<=day)&(infection>day-7)).sum()),'Recovered':int((infection<=day-7).sum())}
                    for state,count in expected.items():
                        expect(page.locator(f'[data-state="{state}"] b')).to_have_text(str(count))
                    transmissions=int((people.infected_by.notna()&(infection<=day)).sum())
                    expect(page.get_by_test_id('transmissions')).to_have_text(str(transmissions))
                    marks=report['plots'][0]['model']['marks']
                    assert any(m['kind']=='Points' and m['rows']==len(people) for m in marks),marks
                    assert any(m['kind']=='Segments' and m['rows']==transmissions for m in marks),marks
                record(f'infection recovery transmission day {day}',verify)
        elif name=='parallel-coordinates':
            cars=pd.read_csv(run/'data/cars.csv')
            def verify_rows(expected):
                settle()
                expect(page.get_by_test_id('selected-count')).to_have_text(f'{len(expected)} of 406 cars')
                names=page.locator('tbody tr td:first-child').all_text_contents()
                wanted=expected.sort_values(['mpg','model'],ascending=[False,True]).head(10).model.tolist()
                assert names==wanted,(names,wanted)
            record('all cars and descending top ten',lambda:verify_rows(cars))
            def brush():
                box=page.locator('.brush').first.bounding_box()
                page.mouse.move(box['x']+box['width']/2,box['y']+box['height']*.2)
                page.mouse.down();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']*.65,steps=12);page.mouse.up()
                lo=float(page.get_by_label('mpg minimum',exact=True).input_value());hi=float(page.get_by_label('mpg maximum',exact=True).input_value())
                assert lo>cars.mpg.min() and hi<cars.mpg.max()
                expected=cars[cars.mpg.between(lo,hi)]
                verify_rows(expected)
                page.get_by_label('horsepower minimum',exact=True).fill('100');page.get_by_label('horsepower minimum',exact=True).press('Tab')
                verify_rows(expected[expected.horsepower>=100])
                assert float(page.get_by_label('mpg minimum',exact=True).input_value())==lo
                assert page.locator('.interval').count()==2
            record('pointer brush then independent persistent AND brush',brush)
            def empty():
                for label,value in [('mpg minimum','45'),('horsepower minimum','200')]:
                    field=page.get_by_label(label,exact=True);field.fill(value);field.press('Tab')
                verify_rows(cars.iloc[:0]);expect(page.get_by_text('No matching cars.',exact=False)).to_be_visible()
                page.get_by_role('button',name='Reset all brushes').click();verify_rows(cars)
            record('empty result and usable reset',empty)
        elif name=='wealth-health-trails':
            rows=pd.read_csv(run/'data/countries_years.csv')
            featured=rows[rows.year==2020].nlargest(5,'population').country.tolist()
            for year in [1950,1982.5,2020]:
                def verify(year=year):
                    report=slider('Year',year)
                    displayed=page.locator('tbody tr').all_text_contents()
                    assert len(displayed)==5
                    for row in page.locator('tbody tr').all():
                        cells=row.locator('td').all_text_contents();country=cells[0];assert country in featured
                        data=rows[rows.country==country].sort_values('year')
                        for index,key,tolerance in [(1,'gdp_per_capita',.011),(2,'life_expectancy',.011),(3,'population',.51)]:
                            expected=float(np.interp(year,data.year,data[key]));assert abs(float(cells[index])-expected)<=tolerance,(country,key,cells[index],expected)
                    assert any(m['kind']=='Points' and m['rows']==120 for m in report['plots'][0]['model']['marks'])
                record(f'interpolated featured values and all countries at {year}',verify)
        elif name=='zoomable-portfolio':
            rows=pd.read_csv(run/'data/portfolio.csv')
            def verify(expected,metric):
                settle();expect(page.get_by_test_id('total')).to_have_text(f'{expected[metric].sum():.{2 if metric=="revenue_k" else 0}f}')
                names=page.locator('tbody tr td:first-child').all_text_contents()
                assert names==expected.sort_values([metric,'product'],ascending=[False,True]).head(10)['product'].tolist()
            record('root revenue totals and ranking',lambda:verify(rows,'revenue_k'))
            def areas_and_click():
                from PIL import Image
                import io
                palette=['#3686a6','#a97336','#7978ae','#5c986c','#be6964','#658e98']
                pixels=np.asarray(Image.open(io.BytesIO(page.locator('.canvas').screenshot())).convert('RGB')).astype(int)
                masks=[np.max(np.abs(pixels-np.array([int(color[i:i+2],16)for i in (1,3,5)])),axis=2)<=3 for color in palette]
                areas=np.array([m.sum()for m in masks]);expected=rows.groupby('division').revenue_k.sum().values
                assert np.max(np.abs(areas/areas.sum()-expected/expected.sum()))<.01,(areas.tolist(),expected.tolist())
                yy,xx=np.where(masks[-1]);box=page.locator('.canvas').bounding_box()
                page.mouse.click(box['x']+float(np.median(xx))/2,box['y']+float(np.median(yy))/2)
                verify(rows[rows.division=='Division 6'],'revenue_k')
                page.get_by_role('button',name='All divisions',exact=True).click();verify(rows,'revenue_k')
            record('rendered areas proportional to revenue and rectangle click drills down',areas_and_click)
            def navigate():
                page.get_by_role('button',name='Division 1',exact=True).click();subset=rows[rows.division=='Division 1'];verify(subset,'revenue_k')
                page.get_by_label('Area metric').select_option('orders');verify(subset,'orders')
                page.get_by_role('button',name='D1-Team 1',exact=True).click();verify(subset[subset.department=='D1-Team 1'],'orders')
                page.get_by_role('button',name='Up',exact=True).click();verify(subset,'orders')
                page.get_by_role('button',name='All divisions',exact=True).click();verify(rows,'orders')
            record('hierarchy navigation and metric preserves focus',navigate)
        elif name=='rebased-returns':
            rows=pd.read_csv(run/'data/stocks.csv');dates=sorted(rows.date.unique());last=rows[rows.date==dates[-1]].set_index('ticker').close
            def verify(base):
                settle();prices=rows[rows.date==base].set_index('ticker').close
                expect(page.get_by_test_id('base-date')).to_have_text(base)
                for row in page.locator('tbody tr').all():
                    ticker,value=row.locator('td').all_text_contents();assert abs(float(value)-100*last[ticker]/prices[ticker])<.011
            def rebase():
                page.get_by_label('Base trading date').select_option(index=200);verify(dates[200])
                box=page.locator('.canvas').first.bounding_box();page.mouse.move(box['x']+box['width']*.35,box['y']+box['height']*.45)
                chosen=page.get_by_test_id('base-date').inner_text();assert chosen!=dates[200];verify(chosen)
            record('date control and pointer-driven endpoint rebasing',rebase)
        elif name=='bundled-communities':
            people=pd.read_csv(run/'data/people.csv',dtype=str);edges=pd.read_csv(run/'data/contacts.csv',dtype=str);person=people.person.iloc[20]
            expected=sorted(set(edges.loc[edges.source==person,'target'])|set(edges.loc[edges.target==person,'source']))
            def focus():
                page.get_by_label('Focus person',exact=True).select_option(person);settle()
                expect(page.get_by_test_id('focused-person')).to_have_text(person);expect(page.get_by_test_id('degree')).to_have_text(str(len(expected)))
                assert page.get_by_test_id('neighbors').locator('li').all_text_contents()==expected
                for strength in ['0','1']:
                    slider('Bundling strength',strength);expect(page.get_by_test_id('focused-person')).to_have_text(person)
                page.get_by_role('button',name='Reset focus').click();settle();expect(page.get_by_role('heading',name='Community contact matrix')).to_be_visible()
            record('sorted neighborhood, pin persistence through curve changes, reset',focus)
        elif name=='quake-globe':
            rows=pd.read_csv(run/'data/earthquakes.csv');day=(pd.to_datetime(rows.time,utc=True)-pd.Timestamp('2024-01-01',tz='UTC')).dt.total_seconds()/86400
            for end in [30,180,366]:
                def verify(end=end):
                    slider('Window end',end);selected=rows[(day>end-30)&(day<=end)]
                    expect(page.get_by_test_id('count')).to_have_text(f'{len(selected)} earthquakes')
                    expected=np.histogram(selected.depth_km,bins=np.arange(0,721,20))[0].tolist()
                    assert list(map(int,page.locator('tbody tr td:nth-child(2)').all_text_contents()))==expected
                record(f'rolling window and synchronized depth bins at day {end}',verify)
            def rotate():
                before=page.evaluate('window.referencePlots.primary.getViewport()')
                box=page.locator('.canvas').first.bounding_box()
                page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.45);page.mouse.down();page.mouse.move(box['x']+box['width']*.65,box['y']+box['height']*.5,steps=15);page.mouse.up();settle()
                after=page.evaluate('window.referencePlots.primary.getViewport()')
                assert before.get('center')!=after.get('center'),(before,after)
            record('native globe drag changes longitude latitude center',rotate)
        elif name=='flight-network':
            flights=pd.read_parquet(run/'data/flights.parquet');airports=pd.read_csv(run/'data/airports.csv')
            def verify(lo,hi):
                for label,value in [('First hour',lo),('Last hour',hi)]:
                    control=page.get_by_label(label,exact=True);control.fill(str(value));control.press('Tab')
                settle();selected=flights[flights.dep_hour.between(lo,hi)]
                expect(page.get_by_test_id('flight-count')).to_have_text(str(len(selected)))
                counts=selected.groupby('origin').size()
                for row in page.locator('details').nth(0).locator('tbody tr').all():
                    code,count=row.locator('td').all_text_contents();assert int(count)==counts.get(code,0)
                expected=selected.groupby(['origin','dest']).delay_min.agg(['size','mean']).reset_index();expected['key']=expected.origin+' → '+expected.dest
                expected=expected.sort_values(['size','key'],ascending=[False,True]).head(10)
                displayed=page.locator('details').nth(1).locator('tbody tr').all()
                assert len(displayed)==len(expected)
                for row,(_,want) in zip(displayed,expected.iterrows()):
                    key,count,mean=row.locator('td').all_text_contents();assert key==want['key'] and int(count)==want['size'];assert abs(float(mean)-want['mean'])<1e-4
            record('full-data route aggregates and airport totals',lambda:verify(0,23))
            record('selected-hour route aggregates and airport totals',lambda:verify(8,12))
            def brush():
                box=page.locator('.canvas').nth(1).bounding_box();page.mouse.move(box['x']+box['width']*.4,box['y']+box['height']*.5);page.mouse.down();page.mouse.move(box['x']+box['width']*.7,box['y']+box['height']*.5,steps=10);page.mouse.up()
                lo=int(page.get_by_label('First hour',exact=True).input_value());hi=int(page.get_by_label('Last hour',exact=True).input_value());assert (lo,hi)!=(8,12);verify(lo,hi)
            record('departure-hour pointer brush updates the same aggregates',brush)
        elif name=='rent-map-linked':
            rows=pd.read_csv(run/'data/district_rents.csv');edges=np.quantile(rows.median_rent_eur,np.linspace(0,1,6));classes=np.searchsorted(edges[1:-1],rows.median_rent_eur,side='right')
            def verify():
                settle();observed=[int(text.split()[0])for text in page.locator('tbody tr td:nth-child(2)').all_text_contents()]
                assert observed==np.bincount(classes,minlength=5).tolist()
                slope,intercept=np.polyfit(rows.population,rows.median_rent_eur,1)
                assert abs(float(page.get_by_test_id('slope').inner_text())-slope)<.000001
                assert abs(float(page.get_by_test_id('intercept').inner_text())-intercept)<.000001
                district=rows.iloc[10];page.get_by_label('District',exact=True).select_option(district.district);settle();assert district.district in page.get_by_test_id('district-detail').inner_text()
            record('quantile classification, least-squares regression and district detail',verify)
        elif name=='sensor-wall':
            rows=pd.read_parquet(run/'data/readings.parquet');expected={}
            for sensor,group in rows.groupby('sensor'):
                values=group.set_index('time').sort_index().temp_c;rolling=values.rolling('7D',min_periods=24)
                expected[sensor]=(366*24-len(values),int(((values-rolling.mean()).abs()>4*rolling.std()).sum()))
            def verify():
                settle();assert page.locator('.canvas').count()==37
                for row in page.locator('tbody tr').all():
                    sensor,missing,outliers=row.locator('td').all_text_contents();assert (int(missing),int(outliers))==expected[sensor],(sensor,missing,outliers,expected[sensor])
                page.locator('.canvas').last.scroll_into_view_if_needed();box=page.locator('.canvas').last.bounding_box();page.mouse.move(box['x']+box['width']*.3,box['y']+box['height']*.5);page.mouse.down();page.mouse.move(box['x']+box['width']*.55,box['y']+box['height']*.5,steps=12);page.mouse.up();settle()
                lo=int(page.get_by_label('Start day',exact=True).input_value());hi=int(page.get_by_label('End day',exact=True).input_value());assert 0<lo<hi<365
                descriptions=page.locator('.plot-description').all_text_contents()
                page.get_by_role('button',name='Clear range').click();settle();expect(page.get_by_label('Start day',exact=True)).to_have_value('0')
            record('36 panels, missing hours, independent rolling outliers and overview brush',verify)
        elif name=='calendar-anomalies':
            rows=pd.read_parquet(run/'data/readings.parquet');rows['date']=pd.to_datetime(rows.time,utc=True).dt.strftime('%Y-%m-%d')
            def verify(lo,hi):
                for label,value in [('Start date',lo),('End date',hi)]:
                    field=page.get_by_label(label,exact=True);field.fill(value);field.press('Tab')
                report=settle();count=int(rows.date.between(lo,hi).sum());expect(page.get_by_test_id('reading-count')).to_have_text(str(count));assert len(report['plots'])==8
            record('full leap-year contributing readings',lambda:verify('2024-01-01','2024-12-31'))
            record('February 29 inclusive interval',lambda:verify('2024-02-29','2024-02-29'))
            record('multi-day inclusive interval',lambda:verify('2024-06-01','2024-06-30'))
            def hover_day():
                metadata=pd.read_csv(run/'data/sensors.csv');data=rows.merge(metadata[['sensor','region']],on='sensor')
                chosen='2024-02-29';day=59
                page.mouse.move(*screen('calendar0',0,day//7+.45,6-day%7+.45));settle()
                expect(page.locator('caption')).to_have_text(chosen)
                baseline=data[data.date.str.startswith('2024-02')].groupby('region').temp_c.mean()
                daily=data[data.date==chosen].groupby('region').temp_c.agg(['mean','count'])
                for row in page.locator('main > table tbody tr').all():
                    region,mean,anomaly,count=row.locator('td').all_text_contents()
                    assert abs(float(mean)-daily.loc[region,'mean'])<.0001
                    assert abs(float(anomaly)-(daily.loc[region,'mean']-baseline[region]))<.0001
                    assert int(count)==daily.loc[region,'count']
            record('leap-day pointer detail uses fixed monthly baseline outside date lens',hover_day)
        elif name=='streamgraph-lens':
            rows=pd.read_csv(run/'data/channel_traffic.csv')
            def verify(lo,hi):
                for label,value in [('Start date',lo),('End date',hi)]:
                    field=page.get_by_label(label,exact=True);field.fill(value);field.press('Tab')
                settle();selected=rows[rows.date.between(lo,hi)].groupby('channel').sessions.sum().sort_values(ascending=False)
                actual=page.locator('table').nth(1).locator('tbody tr').all()
                assert [(r.locator('td').nth(0).inner_text(),int(r.locator('td').nth(1).inner_text()))for r in actual]==list(selected.items())
            record('full-period inclusive source totals',lambda:verify('2022-01-01','2024-12-31'))
            record('leap-day range totals',lambda:verify('2024-02-29','2024-03-10'))
            def baseline():
                page.get_by_label('Baseline',exact=True).select_option('zero');settle();expect(page.get_by_test_id('interval')).to_have_text('2024-02-29 through 2024-03-10');verify('2024-02-29','2024-03-10')
            record('baseline switching preserves date lens and totals',baseline)
            def lens():
                page.get_by_role('button',name='Clear brush').click();settle()
                a=screen('overview',1,100,10000);b=screen('overview',1,200,10000)
                page.mouse.move(*a);page.mouse.down();page.mouse.move(*b,steps=12);page.mouse.up();settle()
                lo=page.get_by_label('Start date',exact=True).input_value();hi=page.get_by_label('End date',exact=True).input_value()
                assert lo!='2022-01-01' and lo<hi
                verify(lo,hi)
            record('native overview date brush recomputes inclusive range totals',lens)
        elif name=='clustered-expression':
            from scipy.cluster.hierarchy import linkage,leaves_list
            rows=pd.read_csv(run/'data/expression.csv');matrix=rows.pivot(index='gene',columns='sample',values='log2_expression');z=(matrix.values-matrix.values.mean(axis=1,keepdims=True))/matrix.values.std(axis=1,keepdims=True)
            expected=matrix.index[leaves_list(linkage(z,method='average',metric='correlation'))].tolist()
            def verify():
                settle();assert page.get_by_label('Gene',exact=True).locator('option').all_text_contents()==expected
                for gene in [expected[0],expected[20]]:
                    page.get_by_label('Gene',exact=True).select_option(gene);settle();expect(page.get_by_test_id('gene')).to_have_text(gene)
                    values={r['sample']:r['log2_expression']for _,r in rows[rows.gene==gene].iterrows()}
                    for row in page.locator('tbody tr').all():
                        sample,condition,value=row.locator('td').all_text_contents();assert abs(float(value)-values[sample])<.001
            record('independent average-linkage correlation order and linked gene values',verify)
            def cell_hover():
                page.mouse.move(*screen('primary',0,.5,len(expected)-10-.5));settle()
                expect(page.get_by_test_id('gene')).to_have_text(expected[10])
            record('rendered heatmap cell hover selects corresponding clustered gene',cell_hover)
        elif name in {'taxi-explorer','galaxy-slices'}:
            import re
            def count_export():
                svg=page.evaluate("async()=> (await window.referencePlots.counter.exportSVG()).blob.text()")
                from xml.etree import ElementTree as ET
                text=' '.join(''.join(node.itertext()) for node in ET.fromstring(svg).iter() if node.tag.endswith('}text'));numbers=re.findall(r'\b\d[\d,]*\b',text)
                return max(int(n.replace(',',''))for n in numbers)
            if name=='taxi-explorer':
                rows=pd.read_parquet(run/'data/pickups.parquet')
                def verify(hour):
                    slider('Hour',hour);expected=len(rows)if hour==24 else int((rows.hour==hour).sum());actual=count_export();assert actual==expected,(actual,expected)
                record('all million rows and exact full count',lambda:verify(24))
                record('hour filter exact selected count',lambda:verify(12))
                def brush():
                    slider('Hour',24)
                    rectangle('scatter',1,4,10,12,30)
                    expected=int((rows.distance_km.between(4,12)&rows.fare_usd.between(10,30)).sum())
                    actual=count_export();assert actual==expected,(actual,expected)
                    slider('Hour',12)
                    expected=int((rows.distance_km.between(4,12)&rows.fare_usd.between(10,30)&(rows.hour==12)).sum())
                    actual=count_export();assert actual==expected,(actual,expected)
                record('scatter rectangle and hour filter combine with exact membership',brush)
            else:
                rows=pd.read_parquet(run/'data/stars.parquet')
                def verify(height):
                    slider('Maximum height',height);assert count_export()==int((rows.z_kpc.abs()<=height).sum())
                record('all 200000 stars',lambda: (_ for _ in ()).throw(AssertionError('wrong star count')) if count_export()!=200000 else None)
                record('height filtering exact count',lambda:verify(2))
                def brush():
                    report=rectangle('face',1,-5,-5,5,5)
                    visible=rows[rows.z_kpc.abs()<=2]
                    expected=int((visible.x_kpc.between(-5,5)&visible.y_kpc.between(-5,5)).sum())
                    marks=[m['rows']for m in report['plots'][0]['model']['marks']if m['kind']=='Points']
                    assert sorted(marks)==sorted([expected,len(visible)-expected]),(marks,expected,len(visible))
                record('face-on brush partitions full height-filtered 3D cloud',brush)
        else:
            checks.append({'name':'task semantics','status':'unknown','detail':'No independent oracle implemented yet.'})
        page.screenshot(path=str(run/'reference-interaction.png'),full_page=True)
        browser.close()
    report={'schema':1,'task':name,'checks':checks,'reviewer':{'kind':'deterministic','source':'agenteval/web_reference_checks.py'},'visual_review':'pending'}
    (run/'reference-checks.json').write_text(json.dumps(report,indent=2)+'\n')
    return report
