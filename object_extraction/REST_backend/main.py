from fastapi import FastAPI, File, UploadFile
from typing import List

app = FastAPI(title="SOG Generator", version="1.0.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate-sog")
async def generate_sog(images: List[UploadFile] = File(...)):
    print("hello world")
    return {"sogFile": None}
