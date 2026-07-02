#!/bin/bash

# Kill all background processes if this script is stopped (Ctrl+C)
trap "kill 0" EXIT

# --- MICROMAMBA INITIALIZATION ---
export MAMBA_ROOT_PREFIX="/home/heavyubuntu/micromamba"
eval "$("/home/heavyubuntu/.local/bin/micromamba" shell hook --shell bash)"

# Create a logs directory if it doesn't exist
mkdir -p logs

echo "Starting ML-Sharp Worker (Port 8001), contained on Main GPU (Device 0)..."
# CUDA_VISIBLE_DEVICES=0 isolates process to GPU 0 16gb vram. GPU 0 gets preloaded with ml-sharp and sementation model
CUDA_VISIBLE_DEVICES=0 micromamba run -n gauss uvicorn ml_sharp_worker:app --port 8001 --host 127.0.0.1 > logs/ml_sharp.log 2>&1 &

echo "Starting FreeSplatter Worker (Port 8002), contained on Secondary GPU (Device 1)..."
# CUDA_VISIBLE_DEVICES=1 isolates process to GPU 1 12gb vram. Only freesplatter is loaded on this GPU (very close to 12gb vram limit, if not slightly over)
CUDA_VISIBLE_DEVICES=1 micromamba run -n freesplatter uvicorn freesplatter_worker:app --port 8002 --host 127.0.0.1 > logs/freesplatter.log 2>&1 &

# Wait a moment for workers to warm up
sleep 3

echo "Starting ngrok tunnel for Gateway on Port 8000..."
ngrok http http://127.0.0.1:8000 --log=stdout > ./logs/ngrok.log 2>&1 &

echo "Starting Gateway API (Port 8000)..."
micromamba run -n argauss uvicorn gateway:app --port 8000 --host 127.0.0.1 > logs/gateway.log 2>&1 &

echo "All services started. Logs are writing to the 'logs/' directory."
echo "To view Gateway errors, run: tail -f logs/gateway.log"

wait
