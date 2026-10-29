// Writes every frame of a video as PNG (frame-0000.png …), using macOS's own AVFoundation,
// so the red panda build needs no ffmpeg. Usage: swift extract_frames.swift <video> <out dir>
import AVFoundation
import AppKit

let arguments = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: arguments[1]))
let outDirectory = arguments[2]
let track = asset.tracks(withMediaType: .video)[0]
let fps = Double(track.nominalFrameRate)
let total = Int((CMTimeGetSeconds(asset.duration) * fps).rounded(.down))
let generator = AVAssetImageGenerator(asset: asset)
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero
var written = 0
for index in 0..<total {
  let time = CMTime(seconds: (Double(index) + 0.5) / fps, preferredTimescale: 6000)
  // A frame the decoder cannot give (rarely, the last one) is skipped rather than fatal.
  guard let image = try? generator.copyCGImage(at: time, actualTime: nil),
    let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { continue }
  try png.write(to: URL(fileURLWithPath: String(format: "%@/frame-%04d.png", outDirectory, index)))
  written += 1
}
print("\(written) frames at \(fps) fps")
