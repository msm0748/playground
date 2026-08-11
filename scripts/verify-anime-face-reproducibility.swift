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

do {
  let fixturePublic = fixtureRoot.appendingPathComponent("public", isDirectory: true)
  try fileManager.createDirectory(at: fixturePublic, withIntermediateDirectories: true)
  for name in assetNames {
    try fileManager.copyItem(
      at: repositoryRoot.appendingPathComponent("public/\(name)"),
      to: fixturePublic.appendingPathComponent(name)
    )
  }
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
  firstBuild = try Dictionary(uniqueKeysWithValues: assetNames.map { name in
    let path = fixtureRoot.appendingPathComponent("public/\(name)")
    return (name, try Data(contentsOf: path))
  })
} catch {
  fail("could not read first build: \(error)")
}

runBuilder(in: fixtureRoot, moduleCache: moduleCache)
let driftedAssets = assetNames.filter { name in
  let path = fixtureRoot.appendingPathComponent("public/\(name)")
  guard let currentBuild = try? Data(contentsOf: path) else { return true }
  return currentBuild != firstBuild[name]
}
guard driftedAssets.isEmpty else {
  fail("repeated builds changed: \(driftedAssets.joined(separator: ", "))")
}

print("Verified byte-identical repeated builds for 8 anime face assets")
