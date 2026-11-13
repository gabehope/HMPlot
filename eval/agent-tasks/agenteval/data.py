"""The tasks' data, generated (seeded, so every run of every library gets the same files).

Nothing here is downloaded and no data file is committed: `ensure(name, folder)` writes one
dataset into a cache folder, and each run directory gets its own read-only copies.
The values are synthetic (the names of places and countries too, apart from the city in
`cafes`), shaped like the real data the prompts describe.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

SYLLABLES = ["al", "bor", "cen", "dra", "el", "fin", "gar", "hol", "is", "jun", "kar", "lan", "mor", "nes",
             "or", "pel", "quin", "ros", "sal", "tor", "ul", "ven", "wes", "xan", "yor", "zan"]


def _names(rng, n, suffixes=("ia", "a", "land", "stan", "ora", "ica", "en", "is")):
    names, seen = [], set()
    while len(names) < n:
        name = "".join(rng.choice(SYLLABLES, rng.integers(2, 4))) + rng.choice(suffixes)
        name = name.capitalize()
        if name not in seen:
            seen.add(name)
            names.append(name)
    return names


def penguins(folder: Path):
    rng = np.random.default_rng(101)
    species = np.repeat(["Adelie", "Chinstrap", "Gentoo"], [152, 68, 124])
    means = {"Adelie": (38.8, 18.3, 190, 3700), "Chinstrap": (48.8, 18.4, 196, 3730), "Gentoo": (47.5, 15.0, 217, 5080)}
    islands = {"Adelie": ["Biscoe", "Dream", "Torgersen"], "Chinstrap": ["Dream"], "Gentoo": ["Biscoe"]}
    rows = []
    for s in species:
        bl, bd, fl, bm = means[s]
        sex = rng.choice(["male", "female"])
        k = 1.04 if sex == "male" else 0.96
        rows.append({"species": s, "island": rng.choice(islands[s]),
                     "bill_length_mm": round(rng.normal(bl * k, 2.6), 1), "bill_depth_mm": round(rng.normal(bd * k, 0.9), 1),
                     "flipper_length_mm": int(rng.normal(fl * k, 6)), "body_mass_g": int(rng.normal(bm * k, 380) // 25 * 25),
                     "sex": sex})
    frame = pd.DataFrame(rows)
    # Two penguins were not measured, and nine have no sex recorded (as in the real dataset).
    frame.loc[[3, 271], ["bill_length_mm", "bill_depth_mm", "flipper_length_mm", "body_mass_g"]] = np.nan
    frame.loc[[8, 9, 10, 11, 47, 178, 218, 256, 268], "sex"] = None
    frame.to_csv(folder / "penguins.csv", index=False)


def city_temperatures(folder: Path):
    rng = np.random.default_rng(102)
    days = pd.date_range("2023-01-01", "2024-12-31", freq="D")
    t = np.arange(len(days))
    frames = []
    for city, mean, amplitude, phase in [("Lisbon", 17.5, 6.5, 0), ("Oslo", 6.0, 10.5, 5), ("Singapore", 27.8, 1.0, 40)]:
        temp = mean - amplitude * np.cos(2 * np.pi * (t - 20 - phase) / 365.25) + rng.normal(0, 1.8, len(t))
        frames.append(pd.DataFrame({"date": days.strftime("%Y-%m-%d"), "city": city, "temperature_c": temp.round(1)}))
    pd.concat(frames).to_csv(folder / "city_temperatures.csv", index=False)


def reaction_times(folder: Path):
    rng = np.random.default_rng(103)
    n = 10_000
    fast = rng.lognormal(np.log(320), 0.18, int(n * 0.7))
    slow = rng.lognormal(np.log(520), 0.22, n - len(fast))
    values = np.concatenate([fast, slow])
    rng.shuffle(values)
    pd.DataFrame({"trial": np.arange(1, n + 1), "reaction_ms": values.round(1)}).to_csv(folder / "reaction_times.csv", index=False)


def stations(folder: Path):
    rng = np.random.default_rng(104)
    rows = []
    for region, base_temp, lapse, precip in [("North", 4, 6.0, 900), ("South", 16, 6.5, 500), ("East", 10, 5.5, 650), ("West", 11, 6.2, 1300)]:
        elevation = rng.gamma(2.0, 350, 150)
        temp = base_temp - lapse * elevation / 1000 + rng.normal(0, 1.2, 150)
        rows.append(pd.DataFrame({"station": [f"{region[0]}{i:03d}" for i in range(150)], "region": region,
                                  "elevation_m": elevation.round(0), "mean_temp_c": temp.round(2),
                                  "precip_mm": (precip + 0.4 * elevation + rng.normal(0, 120, 150)).round(0)}))
    pd.concat(rows).to_csv(folder / "stations.csv", index=False)


def cars(folder: Path):
    rng = np.random.default_rng(105)
    n = 406
    origin = rng.choice(["USA", "Europe", "Japan"], n, p=[0.62, 0.17, 0.21])
    year = rng.integers(1970, 1983, n)
    weight = np.where(origin == "USA", rng.normal(1550, 330, n), rng.normal(1050, 180, n)).clip(750, 2300)
    # Calibrated to Auto MPG's spread (about 46-230 hp, 9-47 mpg) with few rows at the clips: an
    # mpg intercept of 58 put a fifth of the cars at exactly 47, which reviewers read as a chart
    # clamping its data.
    horsepower = (0.075 * weight + 5 + rng.normal(0, 14, n) - 0.9 * (year - 1970)).clip(46, 230)
    mpg = (44 - 0.014 * weight - 0.04 * horsepower + 0.6 * (year - 1970) + rng.normal(0, 2.4, n)).clip(9, 47)
    models = [f"{o[:2].upper()}-{y % 100}{i:03d}" for i, (o, y) in enumerate(zip(origin, year))]
    pd.DataFrame({"model": models, "origin": origin, "year": year, "horsepower": horsepower.round(0),
                  "mpg": mpg.round(1), "weight_kg": weight.round(0)}).to_csv(folder / "cars.csv", index=False)


def flights(folder: Path):
    rng = np.random.default_rng(106)
    k = 40
    codes = []
    while len(codes) < k:
        code = "".join(rng.choice(list("ABCDEFGHIJKLMNOPRSTUVWXYZ"), 3))
        if code not in codes:
            codes.append(code)
    lon = rng.uniform(-122, -71, k)
    lat = rng.uniform(26, 48, k) - 0.06 * (lon + 96)
    size = rng.pareto(1.2, k) + 1
    airports = pd.DataFrame({"code": codes, "name": [f"{n} Regional" if s < 2 else f"{n} International"
                                                     for n, s in zip(_names(rng, k, ("ton", "ville", "field", " City", "burg", " Falls")), size)],
                             "lon": lon.round(3), "lat": lat.round(3)})
    airports.to_csv(folder / "airports.csv", index=False)
    n = 200_000
    weights = size / size.sum()
    origin = rng.choice(k, n, p=weights)
    dest = (origin + rng.integers(1, k, n)) % k
    dx = (lon[origin] - lon[dest]) * 85
    dy = (lat[origin] - lat[dest]) * 111
    distance = np.hypot(dx, dy)
    hour = rng.choice(np.arange(5, 24), n)
    delay = rng.gamma(1.4, 9, n) - 12 + 0.9 * (hour - 5) + rng.normal(0, 4, n) + 0.004 * distance
    pd.DataFrame({"flight_id": np.arange(n), "origin": np.array(codes)[origin], "dest": np.array(codes)[dest],
                  "dep_hour": hour.astype(np.int8), "distance_km": distance.round(0).astype(np.float32),
                  "delay_min": delay.round(1).astype(np.float32)}).to_parquet(folder / "flights.parquet", index=False)


def countries(folder: Path):
    rng = np.random.default_rng(107)
    k = 160
    continent = rng.choice(["Africa", "Americas", "Asia", "Europe", "Oceania"], k, p=[0.3, 0.2, 0.27, 0.18, 0.05])
    base = {"Africa": 7.6, "Americas": 9.2, "Asia": 8.9, "Europe": 10.2, "Oceania": 9.4}
    log_gdp = np.array([base[c] for c in continent]) + rng.normal(0, 0.8, k)
    gdp = np.exp(log_gdp)
    life = (50 + 6.4 * (log_gdp - 6.5) + rng.normal(0, 3, k)).clip(45, 85)
    pop = np.exp(rng.normal(16, 1.6, k))
    pd.DataFrame({"country": _names(rng, k), "continent": continent, "gdp_per_capita": gdp.round(0),
                  "life_expectancy": life.round(1), "population": pop.round(0).astype(np.int64)}).to_csv(folder / "countries.csv", index=False)


def countries_years(folder: Path):
    rng = np.random.default_rng(108)
    k = 120
    names = _names(rng, k)
    continent = rng.choice(["Africa", "Americas", "Asia", "Europe", "Oceania"], k, p=[0.3, 0.2, 0.27, 0.18, 0.05])
    start = rng.normal(7.4, 0.7, k)
    growth = rng.normal(0.022, 0.01, k)
    pop0 = np.exp(rng.normal(15.5, 1.5, k))
    rows = []
    for year in range(1950, 2021, 5):
        log_gdp = start + growth * (year - 1950) + rng.normal(0, 0.04, k)
        life = (35 + 6.8 * (log_gdp - 6.0) + 0.12 * (year - 1950) + rng.normal(0, 1.2, k)).clip(30, 85)
        pop = pop0 * np.exp(0.017 * (year - 1950))
        rows.append(pd.DataFrame({"country": names, "continent": continent, "year": year, "gdp_per_capita": np.exp(log_gdp).round(0),
                                  "life_expectancy": life.round(1), "population": pop.round(0).astype(np.int64)}))
    pd.concat(rows).to_csv(folder / "countries_years.csv", index=False)


def earthquakes(folder: Path):
    rng = np.random.default_rng(109)
    n = 20_000
    # Along a few arcs, like plate boundaries.
    arcs = [((-180, 50), (-140, 60), (-120, 35)), ((120, 10), (140, 35), (160, 55)), ((-80, -50), (-75, -20), (-80, 10)),
            ((20, 35), (60, 30), (95, 25)), ((95, -10), (120, -8), (150, -6)), ((-30, -60), (-15, 0), (-30, 60))]
    which = rng.integers(0, len(arcs), n)
    t = rng.uniform(0, 1, n)
    lon = np.empty(n)
    lat = np.empty(n)
    for i, (a, b, c) in enumerate(arcs):
        m = which == i
        u = t[m]
        lon[m] = (1 - u) ** 2 * a[0] + 2 * (1 - u) * u * b[0] + u**2 * c[0]
        lat[m] = (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * b[1] + u**2 * c[1]
    lon = ((lon + rng.normal(0, 2.5, n) + 180) % 360) - 180
    lat = (lat + rng.normal(0, 2.5, n)).clip(-85, 85)
    magnitude = (2.5 + rng.exponential(0.65, n)).clip(2.5, 8.9)
    depth = rng.gamma(1.3, 45, n).clip(0, 700)
    time = pd.Timestamp("2024-01-01") + pd.to_timedelta(rng.uniform(0, 366, n), unit="D")
    pd.DataFrame({"time": time.strftime("%Y-%m-%dT%H:%M:%S"), "lon": lon.round(3), "lat": lat.round(3),
                  "depth_km": depth.round(1), "magnitude": magnitude.round(1)}).sort_values("time").to_csv(folder / "earthquakes.csv", index=False)


def taxi(folder: Path, n: int = 1_000_000, name: str = "pickups.parquet", seed: int = 110):
    rng = np.random.default_rng(seed)
    centers = np.array([[0, 0], [3.5, 1.2], [-2.5, 3.0], [8.0, -6.0], [-6.0, -4.5]])
    weights = np.array([0.45, 0.2, 0.15, 0.1, 0.1])
    which = rng.choice(len(centers), n, p=weights)
    spread = np.array([1.2, 0.8, 1.0, 0.5, 2.0])[which]
    x = centers[which, 0] + rng.normal(0, 1, n) * spread
    y = centers[which, 1] + rng.normal(0, 1, n) * spread
    distance = rng.gamma(2.0, 2.2, n) + 0.3 * np.hypot(x, y)
    fare = 3.0 + 1.9 * distance + rng.gamma(1.5, 1.2, n)
    hourly = np.r_[np.full(6, 0.012), np.full(6, 0.05), np.full(6, 0.055), np.full(6, 0.04)]
    hour = rng.choice(24, n, p=hourly / hourly.sum())
    pd.DataFrame({"x_km": x.astype(np.float32), "y_km": y.astype(np.float32), "fare_usd": fare.round(2).astype(np.float32),
                  "distance_km": distance.round(2).astype(np.float32), "hour": hour.astype(np.int8)}).to_parquet(folder / name, index=False)


def taxi_10m(folder: Path):
    taxi(folder, n=10_000_000, name="pickups_10m.parquet", seed=111)


def districts(folder: Path):
    rng = np.random.default_rng(112)
    # Hexagonal districts around Lisbon (lon/lat).
    lon0, lat0, r = -9.14, 38.72, 0.012
    features, rows = [], []
    k = 0
    for q in range(-5, 6):
        for s in range(-4, 5):
            cx = lon0 + 1.5 * r * q * 1.27
            cy = lat0 + np.sqrt(3) * r * (s + q / 2)
            ring = [[round(cx + r * 1.27 * np.cos(np.pi / 3 * j), 5), round(cy + r * np.sin(np.pi / 3 * j), 5)] for j in range(7)]
            name = f"D{k:02d}"
            features.append({"type": "Feature", "properties": {"district": name},
                             "geometry": {"type": "Polygon", "coordinates": [ring]}})
            dist = np.hypot(cx - lon0, cy - lat0)
            rows.append({"district": name, "median_rent_eur": round(float(1650 - 9000 * dist + rng.normal(0, 90)), 0),
                         "population": int(rng.integers(3000, 22000))})
            k += 1
    (folder / "districts.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    pd.DataFrame(rows).to_csv(folder / "district_rents.csv", index=False)


def cafes(folder: Path):
    rng = np.random.default_rng(113)
    n = 300
    lon = -9.14 + rng.normal(0, 0.025, n)
    lat = 38.715 + rng.normal(0, 0.015, n)
    pd.DataFrame({"name": [f"Café {i:03d}" for i in range(n)], "lon": lon.round(5), "lat": lat.round(5),
                  "rating": rng.uniform(2.5, 5, n).round(1)}).to_csv(folder / "cafes.csv", index=False)


def terrain(folder: Path):
    rng = np.random.default_rng(114)
    t = np.linspace(0, 30, 150)
    x, y = np.meshgrid(t, t)
    z = 400 + 900 * np.exp(-((x - 18) ** 2 + (y - 12) ** 2) / 40) + 500 * np.exp(-((x - 8) ** 2 + (y - 22) ** 2) / 25)
    z += 60 * np.sin(x / 2.3) * np.cos(y / 3.1) + rng.normal(0, 6, z.shape)
    pd.DataFrame({"x_km": x.ravel().round(3), "y_km": y.ravel().round(3), "elevation_m": z.ravel().round(1)}).to_csv(folder / "terrain.csv", index=False)


def galaxy(folder: Path):
    rng = np.random.default_rng(115)
    n = 200_000
    r = rng.gamma(2.0, 2.5, n)
    arm = rng.integers(0, 2, n)
    theta = 0.55 * r + np.pi * arm + rng.normal(0, 0.35, n)
    pd.DataFrame({"x_kpc": (r * np.cos(theta)).astype(np.float32), "y_kpc": (r * np.sin(theta)).astype(np.float32),
                  "z_kpc": rng.normal(0, 0.25 + 0.02 * r, n).astype(np.float32),
                  "age_gyr": (rng.gamma(2, 1.2, n) + 0.3 * r).clip(0.01, 13).astype(np.float32)}).to_parquet(folder / "stars.parquet", index=False)


def trial(folder: Path):
    rng = np.random.default_rng(116)
    rows = []
    for group, effect in [("Placebo", 0.0), ("Low dose", 4.0), ("High dose", 9.0)]:
        for subject in range(40):
            baseline = rng.normal(50, 8)
            slope = effect / 28 + rng.normal(0, 0.08)
            for day in range(0, 29, 4):
                rows.append({"subject": f"{group[0]}{subject:02d}", "group": group, "day": day, "baseline": round(baseline, 1),
                             "response": round(baseline - slope * day * (1 - np.exp(-day / 10)) * 2 + rng.normal(0, 2.0), 1)})
    pd.DataFrame(rows).to_csv(folder / "trial.csv", index=False)


def sales(folder: Path):
    rng = np.random.default_rng(117)
    rows = []
    base = {"North": 420, "South": 310, "East": 520, "West": 380}
    mix = {"Hardware": 0.45, "Software": 0.35, "Services": 0.20}
    for q, quarter in enumerate([f"{y}-Q{k}" for y in (2023, 2024) for k in range(1, 5)]):
        for region, size in base.items():
            for product, share in mix.items():
                trend = 1 + 0.03 * q * (1.6 if product == "Software" else 0.6 if product == "Hardware" else 1.0)
                season = 1 + 0.08 * np.sin(2 * np.pi * (q % 4) / 4)
                rows.append({"quarter": quarter, "region": region, "product": product,
                             "revenue_k": round(size * share * trend * season * rng.normal(1, 0.06), 1)})
    pd.DataFrame(rows).to_csv(folder / "sales.csv", index=False)


def stocks(folder: Path):
    rng = np.random.default_rng(118)
    days = pd.bdate_range("2023-01-02", "2024-12-31")
    frames = []
    for ticker, start, drift, vol in [("ALDR", 42.0, 0.0006, 0.017), ("BRNX", 118.0, 0.0002, 0.012),
                                      ("CYPT", 23.5, 0.0011, 0.028), ("DOVA", 76.0, -0.0001, 0.015)]:
        steps = rng.normal(drift, vol, len(days))
        if ticker == "ALDR":
            # A sharp drop and slow recovery in spring 2024 (the annotated-line task's shaded band).
            spring = (days >= "2024-03-01") & (days <= "2024-05-31")
            steps[spring] -= 0.004
        close = start * np.exp(np.cumsum(steps))
        volume = rng.lognormal(np.log(2.0e6 if ticker != "CYPT" else 6.0e6), 0.35, len(days))
        frames.append(pd.DataFrame({"date": days.strftime("%Y-%m-%d"), "ticker": ticker,
                                    "close": close.round(2), "volume": volume.round(0).astype(np.int64)}))
    pd.concat(frames).to_csv(folder / "stocks.csv", index=False)


def survey(folder: Path):
    rng = np.random.default_rng(119)
    questions = ["I understand our strategy", "My workload is manageable", "I get useful feedback",
                 "I would recommend working here", "Meetings are a good use of time"]
    responses = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]
    rows = []
    for i, question in enumerate(questions):
        lean = [0.6, -0.2, 0.2, 0.5, -0.7][i]
        weights = np.exp(lean * np.arange(-2, 3)) * np.array([0.8, 1.0, 1.1, 1.0, 0.8])
        counts = rng.multinomial(480, weights / weights.sum())
        rows += [{"question": question, "response": r, "count": int(c)} for r, c in zip(responses, counts)]
    pd.DataFrame(rows).to_csv(folder / "survey.csv", index=False)


def budget(folder: Path):
    items = [("Revenue", 1250.0), ("Cost of goods", -480.0), ("Salaries", -310.0), ("Marketing", -95.0),
             ("Rent", -60.0), ("Other income", 35.0), ("Taxes", -85.0)]
    pd.DataFrame(items, columns=["item", "amount_k"]).to_csv(folder / "budget.csv", index=False)


def scores(folder: Path):
    rng = np.random.default_rng(120)
    rows = []
    for school, mean, spread, skew in [("Ashford", 71, 9, 0), ("Brookside", 64, 13, 0), ("Carrow", 78, 7, -4),
                                       ("Dunmore", 58, 11, 3), ("Elmwood", 69, 15, 0), ("Fairview", 74, 10, -2)]:
        hours = rng.gamma(2.2, 2.5, 120)
        score = mean + 1.4 * (hours - 5.5) + rng.normal(0, spread, 120) + skew * rng.exponential(1, 120)
        rows += [{"school": school, "student": f"{school[0]}{i:03d}", "hours_studied": round(h, 1),
                  "score": round(float(np.clip(s, 0, 100)), 1)} for i, (h, s) in enumerate(zip(hours, score))]
    pd.DataFrame(rows).to_csv(folder / "scores.csv", index=False)


def population(folder: Path):
    groups = [f"{a}-{a + 4}" for a in range(0, 85, 5)] + ["85+"]
    rows = []
    for i, group in enumerate(groups):
        base = 3.1e6 * np.exp(-0.0009 * (i * 5) ** 1.9) * (1 + 0.15 * np.exp(-((i - 11) / 2.5) ** 2))
        for sex, factor in (("Male", 1.02 - 0.012 * max(0, i - 10)), ("Female", 0.98 + 0.004 * i)):
            rows.append({"age_group": group, "sex": sex, "population": int(base * factor)})
    pd.DataFrame(rows).to_csv(folder / "population.csv", index=False)


def expression(folder: Path):
    rng = np.random.default_rng(121)
    genes = [f"GENE{i:02d}" for i in range(1, 41)]
    samples = [f"C{i}" for i in range(1, 7)] + [f"T{i}" for i in range(1, 7)]
    modules = rng.integers(0, 4, len(genes))
    effect = np.array([2.2, -1.8, 0.9, 0.0])[modules]
    rows = []
    for g, gene in enumerate(genes):
        level = rng.normal(6, 1.2)
        for sample in samples:
            treated = sample.startswith("T")
            rows.append({"gene": gene, "sample": sample, "condition": "Treated" if treated else "Control",
                         "log2_expression": round(level + (effect[g] if treated else 0) + rng.normal(0, 0.45), 2)})
    pd.DataFrame(rows).to_csv(folder / "expression.csv", index=False)


def weather_monthly(folder: Path):
    rng = np.random.default_rng(122)
    months = pd.date_range("2024-01-01", periods=12, freq="MS")
    rows = []
    for city, mean, amplitude, wet, phase in [("Lisbon", 17.5, 6.0, 95, 0), ("Oslo", 6.5, 10.0, 70, 6), ("Mumbai", 27.5, 2.5, 200, 3)]:
        for m, month in enumerate(months):
            temp = mean - amplitude * np.cos(2 * np.pi * (m - 0.5) / 12) + rng.normal(0, 0.6)
            if city == "Mumbai":
                precip = max(1.0, 650 * np.exp(-((m - 6.5) / 1.3) ** 2) + rng.normal(4, 3))
            else:
                precip = max(2.0, wet * (1 + 0.6 * np.cos(2 * np.pi * (m - phase) / 12)) + rng.normal(0, 12))
            rows.append({"month": month.strftime("%Y-%m"), "city": city, "mean_temp_c": round(temp, 1),
                         "precip_mm": round(precip, 0)})
    pd.DataFrame(rows).to_csv(folder / "weather_monthly.csv", index=False)


def visits(folder: Path):
    rng = np.random.default_rng(123)
    days = pd.date_range("2024-01-01", "2024-12-31", freq="D")
    weekday = np.where(days.dayofweek < 5, 1.0, 0.55)
    growth = 1 + 0.6 * np.arange(len(days)) / len(days)
    spikes = np.where(np.isin(days.strftime("%m-%d"), ["03-14", "06-02", "09-21", "11-29"]), 3.2, 1.0)
    count = rng.poisson(1800 * weekday * growth * spikes)
    pd.DataFrame({"date": days.strftime("%Y-%m-%d"), "visits": count}).to_csv(folder / "visits.csv", index=False)



def contacts(folder: Path):
    """A contact network of 400 people in 8 communities with a drawn layout, and an epidemic over
    it: who infected whom on which day (an SIR run from one seed; about a third never infected)."""
    rng = np.random.default_rng(124)
    n, k = 400, 8
    community = rng.integers(0, k, n)
    angle = 2 * np.pi * community / k
    x = 10 * np.cos(angle) + rng.normal(0, 2.0, n)
    y = 10 * np.sin(angle) + rng.normal(0, 2.0, n)
    edges = set()
    for i in range(n):
        for _ in range(rng.poisson(3.2)):
            same = rng.random() < 0.85
            pool = np.flatnonzero(community == community[i]) if same else np.arange(n)
            j = int(rng.choice(pool))
            if j != i:
                edges.add((min(i, j), max(i, j)))
    edges = sorted(edges)
    neighbours = {i: [] for i in range(n)}
    for a, b in edges:
        neighbours[a].append(b)
        neighbours[b].append(a)
    day = np.full(n, -1)
    source = np.full(n, -1)
    seed = int(np.argmin(np.hypot(x - 10, y)))
    day[seed] = 0
    infectious = {seed: 0}
    for t in range(1, 120):
        new = {}
        for i, start in list(infectious.items()):
            if t - start > 7:
                del infectious[i]
                continue
            for j in neighbours[i]:
                if day[j] < 0 and j not in new and rng.random() < 0.055:
                    new[j] = i
        for j, i in new.items():
            day[j], source[j] = t, i
            infectious[j] = t
        if not infectious:
            break
    names = [f"P{i:03d}" for i in range(n)]
    pd.DataFrame({"person": names, "community": [chr(65 + c) for c in community], "x": x.round(3), "y": y.round(3),
                  "infected_day": np.where(day >= 0, day, np.nan),
                  "infected_by": [names[s] if s >= 0 else "" for s in source]}).to_csv(folder / "people.csv", index=False)
    pd.DataFrame({"source": [names[a] for a, _ in edges], "target": [names[b] for _, b in edges]}).to_csv(folder / "contacts.csv", index=False)


def sensors(folder: Path):
    """Hourly temperatures from 36 sensors in 6 regions through 2024 (316,224 rows), with daily and
    seasonal cycles, sensor drift, a few outages (missing hours) and injected anomalies."""
    rng = np.random.default_rng(125)
    hours = pd.date_range("2024-01-01", "2024-12-31 23:00", freq="h", tz="UTC")
    t = np.arange(len(hours))
    regions = ["North", "South", "East", "West", "Coast", "Highlands"]
    meta, frames = [], []
    for r, region in enumerate(regions):
        base = [6, 18, 11, 12, 14, 3][r]
        for s in range(6):
            sensor = f"{region[:2].upper()}-{s + 1:02d}"
            lat, lon = 45 + r * 1.3 + rng.normal(0, 0.3), 5 + s * 0.4 + rng.normal(0, 0.2)
            seasonal = 9 * -np.cos(2 * np.pi * (t / 24 - 15) / 366)
            daily = 4 * np.sin(2 * np.pi * (t % 24 - 9) / 24)
            temp = base + seasonal + daily + rng.normal(0, 0.8, len(t)) + 0.0004 * t * rng.normal(0, 1)
            anomalous = np.zeros(len(t), bool)
            for _ in range(rng.integers(2, 6)):
                at = rng.integers(0, len(t) - 6)
                temp[at:at + rng.integers(1, 6)] += rng.choice([-1, 1]) * rng.uniform(9, 15)
                anomalous[at:at + 6] = True
            keep = np.ones(len(t), bool)
            for _ in range(rng.integers(0, 3)):
                at = rng.integers(0, len(t) - 200)
                keep[at:at + rng.integers(24, 200)] = False
            frames.append(pd.DataFrame({"sensor": sensor, "time": hours[keep], "temp_c": temp[keep].round(2)}))
            meta.append({"sensor": sensor, "region": region, "lat": round(lat, 4), "lon": round(lon, 4)})
    pd.concat(frames, ignore_index=True).to_parquet(folder / "readings.parquet", index=False)
    pd.DataFrame(meta).to_csv(folder / "sensors.csv", index=False)

def portfolio(folder: Path):
    """360 positive-valued leaves in a division / department / product hierarchy."""
    rng = np.random.default_rng(126)
    rows = []
    for division in range(6):
        for department in range(5):
            for product in range(12):
                rows.append({
                    "division": f"Division {division + 1}",
                    "department": f"D{division + 1}-Team {department + 1}",
                    "product": f"Product {division + 1}-{department + 1}-{product + 1:02d}",
                    "revenue_k": round(float(rng.lognormal(5, 1.1)), 2),
                    "orders": int(rng.integers(20, 3000)),
                    "margin_pct": round(float(rng.uniform(3, 48)), 1),
                })
    pd.DataFrame(rows).to_csv(folder / "portfolio.csv", index=False)


def channel_traffic(folder: Path):
    """Three years of daily sessions from 18 sources, with moving seasonal peaks."""
    rng = np.random.default_rng(127)
    dates = pd.date_range("2022-01-01", "2024-12-31", freq="D")
    t = np.arange(len(dates))
    frames = []
    for channel in range(18):
        seasonal = np.exp(0.7 * np.sin(t * 2 * np.pi / 365.25 + channel * 0.45))
        weekly = 1 + 0.15 * np.cos(t * 2 * np.pi / 7 + channel)
        peak = 1 + 2 * np.exp(-((t - (100 + channel * 53)) / 55) ** 2)
        values = (150 + 55 * channel) * seasonal * weekly * peak * rng.lognormal(0, 0.1, len(t))
        frames.append(pd.DataFrame({"date": dates.strftime("%Y-%m-%d"),
                                    "channel": f"Source {channel + 1:02d}",
                                    "sessions": np.rint(values).astype(np.int64)}))
    pd.concat(frames, ignore_index=True).to_csv(folder / "channel_traffic.csv", index=False)


DATASETS = {
    "penguins": (penguins, ["penguins.csv"]),
    "city_temperatures": (city_temperatures, ["city_temperatures.csv"]),
    "reaction_times": (reaction_times, ["reaction_times.csv"]),
    "stations": (stations, ["stations.csv"]),
    "cars": (cars, ["cars.csv"]),
    "flights": (flights, ["flights.parquet", "airports.csv"]),
    "countries": (countries, ["countries.csv"]),
    "countries_years": (countries_years, ["countries_years.csv"]),
    "earthquakes": (earthquakes, ["earthquakes.csv"]),
    "pickups": (taxi, ["pickups.parquet"]),
    "pickups_10m": (taxi_10m, ["pickups_10m.parquet"]),
    "districts": (districts, ["districts.geojson", "district_rents.csv"]),
    "cafes": (cafes, ["cafes.csv"]),
    "terrain": (terrain, ["terrain.csv"]),
    "stars": (galaxy, ["stars.parquet"]),
    "trial": (trial, ["trial.csv"]),
    "sales": (sales, ["sales.csv"]),
    "stocks": (stocks, ["stocks.csv"]),
    "survey": (survey, ["survey.csv"]),
    "budget": (budget, ["budget.csv"]),
    "scores": (scores, ["scores.csv"]),
    "population": (population, ["population.csv"]),
    "expression": (expression, ["expression.csv"]),
    "weather_monthly": (weather_monthly, ["weather_monthly.csv"]),
    "visits": (visits, ["visits.csv"]),
    "contacts": (contacts, ["people.csv", "contacts.csv"]),
    "sensors": (sensors, ["readings.parquet", "sensors.csv"]),
    "portfolio": (portfolio, ["portfolio.csv"]),
    "channel_traffic": (channel_traffic, ["channel_traffic.csv"]),
}


def ensure(name: str, cache: Path) -> list[Path]:
    """Generate dataset `name` into `cache` (once) and return its files."""
    make, files = DATASETS[name]
    folder = cache / name
    paths = [folder / file for file in files]
    if not all(path.exists() for path in paths):
        tmp = cache / f".{name}.tmp"
        shutil.rmtree(tmp, ignore_errors=True)
        tmp.mkdir(parents=True)
        make(tmp)
        # Read-only: the run directories get hard links to these files.
        for file in tmp.iterdir():
            file.chmod(0o444)
        shutil.rmtree(folder, ignore_errors=True)
        tmp.rename(folder)
    return paths


def place(names: list[str], cache: Path, target: Path) -> list[str]:
    """Copy the datasets into target/data; a run cannot mutate the shared cache."""
    out = target / "data"
    out.mkdir(parents=True, exist_ok=True)
    placed = []
    for name in names:
        for path in ensure(name, cache):
            dest = out / path.name
            if not dest.exists():
                shutil.copy2(path, dest)
                dest.chmod(0o444)
            placed.append(f"data/{path.name}")
    return placed
