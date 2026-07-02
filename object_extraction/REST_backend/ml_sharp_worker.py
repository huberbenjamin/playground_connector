import os
import sys
from PIL import Image
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends
from fastapi.responses import FileResponse
from typing import List
from dotenv import load_dotenv
from pathlib import Path
import tempfile
import io
import subprocess
from fastapi import BackgroundTasks

# Ensures utils/ can be found regardless of how uvicorn is executed
CURRENT_DIR = Path(__file__).resolve().parent
PARENT_DIR = CURRENT_DIR.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(PARENT_DIR))

from utils.segmenter import BackgroundSegmenter
from utils.post_processing import clean_gaussian_with_2d_mask


BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = BASE_DIR / "backend" / ".env"
# Load the specific .env file
load_dotenv(dotenv_path=ENV_PATH)

# use system temp directory for temporary files
WORKER_TEMP_DIR = Path(tempfile.gettempdir()) / "ml_sharp_worker_tmp"
WORKER_TEMP_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="ML-Sharp Worker")

EXPECTED_TOKEN = os.getenv("WORKER_SECRET_TOKEN")
if not EXPECTED_TOKEN:
    raise RuntimeError("WORKER_SECRET_TOKEN is not set in the worker's environment!")

async def verify_internal_token(x_secret_token: str = Header(...)):
    if x_secret_token != EXPECTED_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid or missing Internal Token")

# --- Global Model Warmup ---
# Initialize BiRefNet once globally so it stays warm in GPU VRAM
print("[ML-Sharp] Pre-loading background segmenter model...")
segmenter = BackgroundSegmenter(device="cuda")

def safe_cleanup_worker_files(*paths: str):
    """
    Path-traversal guarded cleanup ensuring files are only deleted 
    if they sit strictly inside WORKER_TEMP_DIR.
    """
    for path_str in paths:
        if not path_str:
            continue
        file_path = Path(path_str).resolve()
        target_dir = WORKER_TEMP_DIR.resolve()

        if not file_path.exists():
            continue

        if target_dir not in file_path.parents:
            print(f"[SECURITY WARNING] Attempted escaping worker sandbox: {file_path}")
            continue

        try:
            file_path.unlink()
            print(f"[ML-Sharp] Cleaned up temp asset: {file_path.name}")
        except Exception as e:
            print(f"[ML-Sharp] Error deleting {file_path.name}: {e}")


def segment_image(img_bytes, segmented_path, mask_path):
    raw_pil_image = Image.open(io.BytesIO(img_bytes))
    clean_object, mask_file = segmenter.remove_background(raw_pil_image)
    
    # Write segmented variations directly to the isolated temp directory
    clean_object.save(segmented_path, "PNG")
    mask_file.save(mask_path, "PNG")

def run_ml_sharp(req_id, output_dir, segmented_path):
    # Create the specific output directory for this prediction task
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"[ML-Sharp] Invoking SHARP CLI for request {req_id}...")

    cmd = [
            "sharp", "predict",
            "-i", segmented_path,
            "-o", str(output_dir),
            "--device", "cuda",
            "--no-render" # Set to --no-render to save processing time inside a backend API
        ]
    
    # Run the command and capture logs if it fails
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    print("[ML-Sharp] CLI execution completed successfully.")

    # find output .ply
    generated_ply_files = list(output_dir.glob("*.ply"))
    if not generated_ply_files:
        # Check deep recursive if it saves inside a subfolder (e.g. predict_uuid/mesh/)
        generated_ply_files = list(output_dir.rglob("*.ply"))
        
    if not generated_ply_files:
        raise FileNotFoundError(f"SHARP CLI ran but no .ply file was found in {output_dir}")
        
    actual_ply_path = generated_ply_files[0]
    print(f"[ML-Sharp] Found target PLY asset at: {actual_ply_path}")
    return actual_ply_path



@app.post("/process-single", dependencies=[Depends(verify_internal_token)])
async def process_single(background_tasks: BackgroundTasks, images: List[UploadFile] = File(...)):
    if len(images) != 1:
        raise HTTPException(status_code=400, detail="ML-Sharp worker only handles exactly 1 image.")
    
    img = images[0]
    print(f"[ML-Sharp] Processing image: {img.filename}")
    
    req_id = uuid.uuid4()
    input_path = str(WORKER_TEMP_DIR / f"input_{req_id}.png")
    segmented_path = str(WORKER_TEMP_DIR / f"segmented_{req_id}.png")
    mask_path = str(WORKER_TEMP_DIR / f"mask_{req_id}.png")
    final_output_ply = str(WORKER_TEMP_DIR / f"clean_output_{req_id}.ply")

    sharp_output_dir = WORKER_TEMP_DIR / f"predict_{req_id}" # -o of ml-sharp
    
    try:
        # Save original incoming image to temp folder
        img_bytes = await img.read()
        with open(input_path, "wb") as f:
            f.write(img_bytes)
            
        # in single image mode:
        # 1. switch to ml-sharp conda env (done in microservice_starter.sh)
        # 2. do segmentation, we need the segmented images as well as the masks
        segment_image(img_bytes, segmented_path, mask_path)

        # 3. run ml-sharp 
        sharp_ply_path = run_ml_sharp(req_id, sharp_output_dir, segmented_path)

        # 4. run post processing based on the .ply files and the masks
        print("[ML-Sharp] Projecting 3D scene elements to 2D space for background filtering...")
        success = clean_gaussian_with_2d_mask(
            ply_path=str(sharp_ply_path),
            mask_path=mask_path,
            output_path=final_output_ply,
            mask_threshold=15,  
            dilation_pixels=5   
        )
        
        if not success or not os.path.exists(final_output_ply):
            raise RuntimeError("Post-processing pipeline failed to generate filtered asset.")

        # Register background task to clean up the whole output folder and ply asset AFTER response delivery
        background_tasks.add_task(safe_cleanup_worker_files, str(final_output_ply), str(sharp_output_dir))

        return FileResponse(final_output_ply, media_type="application/octet-stream")

    except subprocess.CalledProcessError as e:
        print(f"[ML-Sharp CLI CRITICAL ERROR]\nSTDOUT: {e.stdout}\nSTDERR: {e.stderr}")
        safe_cleanup_worker_files(final_output_ply, str(sharp_output_dir))
        raise HTTPException(status_code=500, detail=f"Core execution engine failed: {e.stderr}")

    except Exception as e:
        print(f"[ML-Sharp Pipeline Error]: {str(e)}")
        safe_cleanup_worker_files(final_output_ply, str(sharp_output_dir))
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # Clean up the intermediate 2D images immediately upon route completion
        safe_cleanup_worker_files(input_path, segmented_path, mask_path)