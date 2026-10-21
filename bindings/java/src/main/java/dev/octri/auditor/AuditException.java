package dev.octri.auditor;

import com.fasterxml.jackson.databind.JsonNode;

public final class AuditException extends RuntimeException {
  private static final long serialVersionUID = 1L;
  private final String auditCode;
  private final JsonNode diagnostics;

  public AuditException(JsonNode error) {
    super(error.path("message").asText());
    auditCode = error.path("code").asText();
    diagnostics = error.path("diagnostics").deepCopy();
  }

  public String getAuditCode() {
    return auditCode;
  }

  public JsonNode getDiagnostics() {
    return diagnostics.deepCopy();
  }
}
