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

{{- /* The swiss subchart's own helpers, called with the context they expect. Only
       defined while swiss.enabled: a disabled subchart is not loaded at all. */ -}}
{{- define "console.swiss" -}}
{{- toJson (dict "Values" .Values.swiss "Release" .Release "Chart" (dict "Name" "swiss")) -}}
{{- end -}}

{{- /* The site profile the Playground reads: playground.gateway.profile, or the
       swiss subchart's when it is on and nothing else names the models. */ -}}
{{- define "console.gateway.profile" -}}
{{- $gw := .Values.playground.gateway -}}
{{- if $gw.profile -}}
{{- $gw.profile -}}
{{- else if and .Values.swiss.enabled (not $gw.configMap) (not .Values.demo.enabled) -}}
{{- include "swiss.effectiveProfileRef" (include "console.swiss" . | fromJson) -}}
{{- end -}}
{{- end -}}

{{- /* An existing gateway to resolve from the cluster. */ -}}
{{- define "console.gateway" -}}
{{- if or (include "console.gateway.profile" .) .Values.playground.gateway.configMap -}}true{{- end -}}
{{- end -}}

{{- /* The router needs somewhere to send /v1: a gateway, or the demo model. */ -}}
{{- define "console.router.enabled" -}}
{{- if and .Values.router.enabled (or (include "console.gateway" .) .Values.demo.enabled) -}}true{{- end -}}
{{- end -}}

{{- define "console.router.secret" -}}
{{ include "console.fullname" . }}-api-keys
{{- end -}}

{{- /* Pods of a bundled component (the demo model). Their own name keeps them
       out of console's selectors, which match name+instance only and cannot
       change on an existing release. */ -}}
{{- define "console.componentSelectorLabels" -}}
{{- $ctx := index . 0 -}}
app.kubernetes.io/name: {{ include "console.name" $ctx }}-{{ index . 1 }}
app.kubernetes.io/instance: {{ $ctx.Release.Name }}
app.kubernetes.io/component: {{ index . 1 }}
{{- end -}}
