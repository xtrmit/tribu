"""Petit serveur local pour tester Tribu sur le PC : http://localhost:8080
Force les bons types de fichiers (Windows peut annoncer .js en text/plain, ce qui bloque le mode hors ligne)
et désactive le cache navigateur pour toujours voir la dernière version des fichiers."""
import http.server, os, sys, webbrowser, functools

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8',
        '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '': 'application/octet-stream'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, fmt, *args):
        pass

if __name__ == '__main__':
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler) as srv:
        url = f'http://localhost:{PORT}/'
        print(f'Tribu (LOCAL) tourne sur {url}  -  Ctrl+C pour arrêter')
        webbrowser.open(url)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print('\nArrêté.')
