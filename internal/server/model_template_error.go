package server

import (
	"context"
	"errors"
	"fmt"
	"net"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
)

type templateRegistrationError struct {
	reason    string
	operation string
	cause     error
}

func (e *templateRegistrationError) Error() string { return safeTemplateReason(e.reason) }
func (e *templateRegistrationError) Unwrap() error { return e.cause }
func templateFailure(reason, operation string, cause error) error {
	return &templateRegistrationError{reason: reason, operation: operation, cause: cause}
}

type templateHTTPStatusError struct{ status int }

func (e *templateHTTPStatusError) Error() string {
	return fmt.Sprintf("upstream HTTP status %d", e.status)
}

func safeTemplateReason(reason string) string {
	switch reason {
	case "backend_unavailable", "backend_rejected", "backend_response_invalid", "profile_too_large", "profile_unavailable", "profile_invalid", "catalog_name_conflict", "catalog_not_registered", "registration_changed", "registration_unverified", "registration_timeout", "storage_unavailable", "existing_catalog_unknown":
		return reason
	default:
		return "registration_failed"
	}
}

type templateRegistrationDiagnostic struct {
	reason    string
	operation string
	causeType string
	status    int
	timeout   bool
}

func templateFailureDiagnostic(err error) templateRegistrationDiagnostic {
	d := templateRegistrationDiagnostic{reason: "registration_failed", operation: "registration", causeType: fmt.Sprintf("%T", err)}
	var failure *templateRegistrationError
	if errors.As(err, &failure) {
		d.reason = safeTemplateReason(failure.reason)
		d.operation = failure.operation
		d.causeType = fmt.Sprintf("%T", failure.cause)
	}
	var status *templateHTTPStatusError
	if errors.As(err, &status) && status.status >= 100 && status.status <= 599 {
		d.status = status.status
	}
	var apiStatus apierrors.APIStatus
	if d.status == 0 && errors.As(err, &apiStatus) {
		code := int(apiStatus.Status().Code)
		if code >= 100 && code <= 599 {
			d.status = code
		}
	}
	var network net.Error
	d.timeout = errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &network) && network.Timeout())
	return d
}

func (s *Server) reportTemplateFailure(ctx context.Context, err error) string {
	if err == nil {
		return ""
	}
	d := templateFailureDiagnostic(err)
	s.log.WarnContext(ctx, "model template registration pending", "reason", d.reason, "operation", d.operation, "cause_type", d.causeType, "status", d.status, "timeout", d.timeout)
	return d.reason
}
