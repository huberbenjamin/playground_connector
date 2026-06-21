# playground_connector

Building a web-based AR application for creating, storing, and viewing Gaussian Splat objects

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
