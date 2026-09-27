{{- define "console.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "console.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "console.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "console.labels" -}}
app.kubernetes.io/name: {{ include "console.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "console.selectorLabels" -}}
app.kubernetes.io/name: {{ include "console.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "console.serviceAccountName" -}}
{{ include "console.fullname" . }}
{{- end -}}

{{- /* The router needs the gateway: /v1 has nowhere else to go. */ -}}
{{- define "console.router.enabled" -}}
{{- if and .Values.router.enabled (or .Values.playground.gateway.profile .Values.playground.gateway.configMap) -}}true{{- end -}}
{{- end -}}

{{- define "console.router.secret" -}}
{{ include "console.fullname" . }}-api-keys
{{- end -}}
