# playground_connector

Building a web-based pipeline that allows users to capture physical objects, reconstruct them as Gaussian Splats, store them in a personal gallery, and visualize them in AR directly from a mobile device.

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
