import os
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException, Security
from fastapi.responses import FileResponse
from typing import List
from dotenv import load_dotenv
from pathlib import Path

# Load variables from .env file
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / "backend/.env"
# Load the specific .env file
load_dotenv(dotenv_path=ENV_PATH)

app = FastAPI(title="Gateway API")

# Configuration
ML_SHARP_URL = "http://127.0.0.1:8001/process-single"
FREESPLATTER_URL = "http://127.0.0.1:8002/process-multi"
WORKER_SECRET_TOKEN = os.getenv("WORKER_SECRET_TOKEN")

if not WORKER_SECRET_TOKEN:
    raise RuntimeError("WORKER_SECRET_TOKEN is not set in the environment or .env file!")

def convert_ply_to_sog(ply_path: str, sog_path: str):
    """
    Placeholder function for PLY to SOG conversion.
    Replace this with your actual conversion logic.
    """
    print(f"Converting {ply_path} to {sog_path}...")
    with open(sog_path, "w") as f:
        f.write("Dummy SOG data generated from PLY")

@app.post("/generate-sog")
async def generate_sog(images: List[UploadFile] = File(...)):
    if not images or len(images) == 0:
        raise HTTPException(status_code=400, detail="No images provided.")
    if len(images) > 10:
        raise HTTPException(status_code=400, detail="Too many images provided. Maximum is 10.")

    # Prepare files payload for forwarding
    files_payload = []
    for img in images:
        content = await img.read()
        files_payload.append(("images", (img.filename, content, img.content_type)))

    tmp_ply = f"temp_{os.getpid()}.ply"
    tmp_sog = f"temp_{os.getpid()}.sog"

    # Set up secure header for worker communication
    headers = {"X-Secret-Token": WORKER_SECRET_TOKEN}

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            if len(images) == 1:
                # in single image mode:
                # 1. switch to ml-sharp conda env
                # 2. do segmentation, we need the segmented images as well as the masks
                # 3. run ml-sharp 
                # 4. run post processing based on the .ply files and the masks
                print("Routing single image to ML-Sharp...")
                response = await client.post(ML_SHARP_URL, files=files_payload, headers=headers)
            else:
                # in multi-image mode:
                # 1. switch to freesplatter conda env
                # 2. run freesplatter to generate the .ply files
                # 3. run post processing based on the .ply files and the masks
                print(f"Routing {len(images)} images to FreeSplatter...")
                response = await client.post(FREESPLATTER_URL, files=files_payload, headers=headers)

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Worker error: {response.text}")

        # Save returned .ply bytes
        with open(tmp_ply, "wb") as f:
            f.write(response.content)

        # Convert .ply to .sog
        convert_ply_to_sog(tmp_ply, tmp_sog)

        return FileResponse(
            tmp_sog, 
            media_type="application/octet-stream", 
            filename="output.sog"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        # Local cleanup
        for path in [tmp_ply, tmp_sog]:
            if os.path.exists(path):
                os.remove(path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

'''
curl -X POST "http://localhost:8000/generate-sog" \
     -H "X-Server-Token: my_super_secure_debug_token" \
     -F "images=@../test_images/001.png" 
'''