import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import dev.octri.auditor.Auditor;

public final class BindingCheck {
  public static void main(String[] args) throws Exception {
    var json = new ObjectMapper();
    var envelope = json.readTree(System.in);
    var auditor = new Auditor(args[0], args[1]);
    String action = envelope.path("action").asText();
    if (envelope.path("abiVersion").asInt() == 1 && java.util.List.of("audit", "fix", "bundle", "compare", "export", "rules").contains(action)) {
      ObjectNode result = json.createObjectNode();
      com.fasterxml.jackson.databind.JsonNode value;
      switch (action) {
        case "audit": value = auditor.audit(envelope.get("request")); break;
        case "fix": value = auditor.fix(envelope.get("request")); break;
        case "bundle": value = auditor.bundle(envelope.get("request")); break;
        case "compare": value = auditor.compare(envelope.get("before"), envelope.get("after")); break;
        case "export": value = auditor.export(envelope.get("report"), envelope.get("format").asText()); break;
        default: value = auditor.rules();
      }
      result.set("Ok", value);
      json.writeValue(System.out, result);
    } else {
      json.writeValue(System.out, auditor.call(envelope));
    }
  }
}
