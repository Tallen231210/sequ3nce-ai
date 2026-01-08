//
//  AudioCaptureService.swift
//  Sequ3nce
//
//  Captures system audio (prospect) and microphone audio (closer) using Core Audio Taps
//  Requires macOS 14.4+ for Process Tap API
//

import Foundation
import AVFoundation
import CoreAudio
import AudioToolbox
import Combine

/// Audio format constants matching backend expectations
struct AudioFormat {
    static let sampleRate: Double = 48000
    static let channels: UInt32 = 2  // Stereo: Left=Mic, Right=System
    static let bitsPerSample: UInt32 = 16
    static let bytesPerSample: UInt32 = 2
    static let bytesPerFrame: UInt32 = channels * bytesPerSample
}

/// Errors that can occur during audio capture
enum AudioCaptureError: Error, LocalizedError {
    case macOSVersionTooOld
    case microphonePermissionDenied
    case systemAudioPermissionDenied
    case microphoneSetupFailed(String)
    case systemAudioSetupFailed(String)
    case noAudioDeviceFound
    case tapCreationFailed(String)

    var errorDescription: String? {
        switch self {
        case .macOSVersionTooOld:
            return "Sequ3nce requires macOS 14.4 or later for system audio capture."
        case .microphonePermissionDenied:
            return "Microphone permission was denied. Please enable in System Settings > Privacy & Security > Microphone."
        case .systemAudioPermissionDenied:
            return "System audio permission was denied."
        case .microphoneSetupFailed(let details):
            return "Failed to set up microphone: \(details)"
        case .systemAudioSetupFailed(let details):
            return "Failed to set up system audio: \(details)"
        case .noAudioDeviceFound:
            return "No audio input device found."
        case .tapCreationFailed(let details):
            return "Failed to create audio tap: \(details)"
        }
    }
}

/// Service for capturing audio from microphone and system
@MainActor
class AudioCaptureService: ObservableObject {
    // MARK: - Published Properties
    @Published var micLevel: Float = 0.0
    @Published var systemLevel: Float = 0.0
    @Published var isCapturing: Bool = false
    @Published var error: AudioCaptureError?

    // MARK: - Audio Engines
    private var micEngine: AVAudioEngine?
    private var systemAudioCapture: SystemAudioCapture?

    // MARK: - Audio Buffers
    private var micBuffer: AVAudioPCMBuffer?
    private var systemBuffer: [Float] = []

    // MARK: - Callbacks
    var onAudioData: ((Data) -> Void)?

    // MARK: - Private Properties
    private var isSetUp = false
    private nonisolated(unsafe) var bufferSize: AVAudioFrameCount = 4096

    // Ring buffers for audio mixing - nonisolated for cross-thread access (protected by lock)
    private nonisolated(unsafe) var micRingBuffer: [Float] = []
    private nonisolated(unsafe) var systemRingBuffer: [Float] = []
    private nonisolated(unsafe) var ringBufferLock = NSLock()

    // Atomic flag for capture state (accessed from timer closures)
    private nonisolated(unsafe) var _isCapturingAtomic: Bool = false

    // Timer for periodic buffer mixing/sending
    private var mixTimer: Timer?

