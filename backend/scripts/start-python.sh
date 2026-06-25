#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ ! -d apps/python-generator/.venv ]; then
  python3 -m venv apps/python-generator/.venv
fi

source apps/python-generator/.venv/bin/activate
pip install -r apps/python-generator/requirements.txt
npm run dev:python
