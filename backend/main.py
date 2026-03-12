import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import server_config
from handlers.cameras import router as cameras_router
from streamer import stream_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("HLS GStreamer Backend starting...")
    yield
    logger.info("Shutting down... stopping all camera streams.")
    stream_manager.stop_all()


app = FastAPI(
    title="Camera Management API",
    root_path=server_config.root_path,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cameras_router)

if __name__ == "__main__":
    uvicorn.run(app, host=server_config.host, port=server_config.port)
