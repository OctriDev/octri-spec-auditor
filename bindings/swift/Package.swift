// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "OctriSpecAuditor",
  platforms: [.macOS(.v13)],
  products: [.library(name: "OctriSpecAuditor", targets: ["OctriSpecAuditor"])],
  targets: [
    .systemLibrary(name: "COctriAuditor"),
    .target(name: "OctriSpecAuditor", dependencies: ["COctriAuditor"]),
    .executableTarget(
      name: "BindingCheck", dependencies: ["OctriSpecAuditor"], path: "Tests/BindingCheck"),
  ]
)
