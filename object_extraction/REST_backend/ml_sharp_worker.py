import os
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.responses import FileResponse
from typing import List
from dotenv import load_dotenv
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / ".env"
# Load the specific .env file
load_dotenv(dotenv_path=ENV_PATH)

app = FastAPI(title="ML-Sharp Worker")

EXPECTED_TOKEN = os.getenv("WORKER_SECRET_TOKEN")
if not EXPECTED_TOKEN:
    raise RuntimeError("WORKER_SECRET_TOKEN is not set in the worker's environment!")

async def verify_internal_token(x_secret_token: str = Header(...)):
    if x_secret_token != EXPECTED_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid or missing Internal Token")

# Global model initialization goes here to keep it warm
# model = load_ml_sharp_model()

@app.post("/process-single", dependencies=[Depends(verify_internal_token)])
async def process_single(images: List[UploadFile] = File(...)):
    if len(images) != 1:
        raise HTTPException(status_code=400, detail="ML-Sharp worker only handles exactly 1 image.")
    
    img = images[0]
    print(f"[ML-Sharp] Processing image: {img.filename}")
    
    input_path = f"in_{img.filename}"
    output_ply = f"out_{img.filename}.ply"
    
    try:
        with open(input_path, "wb") as f:
            f.write(await img.read())
            
        # -------------------------------------------------------------
        # YOUR ML-SHARP MODEL LOGIC HERE
        # -------------------------------------------------------------
        with open(output_ply, "w") as f:
            f.write("ascii\nply dummy content from ml-sharp")

        return FileResponse(output_ply, media_type="application/octet-stream")

    finally:
        if os.path.exists(input_path): 
            os.remove(input_path)