// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "OctriSpecAuditor",
  platforms: [.macOS(.v13)],
  products: [.library(name: "OctriSpecAuditor", targets: ["OctriSpecAuditor"])],
  targets: [
    // Release builds place each platform's native library under native/.
    .target(name: "OctriSpecAuditor", resources: [.copy("native")]),
    .executableTarget(
      name: "BindingCheck", dependencies: ["OctriSpecAuditor"], path: "Tests/BindingCheck"),
  ]
)
