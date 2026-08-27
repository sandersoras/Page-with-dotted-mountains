"""
Static server for the deck, with HTTP Range support.

python -m http.server does not implement Range requests. For everything else
in this deck that is fine, but a browser will not stream a large video without
it: it has to pull the whole file before playback settles, so a 400 MB clip
stalls on the first frame. This adds the two things video needs, byte ranges
and correct MIME types, and nothing else.

    python serve.py            # port 8787
    python serve.py 9000
"""

import os
import re
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


class RangeHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".m4v": "video/mp4",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".wav": "audio/wav",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # the deck is edited constantly; never let the browser hold a stale copy
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        size = os.fstat(f.fileno()).st_size
        m = RANGE_RE.match(rng.strip())
        if not m:
            f.close()
            self.send_error(400, "Malformed Range header")
            return None

        start_s, end_s = m.group(1), m.group(2)
        if start_s == "":                      # bytes=-500, the trailing N bytes
            length = min(int(end_s or 0), size)
            start = size - length
            end = size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1
            end = min(end, size - 1)

        if start >= size or start > end:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", "bytes */%d" % size)
            self.end_headers()
            return None

        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()

        f.seek(start)
        self.copy_range(f, self.wfile, end - start + 1)
        f.close()
        return None

    @staticmethod
    def copy_range(src, dst, length, chunk=256 * 1024):
        while length > 0:
            buf = src.read(min(chunk, length))
            if not buf:
                break
            dst.write(buf)
            length -= len(buf)

    def log_message(self, fmt, *args):
        # a video pulls dozens of ranges a second; the noise buries real errors
        if "206" not in (args[1] if len(args) > 1 else ""):
            super().log_message(fmt, *args)


def lan_ip():
    """Best guess at this machine's address on the local network.

    Opening a UDP socket to an off-machine address does not send anything --
    it just makes the OS pick the interface it would route through, which is
    the one a phone on the same wifi can reach. Reading en0 directly would
    break on ethernet or a second adapter.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 1))          # TEST-NET-1, guaranteed unroutable
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    # Bound to every interface, not 127.0.0.1, so a phone on the same wifi can
    # open the deck. That means anyone on the network can too, for as long as
    # this is running -- it is a preview server on a laptop, not a deployment.
    print("STRID deck on http://localhost:%d  (Range enabled, Ctrl+C to stop)" % PORT)
    ip = lan_ip()
    if ip:
        print("           phone: http://%s:%d  (same wifi, visible to the network)" % (ip, PORT))
    ThreadingHTTPServer(("0.0.0.0", PORT), RangeHandler).serve_forever()
