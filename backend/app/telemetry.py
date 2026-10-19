"""Tracing: always record spans (so runs get trace ids); export to the OTel collector and/or
Langfuse (which accepts OTLP) only when configured."""

import base64

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.config import Settings


def setup_tracing(settings: Settings, service: str) -> TracerProvider:
    provider = TracerProvider(resource=Resource.create({"service.name": service}))
    if settings.otel_exporter_otlp_endpoint:
        endpoint = settings.otel_exporter_otlp_endpoint.rstrip("/") + "/v1/traces"
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    if settings.langfuse_public_key and settings.langfuse_secret_key:
        token = base64.b64encode(
            f"{settings.langfuse_public_key}:{settings.langfuse_secret_key.get_secret_value()}".encode()
        ).decode()
        provider.add_span_processor(
            BatchSpanProcessor(
                OTLPSpanExporter(
                    endpoint=settings.langfuse_host.rstrip("/") + "/api/public/otel/v1/traces",
                    headers={"Authorization": f"Basic {token}"},
                )
            )
        )
    trace.set_tracer_provider(provider)
    return provider
