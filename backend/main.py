from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uuid
from streamer import stream_manager
import uvicorn
import logging
import os

# VERSION 4.0 - HLS (Chunked) Streaming

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info("HLS GStreamer Backend Version 4.0 Starting with HLS...")

app = FastAPI(
    title="Camera Management API",
    root_path=os.getenv("ROOT_PATH", "")
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Camera(BaseModel):
    id: str
    name: str
    url: str
    hls_url: Optional[str] = None

class CameraCreate(BaseModel):
    name: str
    url: str

# In-memory storage 
cameras_db = {}

@app.on_event("shutdown")
def shutdown_event():
    logger.info("Shutting down... stopping all camera streams.")
    stream_manager.stop_all()

def get_hls_url(cam_id: str):
    # HLS files are served by Nginx at /hls/{cam_id}/playlist.m3u8
    # We return the relative path from the perspective of the frontend
    return f"hls/{cam_id}/playlist.m3u8"

@app.get("/api/cameras", response_model=List[Camera])
async def get_cameras():
    cams = []
    for cam in cameras_db.values():
        cam_copy = cam.model_copy()
        cam_copy.hls_url = get_hls_url(cam.id)
        cams.append(cam_copy)
    return cams

@app.post("/api/cameras", response_model=Camera)
async def create_camera(camera: CameraCreate):
    cam_id = str(uuid.uuid4())
    new_camera = Camera(id=cam_id, name=camera.name, url=camera.url)
    cameras_db[cam_id] = new_camera
    stream_manager.add_camera(cam_id, camera.url)
    new_camera.hls_url = get_hls_url(cam_id)
    return new_camera

@app.delete("/api/cameras/{camera_id}")
async def delete_camera(camera_id: str):
    if camera_id not in cameras_db:
        raise HTTPException(status_code=404, detail="Camera not found")
    del cameras_db[camera_id]
    stream_manager.remove_camera(camera_id)
    return {"message": "Camera deleted"}

@app.put("/api/cameras/{camera_id}", response_model=Camera)
async def update_camera(camera_id: str, camera: CameraCreate):
    if camera_id not in cameras_db:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    old_camera = cameras_db[camera_id]
    updated_camera = Camera(id=camera_id, name=camera.name, url=camera.url)
    cameras_db[camera_id] = updated_camera
    
    # Only update stream if URL changed
    if old_camera.url != camera.url:
        stream_manager.remove_camera(camera_id)
        stream_manager.add_camera(camera_id, camera.url)
        
    updated_camera.hls_url = get_hls_url(camera_id)
    return updated_camera

@app.get("/api/cameras/export")
async def export_cameras():
    return list(cameras_db.values())

@app.post("/api/cameras/import")
async def import_cameras(cameras: List[CameraCreate]):
    for cam in cameras:
        cam_id = str(uuid.uuid4())
        new_camera = Camera(id=cam_id, name=cam.name, url=cam.url)
        cameras_db[cam_id] = new_camera
        stream_manager.add_camera(cam_id, cam.url)
    return {"message": f"Imported {len(cameras)} cameras"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
