// Renders the macOS app icon set from icons/icon.svg: the mark on a white rounded square laid out on Apple's 1024 px
// icon grid (an 824 px body, 100 px margin for the shadow). Run from the repository root:
//     swift safari/app-icon.swift
import AppKit

let svg = URL(fileURLWithPath: "icons/icon.svg")
let set = URL(fileURLWithPath: "safari/ContApp SPV/ContApp SPV/Assets.xcassets/AppIcon.appiconset")

guard let mark = NSImage(contentsOf: svg) else {
    fatalError("cannot read \(svg.path)")
}

func render(_ pixels: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    let unit = CGFloat(pixels) / 1024

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    let body = NSRect(x: 100 * unit, y: 100 * unit, width: 824 * unit, height: 824 * unit)
    let squircle = NSBezierPath(roundedRect: body, xRadius: 185 * unit, yRadius: 185 * unit)
    let shadow = NSShadow()
    shadow.shadowOffset = NSSize(width: 0, height: -10 * unit)
    shadow.shadowBlurRadius = 20 * unit
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.3)

    NSGraphicsContext.saveGraphicsState()
    shadow.set()
    NSColor.white.setFill()
    squircle.fill()
    NSGraphicsContext.restoreGraphicsState()

    // The SVG keeps its artwork inside 112 of its 128 units, which leaves the mark its own margin inside the body.
    mark.draw(in: body.insetBy(dx: 48 * unit, dy: 48 * unit))

    NSGraphicsContext.restoreGraphicsState()

    return rep.representation(using: .png, properties: [:])!
}

for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        try! render(size * scale).write(to: set.appendingPathComponent("mac-icon-\(size)@\(scale)x.png"))
    }
}

try! render(256).write(to: URL(fileURLWithPath: "safari/ContApp SPV/ContApp SPV/Resources/Icon.png"))
print("wrote \(set.path)")
