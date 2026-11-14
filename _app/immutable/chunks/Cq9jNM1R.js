const t=`from datetime import datetime, timedelta, timezone
import hmplot as hm

day = datetime(2024, 10, 1, tzinfo=timezone.utc)
at = lambda n: day + timedelta(days=n)
data = {"task": ["Design", "Build", "Review"], "start": [at(0), at(2), at(6)], "end": [at(3), at(7), at(9)],
        "milestone": [at(2), None, at(8)]}
with hm.Plot(data=data, height=280, axes2d=True, x={"label": "Date", "type": "datetime", "origin": day}) as plot:
    hm.charts.IntervalTimeline(y="task", x0="start", x1="end", milestone="milestone",
                               milestones={"fill": "#20252b"})
plot
`;export{t as default};
