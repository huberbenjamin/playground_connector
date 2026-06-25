from fastapi import FastAPI, File, UploadFile, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from typing import List
import os

app = FastAPI(title="SOG Generator", version="1.0.0")

# In production, change this to os.getenv("SECRET_API_KEY")
SECRET_API_KEY = "my_super_secure_debug_token"

api_key_header = APIKeyHeader(name="X-Server-Token", auto_error=False)

async def verify_secret_token(api_key: str = Security(api_key_header)):
    if not api_key or api_key != SECRET_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access denied: Invalid or missing token."
        )
    return True


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-sog", dependencies=[Security(verify_secret_token)])
async def generate_sog(images: List[UploadFile] = File(...)):
    print("hello world")
    print(f"Received {len(images)} images for SOG generation.")
    return {"sogFile": None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

'''
curl -X POST "http://localhost:8000/generate-sog" \
     -H "X-Server-Token: my_super_secure_debug_token" \
     -F "images=@../test_images/001.png" 
'''