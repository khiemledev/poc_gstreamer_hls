import logging
import subprocess
import os
import signal
import time
import shutil
from typing import Dict, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HLS_BASE_DIR = os.getenv("HLS_DIR", "/app/hls")

def start_hls_worker(camera_id: str, url: str):
    """
    Launch a GStreamer process to generate HLS segments.
    """
    output_dir = os.path.join(HLS_BASE_DIR, camera_id)
    os.makedirs(output_dir, exist_ok=True)
    
    playlist_path = os.path.join(output_dir, "playlist.m3u8")
    segment_path = os.path.join(output_dir, "segment_%05d.ts")

    # Use rtspsrc for RTSP for better reliability, otherwise stick to uridecodebin
    if url.startswith("rtsp://"):
        source_bin = ["rtspsrc", f"location={url}", "protocols=tcp", "!", "rtph264depay", "!", "h264parse", "!", "avdec_h264"]
    else:
        source_bin = ["uridecodebin", f"uri={url}"]

    pipeline = [
        "gst-launch-1.0",
        "-v",
    ] + source_bin + [
        "!",
        "videoconvert", "!",
        "videoscale", "!",
        "video/x-raw,width=1920,height=1080", "!",
        "videoconvert", "!",
        "x264enc", "tune=zerolatency", "bitrate=4000", "speed-preset=ultrafast", "key-int-max=60", "!",
        "h264parse", "!",
        "mpegtsmux", "!",
        "hlssink",
        f"location={segment_path}",
        f"playlist-location={playlist_path}",
        "target-duration=2",
        "max-files=10",
        "playlist-length=5"
    ]

    logger.info(f"Starting HLS worker for {camera_id}: {' '.join(pipeline)}")
    
    try:
        process = subprocess.Popen(
            pipeline,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid
        )
        return process
    except Exception as e:
        logger.error(f"Failed to start HLS process for {camera_id}: {e}")
        return None

class CameraStream:
    def __init__(self, camera_id: str, url: str):
        self.camera_id = camera_id
        self.url = url
        self.process: Optional[subprocess.Popen] = None

    def start(self):
        if self.process and self.process.poll() is None:
            return
        
        # Ensure directory is clean
        output_dir = os.path.join(HLS_BASE_DIR, self.camera_id)
        if os.path.exists(output_dir):
            shutil.rmtree(output_dir)
        
        self.process = start_hls_worker(self.camera_id, self.url)

    def stop(self):
        if self.process:
            try:
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                self.process.wait(timeout=5)
            except Exception as e:
                logger.warning(f"Error stopping process for {self.camera_id}: {e}")
                if self.process.poll() is None:
                    os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
            
            self.process = None
        
        # Cleanup files
        output_dir = os.path.join(HLS_BASE_DIR, self.camera_id)
        if os.path.exists(output_dir):
            try:
                shutil.rmtree(output_dir)
            except:
                pass

class StreamManager:
    def __init__(self):
        self.streams: Dict[str, CameraStream] = {}
        # Ensure base directory exists
        os.makedirs(HLS_BASE_DIR, exist_ok=True)

    def add_camera(self, camera_id: str, url: str):
        if camera_id in self.streams:
            self.streams[camera_id].stop()
        
        stream = CameraStream(camera_id, url)
        self.streams[camera_id] = stream
        stream.start()

    def remove_camera(self, camera_id: str):
        if camera_id in self.streams:
            self.streams[camera_id].stop()
            del self.streams[camera_id]

    def stop_all(self):
        for stream in self.streams.values():
            stream.stop()
        self.streams.clear()

stream_manager = StreamManager()
