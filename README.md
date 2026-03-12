# HLS GStreamer - Camera Management System

A camera management system using **GStreamer**, **FastAPI**, and **React** with **shadcn/ui**.

## Features
- GStreamer-based RTSP/HTTP stream ingestion
- HLS chunked streaming for browser playback
- Modern dark-mode UI built with shadcn/ui and Tailwind CSS
- Dockerized deployment with Docker Compose

## Quick Start

### Prerequisites
- Docker & Docker Compose

### Running
```bash
docker-compose up --build
```
Open `http://localhost:5173` in your browser.

## Architecture
- **Backend** (port 8000): FastAPI server managing camera CRUD and GStreamer HLS pipelines.
- **Frontend** (port 5173): React + Vite application with shadcn/ui components.
- **Nginx** (port 8081): Serves HLS `.m3u8` and `.ts` segment files from a shared volume.

## Configuration

### Backend

Configured via environment variables or frozen dataclasses in `backend/config.py`:

| Variable | Default | Description |
|---|---|---|
| `ROOT_PATH` | `""` | FastAPI root path (for reverse proxy setups) |
| `HLS_DIR` | `/app/hls` | Directory for HLS segment output |

### Frontend

Configured via Vite environment variables (`.env` file in `frontend/`):

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `{origin}/api` | Backend API base URL |
| `VITE_HLS_BASE_URL` | `{origin}` | HLS stream base URL |

See `frontend/.env.example` for reference. For local development:

```bash
cp frontend/.env.example frontend/.env
```

## Development

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Project Structure
```
├── backend/
│   ├── main.py              # FastAPI app setup and lifespan
│   ├── config.py            # Frozen dataclass configs (ServerConfig, HLSConfig)
│   ├── models.py            # Pydantic models (Camera, CameraCreate)
│   ├── streamer.py          # GStreamer HLS stream manager
│   ├── handlers/
│   │   └── cameras.py       # Camera CRUD route handlers
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main application component
│   │   ├── components/ui/   # shadcn/ui components
│   │   └── index.css        # Tailwind CSS + shadcn theme
│   ├── .env.example         # Environment variable reference
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml
```
