import Foundation

let fileManager = FileManager.default
let repositoryRoot = URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true)
let builder = repositoryRoot.appendingPathComponent("scripts/build-anime-face-assets.swift")
let sourceDirectory = repositoryRoot.appendingPathComponent("assets/anime-face-sources", isDirectory: true)
let assetNames = [
  "anime-face-overlay.png",
  "anime-face-eyes-closed.png",
  "anime-face-mouth-open.png",
  "anime-face-blink-mouth.png",
  "anime-face-wink-left.png",
  "anime-face-wink-right.png",
  "anime-face-wink-left-mouth.png",
  "anime-face-wink-right-mouth.png",
]

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("Asset reproducibility verification failed: \(message)\n".utf8))
  exit(1)
}

func readAssets(in directory: URL) throws -> [String: Data] {
  try Dictionary(uniqueKeysWithValues: assetNames.map { name in
    (name, try Data(contentsOf: directory.appendingPathComponent(name)))
  })
}

func runBuilder(in workingDirectory: URL, moduleCache: URL) {
  let process = Process()
  process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
  process.arguments = ["swift", builder.path]
  process.currentDirectoryURL = workingDirectory
  process.standardOutput = FileHandle.nullDevice
  process.environment = ProcessInfo.processInfo.environment.merging([
    "CLANG_MODULE_CACHE_PATH": moduleCache.path,
    "SWIFT_MODULECACHE_PATH": moduleCache.path,
  ]) { _, override in override }

  do {
    try process.run()
    process.waitUntilExit()
  } catch {
    fail("could not launch builder: \(error)")
  }
  guard process.terminationStatus == 0 else {
    fail("builder exited with status \(process.terminationStatus)")
  }
}

let fixtureRoot = fileManager.temporaryDirectory.appendingPathComponent(
  "anime-face-reproducibility-\(UUID().uuidString)",
  isDirectory: true
)
defer { try? fileManager.removeItem(at: fixtureRoot) }

let checkedInBuild: [String: Data]
do {
  checkedInBuild = try readAssets(in: repositoryRoot.appendingPathComponent("public"))
} catch {
  fail("could not read checked-in assets: \(error)")
}

do {
  let fixturePublic = fixtureRoot.appendingPathComponent("public", isDirectory: true)
  try fileManager.createDirectory(at: fixturePublic, withIntermediateDirectories: true)
  if fileManager.fileExists(atPath: sourceDirectory.path) {
    let fixtureSources = fixtureRoot.appendingPathComponent("assets/anime-face-sources", isDirectory: true)
    try fileManager.createDirectory(
      at: fixtureSources.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try fileManager.copyItem(at: sourceDirectory, to: fixtureSources)
  }
} catch {
  fail("could not create fixture: \(error)")
}

let moduleCache = fixtureRoot.appendingPathComponent("swift-module-cache", isDirectory: true)
runBuilder(in: fixtureRoot, moduleCache: moduleCache)
let firstBuild: [String: Data]
do {
  firstBuild = try readAssets(in: fixtureRoot.appendingPathComponent("public"))
} catch {
  fail("could not read first build: \(error)")
}
let mismatchedCheckedInAssets = assetNames.filter { firstBuild[$0] != checkedInBuild[$0] }
guard mismatchedCheckedInAssets.isEmpty else {
  fail("clean build differs from checked-in assets: \(mismatchedCheckedInAssets.joined(separator: ", "))")
}

runBuilder(in: fixtureRoot, moduleCache: moduleCache)
let secondBuild: [String: Data]
do {
  secondBuild = try readAssets(in: fixtureRoot.appendingPathComponent("public"))
} catch {
  fail("could not read second build: \(error)")
}
let driftedAssets = assetNames.filter { secondBuild[$0] != firstBuild[$0] }
guard driftedAssets.isEmpty else {
  fail("repeated builds changed: \(driftedAssets.joined(separator: ", "))")
}

print("Verified checked-in output and byte-identical repeated builds for 8 anime face assets")
