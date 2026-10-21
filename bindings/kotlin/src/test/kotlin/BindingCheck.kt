import com.fasterxml.jackson.databind.ObjectMapper
import dev.octri.auditor.kotlin.Auditor

fun main(args: Array<String>) {
    val json = ObjectMapper()
    val envelope = json.readTree(System.`in`)
    val auditor = Auditor(args[0], args[1])
    val action = envelope.path("action").asText()
    val result = if (envelope.path("abiVersion").asInt() == 1 && action in listOf("audit", "fix", "bundle", "compare", "export", "rules")) {
        val value = when (action) {
            "audit" -> auditor.audit(envelope.get("request"))
            "fix" -> auditor.fix(envelope.get("request"))
            "bundle" -> auditor.bundle(envelope.get("request"))
            "compare" -> auditor.compare(envelope.get("before"), envelope.get("after"))
            "export" -> auditor.export(envelope.get("report"), envelope.get("format").asText())
            else -> auditor.rules()
        }
        json.createObjectNode().set<com.fasterxml.jackson.databind.JsonNode>("Ok", value)
    } else { auditor.call(envelope) }
    json.writeValue(System.out, result)
}
