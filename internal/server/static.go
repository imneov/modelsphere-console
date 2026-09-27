package server

import (
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
)

// spa serves the single-page app: a real file when it exists, index.html
// otherwise, so client-side routes resolve. /api/* never reaches here.
func (s *Server) spa(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.web == nil {
		writeError(w, http.StatusNotFound, "no web UI in this build")
		return
	}
	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name == "" {
		name = "index.html"
	}
	if f, err := s.web.Open(name); err == nil {
		f.Close()
		http.FileServer(http.FS(s.web)).ServeHTTP(w, r)
		return
	}
	// Client-side route: serve the shell.
	r2 := r.Clone(r.Context())
	r2.URL.Path = "/"
	http.ServeFileFS(w, r2, s.web, "index.html")
}

// WebFromDir serves the SPA from a directory on disk instead of the embedded
// build, for local development.
func WebFromDir(dir string) (fs.FS, error) {
	if _, err := os.Stat(path.Join(dir, "index.html")); err != nil {
		return nil, err
	}
	return os.DirFS(dir), nil
}
