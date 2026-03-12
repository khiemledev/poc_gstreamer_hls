from dataclasses import dataclass
import os


@dataclass(frozen=True)
class ServerConfig:
    host: str = "0.0.0.0"
    port: int = 8000
    root_path: str = os.getenv("ROOT_PATH", "")


@dataclass(frozen=True)
class HLSConfig:
    base_dir: str = os.getenv("HLS_DIR", "/app/hls")
    target_duration: int = 2
    max_files: int = 10
    playlist_length: int = 5
    video_width: int = 1920
    video_height: int = 1080
    bitrate: int = 4000


server_config = ServerConfig()
hls_config = HLSConfig()
