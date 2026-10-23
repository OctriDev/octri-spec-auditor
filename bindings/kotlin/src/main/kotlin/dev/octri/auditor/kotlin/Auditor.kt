package dev.octri.auditor.kotlin

import com.fasterxml.jackson.databind.JsonNode

/** Kotlin facade over the same byte-array JNI bridge used by Java. */
class Auditor private constructor(private val native: dev.octri.auditor.Auditor) {
    /** Loads the native library pair packaged in the Java artifact for the current platform. */
    constructor() : this(dev.octri.auditor.Auditor())

    constructor(library: String, bridge: String) : this(dev.octri.auditor.Auditor(library, bridge))

    fun audit(request: JsonNode): JsonNode = native.audit(request)
    fun fix(request: JsonNode): JsonNode = native.fix(request)
    fun bundle(request: JsonNode): JsonNode = native.bundle(request)
    fun compare(before: JsonNode, after: JsonNode): JsonNode = native.compare(before, after)
    fun export(report: JsonNode, format: String = "json"): JsonNode = native.export(report, format)
    fun rules(): JsonNode = native.rules()
    fun call(envelope: JsonNode): JsonNode = native.call(envelope)
}
