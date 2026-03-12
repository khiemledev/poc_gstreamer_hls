import logging
import os
import shutil
import signal
import subprocess

from config import hls_config

logger = logging.getLogger(__name__)


def _build_pipeline(camera_id: str, url: str) -> list[str]:
    output_dir = os.path.join(hls_config.base_dir, camera_id)
    playlist_path = os.path.join(output_dir, "playlist.m3u8")
    segment_path = os.path.join(output_dir, "segment_%05d.ts")

    if url.startswith("rtsp://"):
        source = [
            "rtspsrc", f"location={url}", "protocols=tcp",
            "!", "rtph264depay", "!", "h264parse", "!", "avdec_h264",
        ]
    else:
        source = ["uridecodebin", f"uri={url}"]

    return [
        "gst-launch-1.0", "-v",
        *source,
        "!", "videoconvert",
        "!", "videoscale",
        "!", f"video/x-raw,width={hls_config.video_width},height={hls_config.video_height}",
        "!", "videoconvert",
        "!", "x264enc", "tune=zerolatency", f"bitrate={hls_config.bitrate}", "speed-preset=ultrafast", "key-int-max=60",
        "!", "h264parse",
        "!", "mpegtsmux",
        "!", "hlssink",
        f"location={segment_path}",
        f"playlist-location={playlist_path}",
        f"target-duration={hls_config.target_duration}",
        f"max-files={hls_config.max_files}",
        f"playlist-length={hls_config.playlist_length}",
    ]


class CameraStream:
    def __init__(self, camera_id: str, url: str) -> None:
        self.camera_id = camera_id
        self.url = url
        self.process: subprocess.Popen | None = None

    @property
    def _output_dir(self) -> str:
        return os.path.join(hls_config.base_dir, self.camera_id)

    def start(self) -> None:
        if self.process and self.process.poll() is None:
            return

        if os.path.exists(self._output_dir):
            shutil.rmtree(self._output_dir)
        os.makedirs(self._output_dir, exist_ok=True)

        pipeline = _build_pipeline(self.camera_id, self.url)
        logger.info("Starting HLS worker for %s: %s", self.camera_id, " ".join(pipeline))

        try:
            self.process = subprocess.Popen(
                pipeline,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid,
            )
        except Exception:
            logger.exception("Failed to start HLS process for %s", self.camera_id)

    def stop(self) -> None:
        if self.process:
            try:
                os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
                self.process.wait(timeout=5)
            except Exception:
                logger.warning("Error stopping process for %s, sending SIGKILL", self.camera_id)
                if self.process.poll() is None:
                    os.killpg(os.getpgid(self.process.pid), signal.SIGKILL)
            self.process = None

        if os.path.exists(self._output_dir):
            shutil.rmtree(self._output_dir, ignore_errors=True)


class StreamManager:
    def __init__(self) -> None:
        self.streams: dict[str, CameraStream] = {}
        os.makedirs(hls_config.base_dir, exist_ok=True)

    def add_camera(self, camera_id: str, url: str) -> None:
        if camera_id in self.streams:
            self.streams[camera_id].stop()

        stream = CameraStream(camera_id, url)
        self.streams[camera_id] = stream
        stream.start()

    def remove_camera(self, camera_id: str) -> None:
        if camera_id in self.streams:
            self.streams[camera_id].stop()
            del self.streams[camera_id]

    def stop_all(self) -> None:
        for stream in self.streams.values():
            stream.stop()
        self.streams.clear()


stream_manager = StreamManager()
