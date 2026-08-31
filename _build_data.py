import csv
import glob
import json
import os
from datetime import datetime

folder = os.path.join(os.path.dirname(__file__), "Vorlagen")
out_path = os.path.join(os.path.dirname(__file__), "data.js")

plaene = []
for path in glob.glob(os.path.join(folder, "*.csv")):
    text = open(path, "rb").read().decode("utf-8-sig")
    rows = list(csv.reader(text.splitlines(), delimiter=";"))
    start = rows[0][0].strip()
    end = rows[1][0].strip()
    day_nums = []
    for i, c in enumerate(rows[0]):
        if i >= 5 and c.strip().isdigit():
            day_nums.append((i, int(c.strip())))
    weekdays = [rows[1][i].strip() for i, _ in day_nums]
    d0 = datetime.strptime(start, "%d.%m.%Y")
    people = []
    i = 2
    while i < len(rows):
        row = rows[i]
        if len(row) > 4 and row[4].strip() == "P" and row[0].strip():
            last = row[0].strip()
            first = rows[i + 1][0].strip() if i + 1 < len(rows) else ""
            days = []
            for col, num in day_nums:
                code = row[col].strip() if col < len(row) else ""
                wd = weekdays[num - 1] if num - 1 < len(weekdays) else ""
                days.append({"day": num, "weekday": wd, "code": code})
            people.append(
                {
                    "last": last,
                    "first": first,
                    "soll": row[1].strip(),
                    "ist": row[2].strip(),
                    "urlaub": row[3].strip(),
                    "days": days,
                }
            )
            i += 4
        else:
            i += 1
    plaene.append(
        {
            "file": os.path.basename(path),
            "start": start,
            "end": end,
            "year": d0.year,
            "month": d0.month,
            "people": people,
        }
    )

plaene.sort(key=lambda p: (p["year"], p["month"]))
bundle = []
for p in plaene:
    jan = next((x for x in p["people"] if x["last"] == "Bitzer"), None)
    bundle.append(
        {
            "file": p["file"],
            "start": p["start"],
            "end": p["end"],
            "year": p["year"],
            "month": p["month"],
            "person": {
                "last": jan["last"],
                "first": jan["first"],
                "soll": jan["soll"],
                "ist": jan["ist"],
                "urlaub": jan["urlaub"],
            }
            if jan
            else None,
            "days": jan["days"] if jan else [],
            "team": [
                {
                    "first": x["first"],
                    "last": x["last"],
                    "codes": [d["code"] for d in x["days"]],
                }
                for x in p["people"]
                if not jan or x["last"] != jan["last"] or x["first"] != jan["first"]
            ],
        }
    )

js = "window.BUNDLED_PLAENE = " + json.dumps(bundle, ensure_ascii=False, indent=2) + ";\n"
open(out_path, "w", encoding="utf-8").write(js)
print("wrote", len(bundle), "months", "bytes", len(js))
