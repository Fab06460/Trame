// Rastérise un PDF avec PDFKit à la taille du design, le compare à l'image Konva correspondante et extrait son texte.
// usage : swift compare.swift <pdf> <prefixe-konva> <largeur-design> <prefixe-sortie-pdf>
// Sortie : une ligne JSON par page.
import Foundation
import PDFKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func bitmap(_ w: Int, _ h: Int) -> CGContext {
  CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

func pixels(_ ctx: CGContext) -> [UInt8] {
  let n = ctx.width * ctx.height * 4
  return Array(UnsafeBufferPointer(start: ctx.data!.assumingMemoryBound(to: UInt8.self), count: n))
}

func write(_ img: CGImage, _ path: String) {
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, img, nil)
  CGImageDestinationFinalize(dest)
}

let args = CommandLine.arguments
guard args.count >= 5, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])), let designW = Double(args[3]) else {
  FileHandle.standardError.write("usage: compare.swift pdf konvaPrefix designWidth outPrefix\n".data(using: .utf8)!); exit(2)
}

for i in 0..<doc.pageCount {
  let page = doc.page(at: i)!
  let box = page.bounds(for: .mediaBox)
  let scale = designW / Double(box.width)
  let w = Int((Double(box.width) * scale).rounded()), h = Int((Double(box.height) * scale).rounded())

  let pdfCtx = bitmap(w, h)
  pdfCtx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  pdfCtx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  pdfCtx.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
  page.draw(with: .mediaBox, to: pdfCtx)
  write(pdfCtx.makeImage()!, "\(args[4])-\(i + 1).png")

  var result: [String: Any] = ["page": i + 1, "width": w, "height": h,
                               "text": (page.string ?? "").replacingOccurrences(of: "\n", with: " ")]
  let konvaURL = URL(fileURLWithPath: "\(args[2])-\(i + 1).png")
  if let src = CGImageSourceCreateWithURL(konvaURL as CFURL, nil), let kimg = CGImageSourceCreateImageAtIndex(src, 0, nil) {
    if kimg.width == w && kimg.height == h {
      let kctx = bitmap(w, h)
      kctx.draw(kimg, in: CGRect(x: 0, y: 0, width: w, height: h))
      let a = pixels(kctx), b = pixels(pdfCtx)
      var sum = 0, big = 0
      for p in 0..<(w * h) {
        let d = max(abs(Int(a[p * 4]) - Int(b[p * 4])), abs(Int(a[p * 4 + 1]) - Int(b[p * 4 + 1])), abs(Int(a[p * 4 + 2]) - Int(b[p * 4 + 2])))
        sum += d
        if d > 64 { big += 1 }
      }
      result["meanDiff"] = Double(sum) / Double(w * h)
      result["bigPct"] = Double(big) * 100 / Double(w * h)
    } else {
      result["error"] = "taille différente : PDF \(w)x\(h), Konva \(kimg.width)x\(kimg.height)"
    }
  } else {
    result["error"] = "image Konva introuvable"
  }
  let data = try! JSONSerialization.data(withJSONObject: result)
  print(String(data: data, encoding: .utf8)!)
}
