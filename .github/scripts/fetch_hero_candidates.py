"""Search Wikimedia Commons for freely licensed Kecak dance photos and download landscape candidates.
Runs on a GitHub Actions runner (which has internet access). Writes hero-candidates/NN.jpg + manifest.json."""
import json, os, re, sys, html, urllib.request, urllib.parse

UA = "IndonesiaArrivalCardAssist-hero-fetch/1.0 (https://allindonesia-arrivalcard.com; info@allindonesia-arrivalcard.com)"
API = "https://commons.wikimedia.org/w/api.php"
OUT = "hero-candidates"
QUERIES = ["Kecak Uluwatu", "Kecak dance", "Tari Kecak", "Kecak fire dance Bali", "Kecak dancers"]
OK_LICENSE = re.compile(r"^(CC BY(-SA)?( \d(\.\d)?)?|CC0|Public domain)", re.I)

def get(params):
    params = dict(params, format="json")
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

titles = []
for q in QUERIES:
    try:
        d = get({"action": "query", "list": "search", "srsearch": q, "srnamespace": 6, "srlimit": 50})
    except Exception as e:
        print("search failed", q, e); continue
    for hit in d.get("query", {}).get("search", []):
        t = hit["title"]
        if t.lower().endswith((".jpg", ".jpeg")) and t not in titles:
            titles.append(t)
print("titles:", len(titles))

cands = []
for i in range(0, len(titles), 50):
    batch = titles[i:i + 50]
    d = get({"action": "query", "prop": "imageinfo", "titles": "|".join(batch),
             "iiprop": "url|size|extmetadata", "iiurlwidth": 2400, "iiextmetadatafilter": "LicenseShortName|Artist|Credit|ImageDescription"})
    for p in d.get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [None])[0]
        if not ii: continue
        w, h = ii.get("width", 0), ii.get("height", 0)
        meta = ii.get("extmetadata", {})
        lic = meta.get("LicenseShortName", {}).get("value", "")
        if w < 1600 or w <= h * 1.15 or not OK_LICENSE.match(lic) or "NC" in lic or "ND" in lic:
            continue
        artist = html.unescape(re.sub(r"<[^>]+>", "", meta.get("Artist", {}).get("value", ""))).strip()
        cands.append({"title": p["title"], "width": w, "height": h, "license": lic, "artist": artist,
                      "page": ii.get("descriptionurl"), "thumb": ii.get("thumburl") or ii.get("url")})
cands.sort(key=lambda c: -c["width"])
cands = cands[:16]
print("candidates:", len(cands))

os.makedirs(OUT, exist_ok=True)
manifest = []
for n, c in enumerate(cands, 1):
    fn = f"{OUT}/{n:02d}.jpg"
    try:
        req = urllib.request.Request(c["thumb"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=120) as r, open(fn, "wb") as f:
            f.write(r.read())
        c["file"] = fn; c["bytes"] = os.path.getsize(fn)
        manifest.append(c); print("saved", fn, c["title"], c["license"], c["width"], "x", c["height"])
    except Exception as e:
        print("download failed", c["title"], e)
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=2)
sys.exit(0 if manifest else 1)
