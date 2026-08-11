import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct RGBAImage {
  let width: Int
  let height: Int
  var pixels: [UInt8]

  func offset(x: Int, y: Int) -> Int { (y * width + x) * 4 }
}

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

struct EyePatch {
  let cx: Double
  let cy: Double
  let rx: Double
  let ry: Double
}

enum AssetError: Error, CustomStringConvertible {
  case message(String)

  var description: String {
    switch self {
    case .message(let message): message
    }
  }
}

let faceKeepEllipse = Ellipse(cx: 512, cy: 565, rx: 285, ry: 330)

func loadPNG(_ path: String) throws -> RGBAImage {
  let url = URL(fileURLWithPath: path)
  guard
    let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else {
    throw AssetError.message("\(path): could not decode PNG")
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
  guard rendered else {
    throw AssetError.message("\(path): could not create RGBA bitmap context")
  }

  return RGBAImage(width: width, height: height, pixels: pixels)
}

func writePNG(_ image: RGBAImage, to path: String) throws {
  let data = Data(image.pixels)
  guard
    let provider = CGDataProvider(data: data as CFData),
    let cgImage = CGImage(
      width: image.width,
      height: image.height,
      bitsPerComponent: 8,
      bitsPerPixel: 32,
      bytesPerRow: image.width * 4,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
      provider: provider,
      decode: nil,
      shouldInterpolate: false,
      intent: .defaultIntent
    )
  else {
    throw AssetError.message("\(path): could not create RGBA image")
  }

  let url = URL(fileURLWithPath: path)
  guard
    let destination = CGImageDestinationCreateWithURL(
      url as CFURL,
      UTType.png.identifier as CFString,
      1,
      nil
    )
  else {
    throw AssetError.message("\(path): could not create PNG destination")
  }

  CGImageDestinationAddImage(destination, cgImage, nil)
  guard CGImageDestinationFinalize(destination) else {
    throw AssetError.message("\(path): could not encode PNG")
  }
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

func cleanExteriorAlphaMatte(from image: RGBAImage) -> [UInt8] {
  var matte = [UInt8](repeating: 0, count: image.width * image.height)

  for y in 0..<image.height {
    for x in 0..<image.width {
      let pixelOffset = image.offset(x: x, y: y)
      var alpha = image.pixels[pixelOffset + 3]
      let r = unpremultiplied(image.pixels[pixelOffset], alpha: alpha)
      let g = unpremultiplied(image.pixels[pixelOffset + 1], alpha: alpha)
      let b = unpremultiplied(image.pixels[pixelOffset + 2], alpha: alpha)

      if !faceKeepEllipse.contains(x, y) && isNeutralResidue(r: r, g: g, b: b) { alpha = 0 }
      if alpha <= 8 { alpha = 0 }
      matte[y * image.width + x] = alpha
    }
  }

  var contracted = matte
  for y in 0..<image.height {
    for x in 0..<image.width where !faceKeepEllipse.contains(x, y) {
      let index = y * image.width + x
      let alpha = matte[index]
      guard alpha > 0 && alpha < 255 else { continue }

      var localMinimum = alpha
      for neighborY in max(0, y - 1)...min(image.height - 1, y + 1) {
        for neighborX in max(0, x - 1)...min(image.width - 1, x + 1) {
          localMinimum = min(localMinimum, matte[neighborY * image.width + neighborX])
        }
      }
      contracted[index] = localMinimum
    }
  }

  var feathered = matte
  for y in 0..<image.height {
    for x in 0..<image.width where !faceKeepEllipse.contains(x, y) {
      let index = y * image.width + x
      feathered[index] = UInt8(
        (Double(matte[index]) * 0.75 + Double(contracted[index]) * 0.25).rounded()
      )
    }
  }
  return feathered
}

func buildWink(base: RGBAImage, closed: RGBAImage, patch: EyePatch) -> RGBAImage {
  precondition(base.width == closed.width && base.height == closed.height)
  var result = base

  for y in 0..<base.height {
    for x in 0..<base.width {
      let dx = Double(x) - patch.cx
      let dy = Double(y) - patch.cy
      let normalizedRadius = sqrt(dx * dx / (patch.rx * patch.rx) + dy * dy / (patch.ry * patch.ry))
      guard normalizedRadius <= 1 else { continue }

      let radius = hypot(dx, dy)
      let edgeRadius: Double
      if radius == 0 {
        edgeRadius = min(patch.rx, patch.ry)
      } else {
        let cosine = dx / radius
        let sine = dy / radius
        edgeRadius = 1 / sqrt(
          cosine * cosine / (patch.rx * patch.rx) + sine * sine / (patch.ry * patch.ry)
        )
      }
      let blend = min(1, max(0, (edgeRadius - radius) / 12))
      let pixelOffset = base.offset(x: x, y: y)
      for channel in 0..<4 {
        let baseValue = Double(base.pixels[pixelOffset + channel])
        let closedValue = Double(closed.pixels[pixelOffset + channel])
        result.pixels[pixelOffset + channel] = UInt8(
          (baseValue * (1 - blend) + closedValue * blend).rounded()
        )
      }
    }
  }

  return result
}

func applyExteriorAlpha(_ exteriorAlpha: [UInt8], to image: RGBAImage, fallback: RGBAImage) -> RGBAImage {
  precondition(image.width == fallback.width && image.height == fallback.height)
  precondition(exteriorAlpha.count == image.width * image.height)
  var result = image

  for y in 0..<image.height {
    for x in 0..<image.width where !faceKeepEllipse.contains(x, y) {
      let pixelIndex = y * image.width + x
      let pixelOffset = pixelIndex * 4
      let oldAlpha = image.pixels[pixelOffset + 3]
      let newAlpha = exteriorAlpha[pixelIndex]

      if newAlpha == 0 {
        result.pixels[pixelOffset] = 0
        result.pixels[pixelOffset + 1] = 0
        result.pixels[pixelOffset + 2] = 0
        result.pixels[pixelOffset + 3] = 0
        continue
      }

      let sourceR = unpremultiplied(image.pixels[pixelOffset], alpha: oldAlpha)
      let sourceG = unpremultiplied(image.pixels[pixelOffset + 1], alpha: oldAlpha)
      let sourceB = unpremultiplied(image.pixels[pixelOffset + 2], alpha: oldAlpha)
      let sourceIsNeutralResidue =
        oldAlpha > 0 && isNeutralResidue(r: sourceR, g: sourceG, b: sourceB)
      let colorSource: RGBAImage
      let colorAlpha: UInt8
      if oldAlpha > 0 && !sourceIsNeutralResidue {
        colorSource = image
        colorAlpha = oldAlpha
      } else {
        colorSource = fallback
        colorAlpha = fallback.pixels[pixelOffset + 3]
      }

      for channel in 0..<3 {
        let premultiplied = colorSource.pixels[pixelOffset + channel]
        let straight = colorAlpha == 0 ? 0 : Double(premultiplied) / Double(colorAlpha)
        result.pixels[pixelOffset + channel] = UInt8(
          min(Double(newAlpha), (straight * Double(newAlpha)).rounded())
        )
      }
      result.pixels[pixelOffset + 3] = newAlpha
    }
  }

  for pixelOffset in stride(from: 0, to: result.pixels.count, by: 4)
  where result.pixels[pixelOffset + 3] == 0 {
    result.pixels[pixelOffset] = 0
    result.pixels[pixelOffset + 1] = 0
    result.pixels[pixelOffset + 2] = 0
  }

  return result
}

func exteriorAlphaBytes(of image: RGBAImage) -> [UInt8] {
  var bytes: [UInt8] = []
  bytes.reserveCapacity(image.width * image.height)
  for y in 0..<image.height {
    for x in 0..<image.width where !faceKeepEllipse.contains(x, y) {
      bytes.append(image.pixels[image.offset(x: x, y: y) + 3])
    }
  }
  return bytes
}

func validateInMemory(_ outputs: [(path: String, image: RGBAImage)]) throws {
  guard outputs.count == 8 else {
    throw AssetError.message("expected eight output images")
  }

  var referenceExteriorAlphaBytes: [UInt8]?
  for output in outputs {
    let image = output.image
    guard image.width == 1024, image.height == 1024, image.pixels.count == 1024 * 1024 * 4 else {
      throw AssetError.message("\(output.path): expected 1024x1024 RGBA")
    }

    func alphaAt(_ x: Int, _ y: Int) -> UInt8 { image.pixels[image.offset(x: x, y: y) + 3] }
    guard
      alphaAt(0, 0) == 0,
      alphaAt(1023, 0) == 0,
      alphaAt(0, 1023) == 0,
      alphaAt(1023, 1023) == 0
    else {
      throw AssetError.message("\(output.path): corners must be transparent")
    }

    let alphaBytes = exteriorAlphaBytes(of: image)
    if referenceExteriorAlphaBytes == nil {
      referenceExteriorAlphaBytes = alphaBytes
    } else if alphaBytes != referenceExteriorAlphaBytes {
      throw AssetError.message("\(output.path): exterior alpha differs from reference")
    }
  }
}

do {
  let sourceDirectory = "assets/anime-face-sources"
  let neutral = try loadPNG("\(sourceDirectory)/anime-face-overlay.png")
  let blink = try loadPNG("\(sourceDirectory)/anime-face-eyes-closed.png")
  let mouth = try loadPNG("\(sourceDirectory)/anime-face-mouth-open.png")
  let blinkMouth = try loadPNG("\(sourceDirectory)/anime-face-blink-mouth.png")
  let sourceImages = [neutral, blink, mouth, blinkMouth]
  guard sourceImages.allSatisfy({ $0.width == 1024 && $0.height == 1024 }) else {
    throw AssetError.message("source frames must all be registered 1024x1024 images")
  }

  let exteriorAlpha = cleanExteriorAlphaMatte(from: neutral)
  let anatomicalLeft = EyePatch(cx: 646, cy: 558, rx: 128, ry: 92)
  let anatomicalRight = EyePatch(cx: 378, cy: 558, rx: 128, ry: 92)
  let winkLeft = buildWink(base: neutral, closed: blink, patch: anatomicalLeft)
  let winkRight = buildWink(base: neutral, closed: blink, patch: anatomicalRight)
  let winkLeftMouth = buildWink(base: mouth, closed: blinkMouth, patch: anatomicalLeft)
  let winkRightMouth = buildWink(base: mouth, closed: blinkMouth, patch: anatomicalRight)

  let rawOutputs = [
    ("public/anime-face-overlay.png", neutral),
    ("public/anime-face-eyes-closed.png", blink),
    ("public/anime-face-mouth-open.png", mouth),
    ("public/anime-face-blink-mouth.png", blinkMouth),
    ("public/anime-face-wink-left.png", winkLeft),
    ("public/anime-face-wink-right.png", winkRight),
    ("public/anime-face-wink-left-mouth.png", winkLeftMouth),
    ("public/anime-face-wink-right-mouth.png", winkRightMouth),
  ]
  let outputs = rawOutputs.map { path, image in
    (path: path, image: applyExteriorAlpha(exteriorAlpha, to: image, fallback: neutral))
  }

  try validateInMemory(outputs)
  for output in outputs {
    try writePNG(output.image, to: output.path)
    print("\(output.path): 1024x1024 RGBA")
  }
} catch {
  FileHandle.standardError.write(Data("Asset build failed: \(error)\n".utf8))
  exit(1)
}
