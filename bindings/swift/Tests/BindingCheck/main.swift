import Foundation
import OctriSpecAuditor

let envelope = try JSONValue.decode(FileHandle.standardInput.readDataToEndOfFile())
let auditor = try Auditor(library: CommandLine.arguments[1])
let response: JSONValue
if envelope["abiVersion"] == .integer(1), let action = envelope["action"],
   [.string("audit"), .string("fix"), .string("bundle"), .string("compare"), .string("export"), .string("rules")].contains(action) {
  let value: JSONValue
  switch action {
  case .string("audit"): value = try auditor.audit(envelope["request"]!)
  case .string("fix"): value = try auditor.fix(envelope["request"]!)
  case .string("bundle"): value = try auditor.bundle(envelope["request"]!)
  case .string("compare"): value = try auditor.compare(envelope["before"]!, envelope["after"]!)
  case .string("export"):
    guard case .string(let format) = envelope["format"] else { fatalError("Missing export format") }
    value = try auditor.export(envelope["report"]!, format: format)
  default: value = try auditor.rules()
  }
  response = .object(["Ok": value])
} else {
  response = try auditor.call(envelope)
}
FileHandle.standardOutput.write(try response.encoded())