    // MARK: - Initialization
    init() {
        // Check macOS version
        if #unavailable(macOS 14.4) {
            self.error = .macOSVersionTooOld
        }
    }

    // MARK: - Public Methods

    /// Request microphone permission
    func requestMicrophonePermission() async -> Bool {
        let status = AVCaptureDevice.authorizationStatus(for: .audio)

        switch status {
        case .authorized:
            return true
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: .audio)
        case .denied, .restricted:
            return false
        @unknown default:
            return false
        }
    }

    /// Set up audio capture (call before startCapture)
    func setup() async throws {
        guard #available(macOS 14.4, *) else {
            throw AudioCaptureError.macOSVersionTooOld
        }

        // Request microphone permission
        let hasPermission = await requestMicrophonePermission()
        guard hasPermission else {
            throw AudioCaptureError.microphonePermissionDenied
        }

        // Set up microphone capture
        try setupMicrophone()

        // Set up system audio tap
        try await setupSystemAudioTap()

        isSetUp = true
        print("[AudioCaptureService] Setup complete")
    }

    /// Start capturing audio
    func startCapture() throws {
        guard isSetUp else {
            print("[AudioCaptureService] Error: Not set up yet")
            return
        }

        // Start microphone engine
        try micEngine?.start()

        // Set atomic flag before starting timer
        _isCapturingAtomic = true
        isCapturing = true

        // Start mix timer (sends combined audio every ~85ms for smooth streaming)
        mixTimer = Timer.scheduledTimer(withTimeInterval: 0.085, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.mixAndSendAudio()
            }
        }

        print("[AudioCaptureService] Capture started")
    }

    /// Stop capturing audio
    func stopCapture() {
        // Set atomic flag first to stop timers
        _isCapturingAtomic = false
        isCapturing = false

        micEngine?.stop()
        mixTimer?.invalidate()
        mixTimer = nil

        // Stop system audio capture
        systemAudioCapture?.stop()

        // Clear buffers
        ringBufferLock.lock()
        micRingBuffer.removeAll()
        systemRingBuffer.removeAll()
        ringBufferLock.unlock()

        print("[AudioCaptureService] Capture stopped")
    }

    /// Clean up resources
    func cleanup() {
        _isCapturingAtomic = false
        stopCapture()

        // Clean up system audio tap
        removeSystemAudioTap()

        micEngine = nil
        isSetUp = false
        print("[AudioCaptureService] Cleanup complete")
    }

    // MARK: - Private Methods

    private func setupMicrophone() throws {
        let engine = AVAudioEngine()
        let inputNode = engine.inputNode

        // Get the native format first
        let nativeFormat = inputNode.inputFormat(forBus: 0)
        print("[AudioCaptureService] Native mic format: \(nativeFormat)")

        // Verify we have a valid format
        guard nativeFormat.sampleRate > 0 else {
            throw AudioCaptureError.microphoneSetupFailed("Invalid sample rate")
        }

        // Install tap on input node
        inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: nativeFormat) { [weak self] buffer, time in
            self?.processMicrophoneBuffer(buffer)
        }

        // Prepare the engine
        engine.prepare()

        self.micEngine = engine
        print("[AudioCaptureService] Microphone setup complete")
    }

    @available(macOS 14.4, *)
    private func setupSystemAudioTap() async throws {
        print("[AudioCaptureService] Setting up system audio capture with Core Audio Taps...")

        // Create the system audio capture instance
        let capture = SystemAudioCapture()

        // Debug counter
        var systemAudioCallbackCount = 0

        // Set up callback to receive system audio samples
        capture.onAudioData = { [weak self] samples in
            guard let self = self else { return }

            systemAudioCallbackCount += 1
            if systemAudioCallbackCount % 100 == 1 {
                print("[AudioCaptureService] Received \(samples.count) system audio samples (callback #\(systemAudioCallbackCount))")
            }

            // Update system audio level on main thread
            Task { @MainActor in
                self.systemLevel = capture.level
            }

            // Add samples to ring buffer
            self.ringBufferLock.lock()
            self.systemRingBuffer.append(contentsOf: samples)
            // Keep buffer from growing unbounded
            if self.systemRingBuffer.count > Int(self.bufferSize) * 4 {
                self.systemRingBuffer.removeFirst(Int(self.bufferSize))
            }
            if systemAudioCallbackCount % 100 == 1 {
                print("[AudioCaptureService] systemRingBuffer size: \(self.systemRingBuffer.count)")
            }
            self.ringBufferLock.unlock()
        }

        // Try to start the capture
        do {
            try capture.start()
            self.systemAudioCapture = capture
            print("[AudioCaptureService] System audio capture initialized successfully")
        } catch {
            print("[AudioCaptureService] Warning: System audio capture failed: \(error)")
            print("[AudioCaptureService] Falling back to silence for system audio channel")
            // Fall back to silence if system audio fails
            // This allows the app to still work for microphone-only recording
            startSilenceFallback()
        }
    }

    private func startSilenceFallback() {
        // Fallback: Generate silence for system audio channel
        // This allows recording to work even if system audio capture fails
        let capturedBufferSize = Int(self.bufferSize)
        Timer.scheduledTimer(withTimeInterval: 0.085, repeats: true) { [weak self] _ in
            guard let self = self, self._isCapturingAtomic else { return }

            let silentSamples = Array(repeating: Float(0.0), count: capturedBufferSize)

            self.ringBufferLock.lock()
            self.systemRingBuffer.append(contentsOf: silentSamples)
            if self.systemRingBuffer.count > capturedBufferSize * 4 {
                self.systemRingBuffer.removeFirst(capturedBufferSize)
            }
            self.ringBufferLock.unlock()
        }
    }

    private func removeSystemAudioTap() {
        // Clean up the system audio capture
        systemAudioCapture?.cleanup()
        systemAudioCapture = nil
    }

    // Debug counter for mic processing
    private nonisolated(unsafe) var micProcessCount = 0

    private func processMicrophoneBuffer(_ buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData else { return }

        micProcessCount += 1

        let frameCount = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)

        // Log detailed info on first few callbacks
        if micProcessCount <= 5 {
            print("[AudioCaptureService] Mic buffer #\(micProcessCount): frameCount=\(frameCount), channels=\(channelCount)")

            // Print first 10 float values
            var floatValues: [Float] = []
            for i in 0..<min(10, frameCount) {
                floatValues.append(channelData[0][i])
            }
            print("[AudioCaptureService] Mic first 10 float values: \(floatValues)")

            // Calculate quick RMS of first 100 samples
            var sumSquares: Float = 0
            for i in 0..<min(100, frameCount) {
                sumSquares += channelData[0][i] * channelData[0][i]
            }
            let quickRMS = sqrt(sumSquares / Float(min(100, frameCount)))
            print("[AudioCaptureService] Mic quick RMS (first 100 samples): \(quickRMS)")
        }

        // Convert to mono if stereo
        var monoSamples: [Float] = []
        monoSamples.reserveCapacity(frameCount)

        for frame in 0..<frameCount {
            var sample: Float = 0.0
            for channel in 0..<channelCount {
                sample += channelData[channel][frame]
            }
            sample /= Float(channelCount)
            monoSamples.append(sample)
        }

        // Resample to 48kHz if needed
        let currentRate = buffer.format.sampleRate
        if currentRate != AudioFormat.sampleRate {
            monoSamples = resample(samples: monoSamples, fromRate: currentRate, toRate: AudioFormat.sampleRate)
        }

        // Calculate level for UI
        let level = calculateRMSLevel(samples: monoSamples)
        Task { @MainActor in
            self.micLevel = level
        }

        // Add to ring buffer
        ringBufferLock.lock()
        micRingBuffer.append(contentsOf: monoSamples)
        // Keep buffer from growing unbounded
        if micRingBuffer.count > Int(bufferSize) * 4 {
            micRingBuffer.removeFirst(Int(bufferSize))
        }
        if micProcessCount % 100 == 1 {
            print("[AudioCaptureService] micRingBuffer size: \(micRingBuffer.count)")
        }
        ringBufferLock.unlock()
    }

    // Debug counter for mix timer
    private nonisolated(unsafe) var mixCallCount = 0

    private func mixAndSendAudio() {
        mixCallCount += 1

        ringBufferLock.lock()

        // Determine how many frames we can process
        let micFrames = micRingBuffer.count
        let systemFrames = systemRingBuffer.count
        let framesToProcess = min(micFrames, systemFrames, Int(bufferSize))

        // Log buffer status periodically
        if mixCallCount % 50 == 1 {
            print("[AudioCaptureService] mixAndSendAudio #\(mixCallCount): micFrames=\(micFrames), systemFrames=\(systemFrames), framesToProcess=\(framesToProcess)")
        }

        guard framesToProcess > 0 else {
            ringBufferLock.unlock()
            if mixCallCount % 50 == 1 {
                print("[AudioCaptureService] mixAndSendAudio: No frames to process!")
            }
            return
        }

        // Get samples from both buffers
        let micSamples = Array(micRingBuffer.prefix(framesToProcess))
        let systemSamples = Array(systemRingBuffer.prefix(framesToProcess))

        // Remove processed samples
        micRingBuffer.removeFirst(min(framesToProcess, micRingBuffer.count))
        systemRingBuffer.removeFirst(min(framesToProcess, systemRingBuffer.count))

        ringBufferLock.unlock()

        // Create interleaved stereo Int16 PCM data
        // Format: [L0, R0, L1, R1, ...] where L=Mic, R=System
        var interleavedData = Data()
        interleavedData.reserveCapacity(framesToProcess * Int(AudioFormat.bytesPerFrame))

        for i in 0..<framesToProcess {
            let micSample = i < micSamples.count ? micSamples[i] : 0.0
            let systemSample = i < systemSamples.count ? systemSamples[i] : 0.0

            // Convert Float (-1.0 to 1.0) to Int16
            let micInt16 = floatToInt16(micSample)
            let systemInt16 = floatToInt16(systemSample)

            // Append in little-endian format (interleaved: L, R)
            withUnsafeBytes(of: micInt16.littleEndian) { interleavedData.append(contentsOf: $0) }
            withUnsafeBytes(of: systemInt16.littleEndian) { interleavedData.append(contentsOf: $0) }
        }

        // Log data being sent
        if mixCallCount % 50 == 1 {
            print("[AudioCaptureService] Sending \(interleavedData.count) bytes of interleaved audio")
        }

        // Send to callback
        if let callback = onAudioData {
            callback(interleavedData)
        } else if mixCallCount % 50 == 1 {
            print("[AudioCaptureService] WARNING: onAudioData callback is nil!")
        }
    }

    // MARK: - Audio Processing Utilities

    private func floatToInt16(_ value: Float) -> Int16 {
        // Clamp to -1.0 to 1.0 range
        let clamped = max(-1.0, min(1.0, value))
        // Convert to Int16 range
        return Int16(clamped * Float(Int16.max))
    }

    private func calculateRMSLevel(samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0.0 }

        let sumOfSquares = samples.reduce(0.0) { $0 + $1 * $1 }
        let rms = sqrt(sumOfSquares / Float(samples.count))

        // Convert to 0-1 range with some scaling for UI
        return min(1.0, rms * 2.0)
    }

    private func resample(samples: [Float], fromRate: Double, toRate: Double) -> [Float] {
        guard fromRate != toRate else { return samples }

        let ratio = toRate / fromRate
        let newCount = Int(Double(samples.count) * ratio)

        var resampled: [Float] = []
        resampled.reserveCapacity(newCount)

        for i in 0..<newCount {
            let srcIndex = Double(i) / ratio
            let srcIndexInt = Int(srcIndex)
            let srcIndexFrac = Float(srcIndex - Double(srcIndexInt))

            let sample1 = samples[min(srcIndexInt, samples.count - 1)]
            let sample2 = samples[min(srcIndexInt + 1, samples.count - 1)]

            // Linear interpolation
            let interpolated = sample1 * (1.0 - srcIndexFrac) + sample2 * srcIndexFrac
            resampled.append(interpolated)
        }

        return resampled
    }
}
