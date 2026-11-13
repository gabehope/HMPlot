+++
schema = 1
id = "epidemic-network"
category = "animation and simulation"
data = ["contacts"]
interaction = "animate"
source = "complex"
access = "provided"
tracks = ["python", "javascript"]
timeout = 900

[[checks]]
kind = "text"
all = ["Spread through a contact network", "Infected per day"]

[[checks]]
kind = "input"
any = ["range"]

[[checks]]
kind = "interaction"
action = "animate"
+++

`data/people.csv` has 400 people (person, community, x, y: a drawn layout, infected_day: the day they were infected or empty if never, infected_by: who infected them) and `data/contacts.csv` has their 1,172 contacts (source, target). Make an animated view of the epidemic. The left view, titled "Spread through a contact network", draws every contact as a thin grey line and every person as a point at (x, y); as days pass, people turn red on the day they are infected and fade to dark grey 7 days later (recovered), and each transmission (infected_by to person) is drawn as an arrow that appears on its day. The right view, titled "Infected per day", is a line chart of new infections per day with the currently infectious count as a shaded area, and a vertical rule at the current day. A play button animates the days smoothly and a day slider scrubs them; both views stay in sync.
