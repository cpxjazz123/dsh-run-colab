#!/usr/bin/env python3
"""Persistent Colab GPU image worker.

The bridge starts this once inside the `image` Colab session. It loads
SDXL-Turbo into VRAM and serves generations over loopback, so later bridge
jobs do not re-import torch or reload the model.
"""
import base64
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from diffusers import AutoPipelineForText2Image

MODEL = os.environ.get("DSH_IMAGE_MODEL", "stabilityai/sdxl-turbo")
PORT = int(os.environ.get("DSH_IMAGE_WORKER_PORT", "8199"))

print(f"loading {MODEL}", flush=True)
pipe = AutoPipelineForText2Image.from_pretrained(
    MODEL,
    torch_dtype=torch.float16,
)
pipe.to("cuda")
torch.cuda.synchronize()
print(f"IMAGE_WORKER_MODEL_READY cuda={torch.cuda.get_device_name(0)}", flush=True)

lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(
                200,
                {
                    "ok": True,
                    "model": MODEL,
                    "cuda": torch.cuda.is_available(),
                    "device": torch.cuda.get_device_name(0),
                },
            )
            return
        self.send_json(404, {"error": {"message": "not found"}})

    def do_POST(self):
        if self.path != "/generate":
            self.send_json(404, {"error": {"message": "not found"}})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            prompt = str(payload.get("prompt", "")).strip()
            width = int(payload.get("width", 512))
            height = int(payload.get("height", 512))
            seed = payload.get("seed")
            if not prompt:
                raise ValueError("prompt is required")
            if (
                width < 256
                or width > 1024
                or width % 64
                or height < 256
                or height > 1024
                or height % 64
            ):
                raise ValueError("width and height must be 256..1024 in steps of 64")
            generator = None
            if seed is not None:
                generator = torch.Generator(device="cuda").manual_seed(
                    int(seed) & 0xFFFFFFFF
                )
            kwargs = {}
            if generator is not None:
                kwargs["generator"] = generator
            with lock:
                image = pipe(
                    prompt=prompt,
                    num_inference_steps=2,
                    guidance_scale=0.0,
                    width=width,
                    height=height,
                    **kwargs,
                ).images[0]
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=92)
            self.send_json(
                200,
                {
                    "image": base64.b64encode(buffer.getvalue()).decode("ascii"),
                    "mimeType": "image/jpeg",
                    "width": width,
                    "height": height,
                    "model": MODEL,
                },
            )
        except Exception as error:
            self.send_json(
                500,
                {"error": {"message": f"{type(error).__name__}: {error}"}},
            )


print(f"IMAGE_WORKER_HTTP_READY port={PORT}", flush=True)
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
