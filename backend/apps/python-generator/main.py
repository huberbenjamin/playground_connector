import hmac
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="SOG Generator", version="1.0.0")

WORKER_SECRET_HEADER = "X-Server-Token"


def get_expected_worker_token() -> str:
    token = os.environ.get("WORKER_SECRET_TOKEN")
    if not token:
        raise HTTPException(
            status_code=500,
            detail="WORKER_SECRET_TOKEN is not configured on the Python service",
        )
    return token


async def verify_worker_token(
    x_worker_secret_token: str = Header(alias=WORKER_SECRET_HEADER),
) -> None:
    expected = get_expected_worker_token()
    if not hmac.compare_digest(x_worker_secret_token, expected):
        raise HTTPException(status_code=401, detail="Invalid worker secret token")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-sog", dependencies=[Depends(verify_worker_token)])
async def generate_sog(images: List[UploadFile] = File(...)):
    print("hello world")
    return {"sogFile": None}
