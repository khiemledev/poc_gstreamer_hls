import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Camera, Plus, Trash2, Video, Activity, Download, Upload, Maximize, Edit2, X } from 'lucide-react';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const subpath = window.location.pathname.startsWith('/vision_flow') ? '/vision_flow' : '';
const API_BASE_URL = isLocal
    ? 'http://localhost:8000/api'
    : window.location.origin + subpath + '/api';

const App = () => {
    const [cameras, setCameras] = useState([]);
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [editingCamera, setEditingCamera] = useState(null);
    const fileInputRef = useRef(null);
    const videoRefs = useRef({});
    const hlsInstances = useRef({});
    const [streamStatus, setStreamStatus] = useState({});

    useEffect(() => {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/hls.js@latest";
        script.async = true;
        document.body.appendChild(script);

        fetchCameras();

        return () => {
            document.body.removeChild(script);
            Object.values(hlsInstances.current).forEach(hls => hls.destroy());
        };
    }, []);

    const fetchCameras = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/cameras`);
            setCameras(response.data);
        } catch (error) {
            console.error('Error fetching cameras:', error);
        }
    };

    const setupHLS = async (cam, retryCount = 0) => {
        const videoEl = videoRefs.current[cam.id]?.querySelector('video');
        if (!videoEl || !window.Hls) {
            if (retryCount < 20) {
                setTimeout(() => setupHLS(cam, retryCount + 1), 500);
            }
            return;
        }

        if (hlsInstances.current[cam.id]) {
            hlsInstances.current[cam.id].destroy();
        }

        const hlsUrl = isLocal
            ? `http://localhost:8081/${cam.hls_url}`
            : `${window.location.origin}${subpath}/${cam.hls_url}`;

        // Check if playlist exists before attaching
        try {
            await axios.head(hlsUrl);
            setStreamStatus(prev => ({ ...prev, [cam.id]: 'ready' }));
        } catch (error) {
            if (retryCount < 60) {
                console.log(`Stream not ready for ${cam.id}, retrying... (${retryCount})`);
                setStreamStatus(prev => ({ ...prev, [cam.id]: 'loading' }));
                setTimeout(() => setupHLS(cam, retryCount + 1), 1000);
                return;
            }
            setStreamStatus(prev => ({ ...prev, [cam.id]: 'error' }));
            return;
        }

        if (window.Hls.isSupported()) {
            const hls = new window.Hls({
                manifestLoadingMaxRetry: 10,
                manifestLoadingRetryDelay: 1000,
            });
            hls.loadSource(hlsUrl);
            hls.attachMedia(videoEl);
            hlsInstances.current[cam.id] = hls;

            hls.on(window.Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    setStreamStatus(prev => ({ ...prev, [cam.id]: 'error' }));
                }
            });
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            videoEl.src = hlsUrl;
        }
    };

    useEffect(() => {
        cameras.forEach(cam => {
            if (!hlsInstances.current[cam.id]) {
                // Small delay to ensure Hls is loaded and DOM is ready
                setTimeout(() => setupHLS(cam), 500);
            }
        });
    }, [cameras]);

    const addCamera = async (e) => {
        e.preventDefault();
        if (!name || !url) return;
        setLoading(true);
        try {
            if (editingCamera) {
                await axios.put(`${API_BASE_URL}/cameras/${editingCamera.id}`, { name, url });
                setEditingCamera(null);
            } else {
                await axios.post(`${API_BASE_URL}/cameras`, { name, url });
            }
            setName('');
            setUrl('');
            fetchCameras();
        } catch (error) {
            console.error('Error saving camera:', error);
        } finally {
            setLoading(false);
        }
    };

    const startEditing = (cam) => {
        setEditingCamera(cam);
        setName(cam.name);
        setUrl(cam.url);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEditing = () => {
        setEditingCamera(null);
        setName('');
        setUrl('');
    };

    const deleteCamera = async (id) => {
        try {
            await axios.delete(`${API_BASE_URL}/cameras/${id}`);
            if (hlsInstances.current[id]) {
                hlsInstances.current[id].destroy();
                delete hlsInstances.current[id];
            }
            fetchCameras();
        } catch (error) {
            console.error('Error deleting camera:', error);
        }
    };

    const toggleFullScreen = (id) => {
        const el = videoRefs.current[id];
        if (!el) return;

        if (!document.fullscreenElement) {
            if (el.requestFullscreen) {
                el.requestFullscreen();
            } else if (el.webkitRequestFullscreen) { /* Safari */
                el.webkitRequestFullscreen();
            } else if (el.msRequestFullscreen) { /* IE11 */
                el.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    const exportCameras = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/cameras/export`);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(response.data, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "cameras_backup.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } catch (error) {
            console.error('Error exporting cameras:', error);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current.click();
    };

    const importCameras = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);
                await axios.post(`${API_BASE_URL}/cameras/import`, json);
                fetchCameras();
                alert('Cameras imported successfully!');
            } catch (error) {
                console.error('Error importing cameras:', error);
                alert('Failed to import cameras. Ensure the JSON format is correct.');
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    };

    return (
        <div className="app-container">
            <header>
                <h1>HLS GStreamer</h1>
                <p>Enterprise Camera Management & HLS (Chunked) Streamer</p>
            </header>

            <div className="dashboard">
                <aside className="glass-card camera-form">
                    <h2>
                        {editingCamera ? <Edit2 size={20} /> : <Plus size={20} />}
                        {editingCamera ? ' Edit Camera' : ' Add New Camera'}
                    </h2>
                    <form onSubmit={addCamera}>
                        <div className="form-group">
                            <label>Camera Name</label>
                            <input
                                type="text"
                                placeholder="Entry Door 01"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>RTSP / HTTP / HLS URL</label>
                            <input
                                type="text"
                                placeholder="rtsp://... or http://..."
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                            />
                        </div>
                        <button className="btn btn-primary" type="submit" disabled={loading}>
                            {loading ? 'Saving...' : (editingCamera ? 'Update Stream' : 'Initialize Stream')}
                        </button>
                        {editingCamera && (
                            <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={cancelEditing}
                                style={{ marginTop: '0.5rem', width: '100%', backgroundColor: 'rgba(255,255,255,0.05)' }}
                            >
                                <X size={16} /> Cancel Edit
                            </button>
                        )}
                    </form>

                    <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-secondary" onClick={exportCameras} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--glass-border)' }}>
                                <Download size={16} /> Export
                            </button>
                            <button className="btn btn-secondary" onClick={handleImportClick} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--glass-border)' }}>
                                <Upload size={16} /> Import
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                accept=".json"
                                onChange={importCameras}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            <Activity size={16} />
                            <span>HLS Status: Active (Chunked)</span>
                        </div>
                    </div>
                </aside>

                <main className="camera-grid">
                    {cameras.map((cam) => (
                        <div key={cam.id} className="glass-card camera-card">
                            <div
                                className="video-container"
                                ref={el => videoRefs.current[cam.id] = el}
                            >
                                <video
                                    autoPlay
                                    playsInline
                                    muted
                                    controls
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: streamStatus[cam.id] === 'ready' ? 'block' : 'none' }}
                                />
                                {streamStatus[cam.id] !== 'ready' && (
                                    <div className="loading-overlay" style={{
                                        position: 'absolute',
                                        top: 0, left: 0, right: 0, bottom: 0,
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center',
                                        background: 'rgba(0,0,0,0.5)', zIndex: 5
                                    }}>
                                        <Activity className="animate-pulse" size={32} style={{ color: 'var(--primary)', marginBottom: '1rem' }} />
                                        <span>{streamStatus[cam.id] === 'error' ? 'Stream Error' : 'Loading Stream...'}</span>
                                    </div>
                                )}
                                <div className="video-controls">
                                    <button className="fullscreen-btn" onClick={() => toggleFullScreen(cam.id)}>
                                        <Maximize size={24} />
                                    </button>
                                </div>
                            </div>
                            <div className="camera-info">
                                <div>
                                    <h3 title={cam.url}>{cam.name}</h3>
                                    <span className="badge">LIVE (CHUNKED)</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ width: 'auto', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.05)' }}
                                        onClick={() => startEditing(cam)}
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        className="btn btn-danger"
                                        style={{ width: 'auto', padding: '0.5rem' }}
                                        onClick={() => deleteCamera(cam.id)}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {cameras.length === 0 && (
                        <div className="glass-card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem' }}>
                            <Video size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                            <h3>No Cameras Connected</h3>
                            <p style={{ color: 'var(--text-muted)' }}>Add your first RTSP, HTTP, or HLS stream to get started.</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default App;
