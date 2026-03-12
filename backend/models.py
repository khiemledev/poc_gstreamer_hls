from pydantic import BaseModel


class CameraCreate(BaseModel):
    name: str
    url: str


class Camera(BaseModel):
    id: str
    name: str
    url: str
    hls_url: str | None = None
