package inferenceauth

import (
	"net/http"
	"slices"
)

func isCatalog(path string) bool {
	return path == "/v1/models" || path == "/api/llm/v1/models" || path == "/api/llm/routes"
}

func (handler *Handler) catalog(writer http.ResponseWriter, path string, caller principal) {
	models := make([]string, 0, len(handler.options.Models))
	for _, model := range handler.options.Models {
		if len(caller.models) == 0 || slices.Contains(caller.models, model) {
			models = append(models, model)
		}
	}
	if path == "/api/llm/routes" {
		handler.writeJSON(writer, http.StatusOK, map[string]any{"routes": []map[string]any{{"route": handler.options.Route, "models": models}}})
		return
	}
	items := make([]map[string]string, 0, len(models))
	for _, model := range models {
		items = append(items, map[string]string{"id": model, "object": "model", "owned_by": "console"})
	}
	handler.writeJSON(writer, http.StatusOK, map[string]any{"object": "list", "data": items})
}
