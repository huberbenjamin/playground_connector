# Flask Server Skeleton

## Setup

```bash
python -m venv .venv
source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
python run.py
```

On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

## Routes

- `GET /`
- `GET /health`
- `POST /api/example`

## Run tests

```bash
pytest
```
