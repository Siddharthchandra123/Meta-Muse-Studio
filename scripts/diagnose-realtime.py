"""Secret-safe Windows diagnostics for MUSE Nova live voice.

Free/default: local API readiness, DNS, and verified direct TLS reachability.
--live: one Meta WebSocket handshake THROUGH FastAPI; no microphone/audio data.

Direct TLS can be blocked on a corporate network even if an approved proxy path
works. A direct TLS failure is diagnostic evidence, not proof the service is down.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
import ssl
import sys
import urllib.error
import urllib.request

BASE = 'http://127.0.0.1:8000'
WS = 'ws://127.0.0.1:8000/v1/voice/realtime'
ORIGIN = 'http://127.0.0.1:3000'
HOST = 'api.meta.ai'


def get_json(path):
    with urllib.request.urlopen(BASE + path, timeout=5) as response:
        return json.load(response)


def print_free_network_checks():
    print('\nFree network checks (no Meta API calls or microphone):')
    for k in ('HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY'):
        print(f'  {k} configured:', bool(os.getenv(k) or os.getenv(k.lower())))
    try:
        addresses = socket.getaddrinfo(HOST, 443, type=socket.SOCK_STREAM)
        if not addresses:
            print('  DNS lookup: no addresses returned')
            return
        print('  DNS lookup: OK')
    except OSError as exc:
        print('  DNS lookup: FAILED (' + type(exc).__name__ + ')')
        return
    try:
        context = ssl.create_default_context()
        with socket.create_connection((HOST, 443), timeout=8) as sock:
            with context.wrap_socket(sock, server_hostname=HOST) as tls:
                print('  Direct TCP:443 + verified TLS: OK')
                print('  TLS version:', tls.version())
    except Exception as exc:
        print('  Direct TCP:443 + verified TLS: FAILED (' + type(exc).__name__ + ')')
        print('  Note: a managed/corporate proxy can require a proxy path instead.')


async def upstream_probe():
    try:
        from websockets.asyncio.client import connect
        from websockets.exceptions import ConnectionClosed
    except ImportError:
        print('websockets package missing; run: python -m pip install -r requirements-agent.txt')
        return 1
    try:
        async with connect(WS, origin=ORIGIN, open_timeout=10, close_timeout=3) as ws:
            print('Local websocket handshake: OK')
            message = await asyncio.wait_for(ws.recv(), timeout=40)
            data = json.loads(message)
            if data.get('type') == 'ready':
                print('Meta realtime handshake: READY')
                await ws.send(json.dumps({'type': 'endStream'}))
                # Do not keep a no-audio session open indefinitely.
                for _ in range(5):
                    try:
                        frame = await asyncio.wait_for(ws.recv(), timeout=3)
                        payload = json.loads(frame)
                        if payload.get('type') == 'error':
                            print('Meta stream after endStream:', payload.get('code', 'error'))
                            break
                    except (ConnectionClosed, asyncio.TimeoutError):
                        break
                return 0
            if data.get('type') == 'error':
                print('Meta realtime handshake: FAILED')
                print('Error code:', data.get('code', 'UNKNOWN'))
                print('Details:', data.get('message', ''))
                return 1
            print('Unexpected first event type:', data.get('type'))
            return 1
    except Exception as exc:
        print('Local WS connection failed:', type(exc).__name__)
        print('Inspect FastAPI logs; no credentials were printed.')
        return 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true', help='Contact Meta through FastAPI (may use credits)')
    args = parser.parse_args()
    try:
        health = get_json('/health')
        status = get_json('/v1/voice/realtime/status')
    except (OSError, urllib.error.HTTPError, ValueError) as exc:
        print('Local HTTP readiness failed:', type(exc).__name__)
        print('Start the Phase 5 FastAPI backend on 127.0.0.1:8000.')
        return 1

    print('Backend version:', health.get('version', 'unknown'))
    print('WebSocket route:', status.get('route', 'missing'))
    print('Meta key configured:', status.get('key_configured'))
    print('Python websockets installed:', status.get('websockets_installed'))
    print('Origin 127.0.0.1:3000 allowed:', ORIGIN in status.get('allowed_origins', []))

    # Check the actual backend capabilities instead of hard-coding the older
    # Phase 3.2 backend version (0.3.3). Phase 5 reports 0.5.0.
    ready = (
        health.get('status') == 'ok'
        and status.get('route') == '/v1/voice/realtime'
        and status.get('key_configured') is True
        and status.get('websockets_installed') is True
        and ORIGIN in status.get('allowed_origins', [])
    )
    if not ready:
        print('Local readiness FAILED: fix the local checks above.')
        return 1

    print_free_network_checks()
    if not args.live:
        print('\nLocal readiness OK. Run -Live to test Meta WebSocket handshake.')
        return 0
    print('\nLive Meta handshake (no microphone):')
    return asyncio.run(upstream_probe())


if __name__ == '__main__':
    sys.exit(main())
