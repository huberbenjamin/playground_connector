import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.responses import FileResponse
from typing import List
from dotenv import load_dotenv
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / "backend/.env"

# Load the specific .env file
load_dotenv(dotenv_path=ENV_PATH)

app = FastAPI(title="FreeSplatter Worker")

EXPECTED_TOKEN = os.getenv("WORKER_SECRET_TOKEN")
if not EXPECTED_TOKEN:
    raise RuntimeError("WORKER_SECRET_TOKEN is not set in the worker's environment!")

async def verify_internal_token(x_secret_token: str = Header(...)):
    if x_secret_token != EXPECTED_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid or missing Internal Token")

# Global model initialization goes here to keep it warm
# model = load_freesplatter_model()

@app.post("/process-multi", dependencies=[Depends(verify_internal_token)])
async def process_multi(images: List[UploadFile] = File(...)):
    print(f"[FreeSplatter] Processing {len(images)} images.")
    
    batch_dir = f"batch_{os.getpid()}"
    os.makedirs(batch_dir, exist_ok=True)
    output_ply = os.path.join(batch_dir, "output.ply")
    
    try:
        for img in images:
            with open(os.path.join(batch_dir, img.filename), "wb") as f:
                f.write(await img.read())
                
        # -------------------------------------------------------------
        # YOUR FREESPLATTER MODEL LOGIC HERE
        # -------------------------------------------------------------
        with open(output_ply, "w") as f:
            f.write("ascii\nply dummy content from freesplatter")

        return FileResponse(output_ply, media_type="application/octet-stream")

    finally:
        pass