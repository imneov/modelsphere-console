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

{{- /* swissd, installed with this release (swiss.enabled) or elsewhere
       (externalSwiss.url), as JSON: url, and secretName/secretKey of the
       front-proxy key console sends. Empty when there is no swissd. */ -}}
{{- define "console.swiss.backend" -}}
{{- $ext := .Values.externalSwiss -}}
{{- if and .Values.swiss.enabled $ext.url -}}
{{- fail "swiss.enabled installs a swissd and externalSwiss.url names another; set one" -}}
{{- else if .Values.swiss.enabled -}}
{{- if not (or .Values.swiss.auth.proxyKey .Values.swiss.auth.disabled) -}}
{{- fail "swiss.enabled needs swiss.auth.proxyKey: it is how console gets into swissd without the password" -}}
{{- end -}}
{{- $swiss := include "console.swiss" . | fromJson -}}
{{- $b := dict "url" (printf "http://%s.%s.svc:%d/api" (include "swiss.fullname" $swiss) .Release.Namespace (int .Values.swiss.service.port)) -}}
{{- if not .Values.swiss.auth.disabled -}}
{{- $_ := set $b "secretName" (include "swiss.authSecretName" $swiss) -}}
{{- $_ := set $b "secretKey" "proxyKey" -}}
{{- end -}}
{{- toJson $b -}}
{{- else if $ext.url -}}
{{- $b := dict "url" $ext.url -}}
{{- if $ext.proxyKey.secretName -}}
{{- $_ := set $b "secretName" $ext.proxyKey.secretName -}}
{{- $_ := set $b "secretKey" ($ext.proxyKey.key | default "proxyKey") -}}
{{- end -}}
{{- toJson $b -}}
{{- end -}}
{{- end -}}

{{- /* The site profile the Playground reads: playground.gateway.profile, or
       swissd's when nothing else names the models. */ -}}
{{- define "console.gateway.profile" -}}
{{- $gw := .Values.playground.gateway -}}
{{- if $gw.profile -}}
{{- $gw.profile -}}
{{- else if not $gw.configMap -}}
{{- if .Values.swiss.enabled -}}
{{- include "swiss.effectiveProfileRef" (include "console.swiss" . | fromJson) -}}
{{- else -}}
{{- .Values.externalSwiss.profile -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- /* An existing gateway to resolve from the cluster. */ -}}
{{- define "console.gateway" -}}
{{- if or (include "console.gateway.profile" .) .Values.playground.gateway.configMap -}}true{{- end -}}
{{- end -}}

{{- /* The router needs somewhere to send /v1: a gateway. */ -}}
{{- define "console.router.enabled" -}}
{{- if and .Values.router.enabled (include "console.gateway" .) -}}true{{- end -}}
{{- end -}}

{{- define "console.router.secret" -}}
{{ include "console.fullname" . }}-api-keys
{{- end -}}

