import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Plus, Trash2, Video, Activity, Maximize, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

const subpath = window.location.pathname.startsWith('/vision_flow') ? '/vision_flow' : '';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
    || `${window.location.origin}${subpath}/api`;
const HLS_BASE_URL = import.meta.env.VITE_HLS_BASE_URL
    || `${window.location.origin}${subpath}`;

const App = () => {
    const [cameras, setCameras] = useState([]);
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [editingCamera, setEditingCamera] = useState(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
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
            toast.error('Failed to fetch cameras');
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

        const hlsUrl = `${HLS_BASE_URL}/${cam.hls_url}`;

        try {
            await axios.head(hlsUrl);
            setStreamStatus(prev => ({ ...prev, [cam.id]: 'ready' }));
        } catch (error) {
            if (retryCount < 60) {
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
                setTimeout(() => setupHLS(cam), 500);
            }
        });
    }, [cameras]);

    const openAddDialog = () => {
        setEditingCamera(null);
        setName('');
        setUrl('');
        setDialogOpen(true);
    };

    const openEditDialog = (cam) => {
        setEditingCamera(cam);
        setName(cam.name);
        setUrl(cam.url);
        setDialogOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name || !url) {
            toast.warning('Please fill in both camera name and URL');
            return;
        }
        setLoading(true);
        try {
            if (editingCamera) {
                await axios.put(`${API_BASE_URL}/cameras/${editingCamera.id}`, { name, url });
                toast.success(`Camera "${name}" updated successfully`);
            } else {
                await axios.post(`${API_BASE_URL}/cameras`, { name, url });
                toast.success(`Camera "${name}" added successfully`);
            }
            setName('');
            setUrl('');
            setDialogOpen(false);
            setEditingCamera(null);
            fetchCameras();
        } catch (error) {
            console.error('Error saving camera:', error);
            toast.error('Failed to save camera. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const deleteCamera = async (id) => {
        try {
            await axios.delete(`${API_BASE_URL}/cameras/${id}`);
            if (hlsInstances.current[id]) {
                hlsInstances.current[id].destroy();
                delete hlsInstances.current[id];
            }
            toast.success('Camera deleted successfully');
            fetchCameras();
        } catch (error) {
            console.error('Error deleting camera:', error);
            toast.error('Failed to delete camera');
        } finally {
            setDeleteConfirmId(null);
        }
    };

    const toggleFullScreen = (id) => {
        const el = videoRefs.current[id];
        if (!el) return;

        if (!document.fullscreenElement) {
            if (el.requestFullscreen) {
                el.requestFullscreen();
            } else if (el.webkitRequestFullscreen) {
                el.webkitRequestFullscreen();
            } else if (el.msRequestFullscreen) {
                el.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto p-6">
            {/* Header */}
            <header className="text-center mb-10">
                <h1 className="text-4xl font-bold bg-gradient-to-br from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
                    HLS GStreamer
                </h1>
                <p className="text-muted-foreground">
                    Just for POC
                </p>
            </header>

            {/* Toolbar */}
            <div className="flex items-center mb-6">
                <Button onClick={openAddDialog}>
                    <Plus className="h-4 w-4" />
                    Add Camera
                </Button>
            </div>

            {/* Add / Edit Camera Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {editingCamera ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                            {editingCamera ? 'Edit Camera' : 'Add New Camera'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingCamera
                                ? 'Update the camera details below.'
                                : 'Enter the camera name and stream URL to get started.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="camera-name">Camera Name</Label>
                                <Input
                                    id="camera-name"
                                    placeholder="Entry Door 01"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="camera-url">RTSP / HTTP / HLS URL</Label>
                                <Input
                                    id="camera-url"
                                    placeholder="rtsp://... or http://..."
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? 'Saving...' : (editingCamera ? 'Update Stream' : 'Initialize Stream')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete Camera</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete this camera? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={() => deleteCamera(deleteConfirmId)}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Camera Grid */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-4">
                {cameras.map((cam) => (
                    <div key={cam.id} className="rounded-xl border bg-card text-card-foreground overflow-hidden flex flex-col">
                        <div
                            className="relative aspect-video bg-black rounded-t-xl overflow-hidden group"
                            ref={el => videoRefs.current[cam.id] = el}
                        >
                            <video
                                autoPlay
                                playsInline
                                muted
                                controls
                                className="w-full h-full object-cover"
                                style={{ display: streamStatus[cam.id] === 'ready' ? 'block' : 'none' }}
                            />
                            {streamStatus[cam.id] !== 'ready' && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
                                    <Activity
                                        className="h-8 w-8 text-indigo-500 mb-3 animate-pulse-opacity"
                                    />
                                    <span className="text-sm text-muted-foreground">
                                        {streamStatus[cam.id] === 'error' ? 'Stream Error' : 'Loading Stream...'}
                                    </span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <button
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-full w-12 h-12 flex items-center justify-center pointer-events-auto transition-transform hover:scale-110 cursor-pointer"
                                    onClick={() => toggleFullScreen(cam.id)}
                                >
                                    <Maximize className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4">
                            <div>
                                <h3 className="font-semibold text-sm" title={cam.url}>{cam.name}</h3>
                                <span className={`inline-flex items-center gap-1 mt-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
                                    streamStatus[cam.id] === 'ready'
                                        ? 'bg-green-500/10 text-green-500'
                                        : streamStatus[cam.id] === 'error'
                                            ? 'bg-red-500/10 text-red-500'
                                            : 'bg-yellow-500/10 text-yellow-500'
                                }`}>
                                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                                        streamStatus[cam.id] === 'ready'
                                            ? 'bg-green-500'
                                            : streamStatus[cam.id] === 'error'
                                                ? 'bg-red-500'
                                                : 'bg-yellow-500 animate-pulse'
                                    }`} />
                                    {streamStatus[cam.id] === 'ready' ? 'LIVE' : streamStatus[cam.id] === 'error' ? 'ERROR' : 'CONNECTING'}
                                </span>
                            </div>
                            <div className="flex gap-1.5">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => openEditDialog(cam)}
                                >
                                    <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => setDeleteConfirmId(cam.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}

                {cameras.length === 0 && (
                    <div className="col-span-full rounded-xl border bg-card text-card-foreground text-center py-16 px-6">
                        <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-1">No Cameras Connected</h3>
                        <p className="text-muted-foreground text-sm">
                            Click "Add Camera" to add your first RTSP, HTTP, or HLS stream.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
