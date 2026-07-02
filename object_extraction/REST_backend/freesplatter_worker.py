import os
import sys
import uuid
import shutil
import tempfile
from pathlib import Path
from typing import List
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends, BackgroundTasks
from fastapi.responses import FileResponse

# Ensures FreeSplatter/ can be found regardless of how uvicorn is executed
CURRENT_DIR = Path(__file__).resolve().parent
PARENT_DIR = CURRENT_DIR.parent
FREESPLATTER_DIR = PARENT_DIR / "FreeSplatter"
if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))
if str(FREESPLATTER_DIR) not in sys.path:
    sys.path.insert(0, str(FREESPLATTER_DIR))

# Import your pipeline interface functions
from FreeSplatter.my_freesplatter_module_pipeline import create_runner, run_pipeline

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / "backend/.env"
# Load the specific .env file
load_dotenv(dotenv_path=ENV_PATH)

# Use system temp directory for isolated multi-image operations
WORKER_TEMP_DIR = Path(tempfile.gettempdir()) / "freesplatter_worker_tmp"
WORKER_TEMP_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="FreeSplatter Worker")

EXPECTED_TOKEN = os.getenv("WORKER_SECRET_TOKEN")
if not EXPECTED_TOKEN:
    raise RuntimeError("WORKER_SECRET_TOKEN is not set in the worker's environment!")
    
async def verify_internal_token(x_secret_token: str = Header(...)):
    if x_secret_token != EXPECTED_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid or missing Internal Token")

# --- Global Model Warmup ---
# Initialize FreeSplatter once globally on startup so it stays warm in GPU VRAM
print("[FreeSplatter] Pre-loading FreeSplatter runner and bootstrapping precision patches...")
GLOBAL_RUNNER = create_runner(gpu_id="1")


def safe_cleanup_worker_files(*paths: str):
    """
    Path-traversal guarded cleanup ensuring directories and files are only deleted 
    if they sit strictly inside WORKER_TEMP_DIR.
    """
    for path_str in paths:
        if not path_str:
            continue
        file_path = Path(path_str).resolve()
        target_dir = WORKER_TEMP_DIR.resolve()

        if not file_path.exists():
            continue

        if target_dir not in file_path.parents and file_path != target_dir:
            print(f"[SECURITY WARNING] Attempted escaping worker sandbox: {file_path}")
            continue

        try:
            if file_path.is_dir():
                shutil.rmtree(file_path)
                print(f"[FreeSplatter] Cleaned up temp folder: {file_path.name}")
            else:
                file_path.unlink()
                print(f"[FreeSplatter] Cleaned up temp asset: {file_path.name}")
        except Exception as e:
            print(f"[FreeSplatter] Error deleting {file_path.name}: {e}")


@app.post("/process-multi", dependencies=[Depends(verify_internal_token)])
async def process_multi(background_tasks: BackgroundTasks, images: List[UploadFile] = File(...)):
    if not images:
        raise HTTPException(status_code=400, detail="FreeSplatter worker requires at least 1 image.")
        
    req_id = uuid.uuid4()
    print(f"[FreeSplatter] Processing batch of {len(images)} images for request {req_id}.")
    
    task_input_dir = WORKER_TEMP_DIR / f"input_{req_id}"
    task_cache_dir = WORKER_TEMP_DIR / f"cache_{req_id}"
    
    task_input_dir.mkdir(parents=True, exist_ok=True)
    task_cache_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        for img in images:
            destination_path = task_input_dir / img.filename
            with open(destination_path, "wb") as f:
                f.write(await img.read())
                
        print(f"[FreeSplatter] Invoking structural 3D matching calculations...")
        
        ply_out_path = run_pipeline(
            runner=GLOBAL_RUNNER,
            image_dir=str(task_input_dir),
            cache_dir=str(task_cache_dir)
        )
        
        # Robust evaluation check
        final_ply = None
        if ply_out_path and os.path.exists(ply_out_path) and os.path.isfile(ply_out_path):
            final_ply = ply_out_path
        else:
            cached_ply_files = list(task_cache_dir.glob("*.ply")) + list(task_cache_dir.rglob("*.ply"))
            if cached_ply_files:
                final_ply = str(cached_ply_files[0])
                
        if not final_ply:
            raise RuntimeError("FreeSplatter core pipeline failed to output target PLY mesh asset.")

        print(f"[FreeSplatter] Found target PLY asset at: {final_ply}")

        background_tasks.add_task(safe_cleanup_worker_files, str(task_input_dir), str(task_cache_dir))
        return FileResponse(final_ply, media_type="application/octet-stream")

    except Exception as e:
        print(f"[FreeSplatter Pipeline Error]: {str(e)}")
        safe_cleanup_worker_files(str(task_input_dir), str(task_cache_dir))
        raise HTTPException(status_code=500, detail=f"Pipeline internal failure: {str(e)}")