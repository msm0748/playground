import CoreGraphics
import Foundation
import ImageIO

struct Ellipse {
  let cx: Double
  let cy: Double
  let rx: Double
  let ry: Double

  func contains(_ x: Int, _ y: Int) -> Bool {
    let dx = (Double(x) - cx) / rx
    let dy = (Double(y) - cy) / ry
    return dx * dx + dy * dy <= 1
  }
}

let assetPaths = [
  "public/anime-face-overlay.png",
  "public/anime-face-eyes-closed.png",
  "public/anime-face-mouth-open.png",
  "public/anime-face-blink-mouth.png",
  "public/anime-face-wink-left.png",
  "public/anime-face-wink-right.png",
  "public/anime-face-wink-left-mouth.png",
  "public/anime-face-wink-right-mouth.png",
]
let faceKeepEllipse = Ellipse(cx: 512, cy: 565, rx: 285, ry: 330)
let residueAlphaProbePoints = [(143, 851), (92, 861), (802, 933), (240, 943), (685, 952)]
let residueColorProbePoints = [(192, 936), (804, 942)]

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("Asset verification failed: \(message)\n".utf8))
  exit(1)
}

func loadAlpha(at path: String) -> (
  width: Int,
  height: Int,
  bitsPerPixel: Int,
  pixels: [UInt8],
  alpha: [UInt8]
) {
  let url = URL(fileURLWithPath: path)
  guard
    let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else {
    fail("\(path): could not decode PNG")
  }

  let width = image.width
  let height = image.height
  var pixels = [UInt8](repeating: 0, count: width * height * 4)
  let rendered = pixels.withUnsafeMutableBytes { bytes -> Bool in
    guard
      let baseAddress = bytes.baseAddress,
      let context = CGContext(
        data: baseAddress,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      )
    else { return false }

    context.interpolationQuality = .none
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    return true
  }
  guard rendered else { fail("\(path): could not render RGBA pixels") }

  return (
    width: width,
    height: height,
    bitsPerPixel: image.bitsPerPixel,
    pixels: pixels,
    alpha: stride(from: 3, to: pixels.count, by: 4).map { pixels[$0] }
  )
}

func unpremultiplied(_ value: UInt8, alpha: UInt8) -> UInt8 {
  guard alpha > 0 else { return 0 }
  return UInt8(min(255, (Double(value) * 255 / Double(alpha)).rounded()))
}

func isNeutralResidue(r: UInt8, g: UInt8, b: UInt8) -> Bool {
  let minimum = min(r, min(g, b))
  let maximum = max(r, max(g, b))
  return minimum >= 185 && Int(maximum) - Int(minimum) <= 35
}

func isNeutralResidue(_ pixels: [UInt8], width: Int, x: Int, y: Int) -> Bool {
  let pixelOffset = (y * width + x) * 4
  let alpha = pixels[pixelOffset + 3]
  guard alpha > 0 else { return false }
  let r = unpremultiplied(pixels[pixelOffset], alpha: alpha)
  let g = unpremultiplied(pixels[pixelOffset + 1], alpha: alpha)
  let b = unpremultiplied(pixels[pixelOffset + 2], alpha: alpha)
  return isNeutralResidue(r: r, g: g, b: b)
}

for path in assetPaths where !FileManager.default.fileExists(atPath: path) {
  fail("\(path): missing")
}

var referenceExteriorAlphaBytes: [UInt8]?
for path in assetPaths {
  let decoded = loadAlpha(at: path)
  let width = decoded.width
  let height = decoded.height
  let bitsPerPixel = decoded.bitsPerPixel
  let pixels = decoded.pixels
  let alphaBytes = decoded.alpha

  guard width == 1024, height == 1024 else { fail("\(path): expected 1024x1024") }
  guard bitsPerPixel == 32 else { fail("\(path): expected RGBA") }
  func alphaAt(_ x: Int, _ y: Int) -> UInt8 { alphaBytes[y * width + x] }
  guard
    alphaAt(0, 0) == 0,
    alphaAt(1023, 0) == 0,
    alphaAt(0, 1023) == 0,
    alphaAt(1023, 1023) == 0
  else {
    fail("\(path): corners must be transparent")
  }
  guard residueAlphaProbePoints.allSatisfy({ alphaAt($0.0, $0.1) == 0 }) else {
    fail("\(path): neutral residue remains in hair gaps or below curls")
  }
  guard residueColorProbePoints.allSatisfy({
    !isNeutralResidue(pixels, width: width, x: $0.0, y: $0.1)
  }) else {
    fail("\(path): pale exterior color residue remains below curls")
  }

  var exteriorAlphaBytes: [UInt8] = []
  exteriorAlphaBytes.reserveCapacity(width * height)
  for y in 0..<height {
    for x in 0..<width where !faceKeepEllipse.contains(x, y) {
      let alpha = alphaAt(x, y)
      exteriorAlphaBytes.append(alpha)
    }
  }

  if referenceExteriorAlphaBytes == nil {
    referenceExteriorAlphaBytes = exteriorAlphaBytes
  } else {
    guard exteriorAlphaBytes == referenceExteriorAlphaBytes else {
      fail("\(path): exterior silhouette differs from anime-face-overlay.png")
    }
  }
}

print("Verified 8 anime face assets with shared exterior alpha")
