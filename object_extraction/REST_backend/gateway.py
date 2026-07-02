import os
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException, Security, BackgroundTasks
from fastapi.responses import FileResponse
from typing import List
from dotenv import load_dotenv
from pathlib import Path
import uuid
import tempfile
import subprocess
import shutil
import traceback

# Load variables from .env file
BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / "backend" / ".env"
# Load the specific .env file
load_dotenv(dotenv_path=ENV_PATH)

app = FastAPI(title="Gateway API")

# Configuration
ML_SHARP_URL = "http://127.0.0.1:8001/process-single"
FREESPLATTER_URL = "http://127.0.0.1:8002/process-multi"
WORKER_SECRET_TOKEN = os.getenv("WORKER_SECRET_TOKEN")

# use system temp directory for temporary files
TEMP_DIR = Path(tempfile.gettempdir()) / "object_extraction_tmp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

if not WORKER_SECRET_TOKEN:
    raise RuntimeError("WORKER_SECRET_TOKEN is not set in the environment or .env file!")

def convert_ply_to_sog(ply_path: str, sog_path: str) -> None:
    """
    Converts a 3D Gaussian Splatting .ply file to a compressed .sog file
    using the playcanvas/splat-transform CLI tool.
    """
    if not Path(ply_path).is_file():
        raise FileNotFoundError(f"Input PLY file not found at: {ply_path}")
        
    cli_bin = shutil.which("splat-transform")
    
    # 🚨 FIX: Aggressive path hunting to bypass Conda $PATH masking
    if not cli_bin:
        search_paths = [
            Path.home() / ".npm-global" / "bin" / "splat-transform",
            Path.home() / ".local" / "bin" / "splat-transform",
            Path("/usr/local/bin/splat-transform"),
            Path("/opt/node/bin/splat-transform")
        ]
        
        # Search Node Version Manager (NVM) directories
        nvm_base = Path.home() / ".nvm" / "versions" / "node"
        if nvm_base.exists():
            for node_ver in nvm_base.iterdir():
                nvm_bin = node_ver / "bin" / "splat-transform"
                if nvm_bin.is_file():
                    search_paths.append(nvm_bin)
        
        for p in search_paths:
            if p.is_file():
                cli_bin = str(p)
                break

        if not cli_bin:
            raise FileNotFoundError(
                "The 'splat-transform' executable was not found in PATH, ~/.npm-global, or NVM directories. "
                "Make sure it is installed globally via npm and accessible."
            )

    command = [cli_bin, "-q", "-w", ply_path, sog_path]
    
    try:
        print(f"Starting conversion via: {cli_bin}")
        # 🚨 FIX: Capture output so we can see exact Node.js errors if it crashes
        result = subprocess.run(command, check=True, text=True, capture_output=True)
        
        if not Path(sog_path).is_file() or Path(sog_path).stat().st_size == 0:
            raise RuntimeError(f"Splat-transform failed to write file.\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}")
            
        print("Conversion completed successfully!")
        
    except subprocess.CalledProcessError as e:
        print(f"🚨 Splat-transform Node execution failed!")
        print(f"STDOUT: {e.stdout}")
        print(f"STDERR: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"Splat converter tool failure: {e.stderr}")

@app.get("/health")
def health():
    return {"status": "ok"}

def cleanup_temp_files(*paths: str):
    for path_str in paths:
        if not path_str:
            continue
            
        file_path = Path(path_str).resolve()
        target_dir = TEMP_DIR.resolve()

        if not file_path.exists():
            print(f"Cleanup skip: {file_path} does not exist.")
            continue

        if target_dir not in file_path.parents:
            print(f"SECURITY WARNING: Attempted to delete a file outside the temp directory: {file_path}")
            continue

        try:
            file_path.unlink()
            print(f"Securely cleaned up: {file_path.name}")
        except Exception as e:
            print(f"Error deleting secure temp file {file_path.name}: {e}")

@app.post("/generate-sog")
async def generate_sog(background_tasks: BackgroundTasks, images: List[UploadFile] = File(...)):
    if not images or len(images) == 0:
        raise HTTPException(status_code=400, detail="No images provided.")
    if len(images) > 10:
        raise HTTPException(status_code=400, detail="Too many images provided. Maximum is 10.")

    files_payload = []
    for img in images:
        content = await img.read()
        files_payload.append(("images", (img.filename, content, img.content_type)))

    unique_id = uuid.uuid4()
    tmp_ply = str(TEMP_DIR / f"temp_{unique_id}.ply")
    tmp_sog = str(TEMP_DIR / f"temp_{unique_id}.sog")

    headers = {"X-Secret-Token": WORKER_SECRET_TOKEN}

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            if len(images) == 1:
                print("Routing single image to ML-Sharp...")
                response = await client.post(ML_SHARP_URL, files=files_payload, headers=headers)
            else:
                print(f"Routing {len(images)} images to FreeSplatter...")
                response = await client.post(FREESPLATTER_URL, files=files_payload, headers=headers)

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"Worker error: {response.text}")

        with open(tmp_ply, "wb") as f:
            f.write(response.content)

        convert_ply_to_sog(tmp_ply, tmp_sog)

        background_tasks.add_task(cleanup_temp_files, tmp_ply, tmp_sog)

        return FileResponse(
            tmp_sog, 
            media_type="application/octet-stream", 
            filename="output.sog"
        )

    except Exception as e:
        # 🚨 FIX: Force the terminal to print the exact stack trace if it crashes
        print("\n🚨 GATEWAY CRASH INTERCEPTED:")
        traceback.print_exc()
        
        cleanup_temp_files(tmp_ply, tmp_sog)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

'''
curl -X POST "http://localhost:8000/generate-sog" \
     -H "X-Server-Token: my_super_secure_debug_token" \
     -F "images=@../test_images/001.png" \
     -o output.sog

curl -X POST "http://localhost:8000/generate-sog"      -H "X-Server-Token: my_super_secure_debug_token"      -F "images=@/home/ubuntudev/Dropbox/TUM/Subjects/IN2018 Augmented Reality/GroupProject/playground_connector/object_extraction/test_images/001.png" -o output.sog

curl -X POST "https://bucked-fritter-promptly.ngrok-free.dev/generate-sog"      -H "X-Server-Token: my_super_secure_debug_token"      -F "images=@/home/ubuntudev/Dropbox/TUM/Subjects/IN2018 Augmented Reality/GroupProject/playground_connector/object_extraction/test_images/001.png" -o output.sog

curl -X POST "http://localhost:8000/generate-sog" \
     -H "x-secret-token: my_super_secure_debug_token" \
     -F "images=@/home/heavyubuntu/Dropbox/TUM/Subjects/IN2018 Augmented Reality/GroupProject/playground_connector/object_extraction/test_images/001.png" \
     -F "images=@/home/heavyubuntu/Dropbox/TUM/Subjects/IN2018 Augmented Reality/GroupProject/playground_connector/object_extraction/test_images/002.png" \
     -F "images=@/home/heavyubuntu/Dropbox/TUM/Subjects/IN2018 Augmented Reality/GroupProject/playground_connector/object_extraction/test_images/003.png" \
     -F "images=@/home/heavyubuntu/Dropbox/TUM/Subjects/IN2018 Augmented Reality/GroupProject/playground_connector/object_extraction/test_images/004.png" \
     -o output.sog


'''