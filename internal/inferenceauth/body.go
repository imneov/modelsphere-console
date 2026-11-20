package inferenceauth

import (
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"strings"
)

func requestModel(request *http.Request, limit int64) (string, *rejection) {
	contentType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		return "", denied(http.StatusUnsupportedMediaType, "invalid_content_type", "Chat Completions requires application/json")
	}
	body, err := io.ReadAll(io.LimitReader(request.Body, limit+1))
	if err != nil {
		return "", denied(http.StatusBadRequest, "invalid_body", "Could not read the authorization body")
	}
	if int64(len(body)) > limit {
		return "", denied(http.StatusRequestEntityTooLarge, "body_too_large", "Request body exceeds the authorization limit")
	}
	model, err := parseModel(string(body))
	if err != nil || model == "" {
		return "", denied(http.StatusBadRequest, "invalid_model", "Expected a JSON object with one nonempty model field")
	}
	return model, nil
}

func parseModel(body string) (string, error) {
	decoder := json.NewDecoder(strings.NewReader(body))
	opening, err := decoder.Token()
	if err != nil || opening != json.Delim('{') {
		return "", io.ErrUnexpectedEOF
	}
	seen, model := map[string]bool{}, ""
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return "", err
		}
		name, ok := token.(string)
		if !ok || seen[name] || (strings.EqualFold(name, "model") && name != "model") {
			return "", io.ErrUnexpectedEOF
		}
		seen[name] = true
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return "", err
		}
		if name == "model" {
			if err := json.Unmarshal(value, &model); err != nil {
				return "", err
			}
		}
	}
	if _, err := decoder.Token(); err != nil {
		return "", err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return "", io.ErrUnexpectedEOF
	}
	return model, nil
}
