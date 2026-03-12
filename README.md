# HLS GStreamer - Camera Management System

A high-performance camera management system using **GStreamer**, **FastAPI**, and **React**.

## Features
- **GStreamer Integration**: Efficiently handles RTSP/HTTP streams.
- **Real-time Streaming**: HLS chunked streaming for browser compatibility.
- **Premium UI**: Modern dark-mode dashboard with glassmorphism.
- **Dockerized**: Easy deployment with Docker Compose.

## Reference
Inspired by the GStreamer implementation in `video_show_gstreamer.py`.

## Quick Start

### Prerequisites
- Docker & Docker Compose

### Running the Application
1. Clone the repository.
2. Run the following command:
   ```bash
   docker-compose up --build
   ```
3. Open your browser and navigate to `http://localhost:5173`.

## Architecture
- **Backend** (port 8080): FastAPI server managing camera metadata and GStreamer HLS pipelines. Runs on host network to access camera streams.
- **Frontend** (port 5173): React application served with `serve`, built with Vite.
- **Nginx** (port 8081): Serves HLS `.m3u8` and `.ts` segment files from shared volume.

## Development
To run without Docker:
- **Backend**: `cd backend && pip install -r requirements.txt && python main.py`
- **Frontend**: `cd frontend && npm install && npm run dev`
