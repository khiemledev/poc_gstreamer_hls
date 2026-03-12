import uuid
import logging

from fastapi import APIRouter, HTTPException

from models import Camera, CameraCreate
from streamer import stream_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

# In-memory storage
cameras_db: dict[str, Camera] = {}


def _hls_url(cam_id: str) -> str:
    return f"hls/{cam_id}/playlist.m3u8"


def _camera_with_hls(cam: Camera) -> Camera:
    copy = cam.model_copy()
    copy.hls_url = _hls_url(cam.id)
    return copy


@router.get("", response_model=list[Camera])
async def get_cameras():
    return [_camera_with_hls(cam) for cam in cameras_db.values()]


@router.post("", response_model=Camera)
async def create_camera(camera: CameraCreate):
    cam_id = str(uuid.uuid4())
    new_camera = Camera(id=cam_id, name=camera.name, url=camera.url)
    cameras_db[cam_id] = new_camera
    stream_manager.add_camera(cam_id, camera.url)
    return _camera_with_hls(new_camera)


@router.put("/{camera_id}", response_model=Camera)
async def update_camera(camera_id: str, camera: CameraCreate):
    if camera_id not in cameras_db:
        raise HTTPException(status_code=404, detail="Camera not found")

    old_camera = cameras_db[camera_id]
    updated_camera = Camera(id=camera_id, name=camera.name, url=camera.url)
    cameras_db[camera_id] = updated_camera

    if old_camera.url != camera.url:
        stream_manager.remove_camera(camera_id)
        stream_manager.add_camera(camera_id, camera.url)

    return _camera_with_hls(updated_camera)


@router.delete("/{camera_id}")
async def delete_camera(camera_id: str):
    if camera_id not in cameras_db:
        raise HTTPException(status_code=404, detail="Camera not found")
    del cameras_db[camera_id]
    stream_manager.remove_camera(camera_id)
    return {"message": "Camera deleted"}


@router.get("/export")
async def export_cameras():
    return list(cameras_db.values())


@router.post("/import")
async def import_cameras(cameras: list[CameraCreate]):
    for cam in cameras:
        cam_id = str(uuid.uuid4())
        new_camera = Camera(id=cam_id, name=cam.name, url=cam.url)
        cameras_db[cam_id] = new_camera
        stream_manager.add_camera(cam_id, cam.url)
    return {"message": f"Imported {len(cameras)} cameras"}
