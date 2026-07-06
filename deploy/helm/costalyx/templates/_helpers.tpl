{{- define "costalyx.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "costalyx.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "costalyx.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "costalyx.labels" -}}
helm.sh/chart: {{ include "costalyx.chart" . }}
{{ include "costalyx.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "costalyx.selectorLabels" -}}
app.kubernetes.io/name: {{ include "costalyx.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "costalyx.backendName" -}}
{{ include "costalyx.fullname" . }}-backend
{{- end }}

{{- define "costalyx.frontendName" -}}
{{ include "costalyx.fullname" . }}-frontend
{{- end }}

{{- define "costalyx.backendServiceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- printf "%s-backend" (include "costalyx.fullname" .) }}
{{- else }}
{{- "default" }}
{{- end }}
{{- end }}

{{- define "costalyx.frontendServiceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- printf "%s-frontend" (include "costalyx.fullname" .) }}
{{- else }}
{{- "default" }}
{{- end }}
{{- end }}
