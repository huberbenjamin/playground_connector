# Flask MindAR SOG Picker Demo

This demo extends the previous MindAR + Spark SOG setup with:

- 6 marker slots
- `maxTrack: 2` by default
- 10+ demo object cards in a bottom expandable drawer
- Demo/Gallery tabs
- Selection-order assignment: first selected object -> marker 0, second -> marker 1, etc.
- Per-marker transforms saved in `localStorage`
- Object assignments saved in `localStorage`

## Required files

Put your files here:

```txt
static/assets/demo/targets.mind
static/assets/demo/object01.sog
static/assets/demo/object02.sog
...
static/assets/demo/object12.sog
```

Optional thumbnails:

```txt
static/assets/demo/thumbs/object01.jpg
static/assets/demo/thumbs/object02.jpg
...
```

If thumbnails are missing, the UI falls back to text placeholders.

## Flask route

Make sure your app has:

```py
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/demo-playground")
def demo_playground():
    return render_template("demo_playground.html")
```

## Notes

- Use one `targets.mind` file containing all 6 marker images.
- Marker index 0 maps to slot 0, marker index 1 maps to slot 1, etc.
- `maxTrack` can stay below the total marker count. It only controls how many markers are tracked at the same time.
- The splat orientation fix remains on each `SplatMesh`: `splat.quaternion.set(1, 0, 0, 0)`.
- User rotation/scale is applied to the marker wrapper group, so transforms stay per marker, not per object.
# Frontend Flask Server Setup

## Setup

```bash
cd frontend
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
python run.py
```

On Windows PowerShell:

```powershell
cd frontend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

## Routes

- `GET /`

## Run tests

```bash
pytest
```