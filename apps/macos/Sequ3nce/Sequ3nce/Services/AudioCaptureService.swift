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
    case notSetUp  // FIX: Added for proper error throwing

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
        case .notSetUp:
            return "Audio capture not set up. Call setup() before startCapture()."
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

    // FIX: Store silence fallback timer to prevent orphaned timers
    private var silenceFallbackTimer: Timer?

    // MARK: - Diagnostic Properties
    private var healthCheckTimer: Timer?
    private nonisolated(unsafe) var lastMicCallbackTime: Date = Date()
    private nonisolated(unsafe) var totalChunksSent: Int = 0
    private nonisolated(unsafe) var captureStartTime: Date?
    private var configurationChangeObserver: NSObjectProtocol?
    private var hasReportedAudioDeath = false  // Only report once per session

    // MARK: - Silent Audio Detection
    // Tracks audio amplitude to detect when audio taps produce silence but are still running
    private nonisolated(unsafe) var maxRecentAmplitude: Float = 0.0  // Max amplitude in recent window
    private nonisolated(unsafe) var lastNonSilentTime: Date = Date()  // Last time we saw real audio
    private var hasReportedSilentAudio = false  // Only report once per session
    private var isRecoveringFromSilence = false  // Prevent re-entry during recovery
    private let SILENT_THRESHOLD: Float = 0.001  // Below this = silent (very low amplitude)
    private let SILENT_TIMEOUT_SECONDS: Double = 15.0  // Trigger recovery after this many seconds of silence

    // MARK: - Call Context (for error reporting)
    private var currentCallId: String?
    private var currentTeamId: String?
    private var currentCloserId: String?

    // MARK: - Initialization
    init() {
        // Check macOS version
        if #unavailable(macOS 14.4) {
            self.error = .macOSVersionTooOld
        }
    }

    // MARK: - Public Methods

    /// Set call context for error reporting (call before startCapture)
    func setCallContext(callId: String, teamId: String, closerId: String) {
        self.currentCallId = callId
        self.currentTeamId = teamId
        self.currentCloserId = closerId
        print("[AudioCaptureService] Call context set: callId=\(callId), teamId=\(teamId), closerId=\(closerId)")
    }

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
        print("[AudioCaptureService] setup() called - isSetUp=\(isSetUp), isCapturing=\(isCapturing)")

        guard #available(macOS 14.4, *) else {
            throw AudioCaptureError.macOSVersionTooOld
        }

        // FIX: Clean up any previous state first to prevent resource leaks
        if isSetUp {
            print("[AudioCaptureService] Already set up, cleaning up before re-setup")
            stopCapture()
            cleanup()
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
        print("[AudioCaptureService] startCapture() called - isSetUp=\(isSetUp), isCapturing=\(isCapturing)")

        guard isSetUp else {
            print("[AudioCaptureService] Error: Not set up yet")
            throw AudioCaptureError.notSetUp
        }

        // FIX: Guard against nil engine instead of optional chaining
        guard let engine = micEngine else {
            print("[AudioCaptureService] Error: micEngine is nil")
            throw AudioCaptureError.microphoneSetupFailed("Engine not initialized")
        }
        try engine.start()
        print("[AudioCaptureService] Microphone engine started successfully")

        // Set atomic flag before starting timer
        _isCapturingAtomic = true
        isCapturing = true

        // FIX: Invalidate existing timer before creating new one
        mixTimer?.invalidate()

        // Start mix timer (sends combined audio every ~85ms for smooth streaming)
        mixTimer = Timer.scheduledTimer(withTimeInterval: 0.085, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.mixAndSendAudio()
            }
        }

        // DIAGNOSTIC: Reset tracking variables
        captureStartTime = Date()
        totalChunksSent = 0
        lastMicCallbackTime = Date()
        hasReportedAudioDeath = false

        // SILENT AUDIO: Reset detection variables
        maxRecentAmplitude = 0.0
        lastNonSilentTime = Date()
        hasReportedSilentAudio = false
        isRecoveringFromSilence = false

        // DIAGNOSTIC: Start health check timer (every 5 seconds)
        healthCheckTimer?.invalidate()
        healthCheckTimer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.performHealthCheck()
            }
        }

        // DIAGNOSTIC: Listen for audio configuration changes
        setupAudioConfigurationChangeListener()

        print("[AudioCaptureService] Capture started")
    }

    /// Stop capturing audio
    func stopCapture() {
        print("[AudioCaptureService] stopCapture() called - isSetUp=\(isSetUp), isCapturing=\(isCapturing)")

        // Set atomic flag first to stop timers
        _isCapturingAtomic = false
        isCapturing = false

        micEngine?.stop()
        mixTimer?.invalidate()
        mixTimer = nil

        // FIX: Invalidate silence fallback timer
        silenceFallbackTimer?.invalidate()
        silenceFallbackTimer = nil

        // DIAGNOSTIC: Stop health check timer
        healthCheckTimer?.invalidate()
        healthCheckTimer = nil

        // DIAGNOSTIC: Remove audio configuration change listener
        removeAudioConfigurationChangeListener()

        // DIAGNOSTIC: Log final stats
        if let startTime = captureStartTime {
            let duration = Date().timeIntervalSince(startTime)
            print("[AudioCaptureService] DIAGNOSTIC: Session ended - duration=\(Int(duration))s, totalChunksSent=\(totalChunksSent)")
        }

        // Stop system audio capture
        systemAudioCapture?.stop()

        // Clear buffers
        ringBufferLock.lock()
        micRingBuffer.removeAll()
        systemRingBuffer.removeAll()
        ringBufferLock.unlock()

        // FIX: Reset isSetUp flag so next call requires fresh setup
        isSetUp = false

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
        // FIX: Clean up previous engine before creating new one
        if let existingEngine = micEngine {
            existingEngine.stop()
            existingEngine.inputNode.removeTap(onBus: 0)
            print("[AudioCaptureService] Cleaned up existing mic engine")
        }

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
        // FIX: Store timer reference so it can be invalidated later
        silenceFallbackTimer = Timer.scheduledTimer(withTimeInterval: 0.085, repeats: true) { [weak self] _ in
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

        // DIAGNOSTIC: Track when we last received mic data
        lastMicCallbackTime = Date()

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

        // SILENT AUDIO DETECTION: Track max amplitude
        // If we see any significant audio, update the "last non-silent time"
        if level > SILENT_THRESHOLD {
            lastNonSilentTime = Date()
            maxRecentAmplitude = max(maxRecentAmplitude, level)
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
            // DIAGNOSTIC: Log more frequently when buffers are empty (potential audio death)
            let timeSinceLastMic = Date().timeIntervalSince(lastMicCallbackTime)
            if mixCallCount % 10 == 1 || timeSinceLastMic > 2.0 {
                print("[AudioCaptureService] DIAGNOSTIC: No frames to process! micFrames=\(micFrames), systemFrames=\(systemFrames), timeSinceLastMicCallback=\(String(format: "%.1f", timeSinceLastMic))s")
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
            totalChunksSent += 1
        } else if mixCallCount % 50 == 1 {
            print("[AudioCaptureService] WARNING: onAudioData callback is nil!")
        }
    }

    // MARK: - Diagnostic Methods

    private func performHealthCheck() {
        let timeSinceLastMic = Date().timeIntervalSince(lastMicCallbackTime)
        let engineRunning = micEngine?.isRunning ?? false
        let sessionDuration = captureStartTime.map { Date().timeIntervalSince($0) } ?? 0

        ringBufferLock.lock()
        let micBufferSize = micRingBuffer.count
        let systemBufferSize = systemRingBuffer.count
        ringBufferLock.unlock()

        // Always log health check
        print("[AudioCaptureService] HEALTH CHECK: duration=\(Int(sessionDuration))s, chunksSent=\(totalChunksSent), engineRunning=\(engineRunning), timeSinceLastMicCallback=\(String(format: "%.1f", timeSinceLastMic))s, micBuffer=\(micBufferSize), systemBuffer=\(systemBufferSize)")

        // AUDIO DEATH DETECTION: If no mic callbacks for 10+ seconds but we're supposed to be capturing
        if timeSinceLastMic > 10.0 && _isCapturingAtomic {
            print("[AudioCaptureService] ⚠️ AUDIO DEATH DETECTED: No mic callbacks for \(String(format: "%.1f", timeSinceLastMic))s!")
            print("[AudioCaptureService] ⚠️ State: engineRunning=\(engineRunning), isCapturing=\(isCapturing), totalChunksSent=\(totalChunksSent)")

            // Check if engine stopped
            if !engineRunning {
                print("[AudioCaptureService] ⚠️ AVAudioEngine has stopped running!")
            }

            // Send to backend (only once per session)
            if !hasReportedAudioDeath {
                hasReportedAudioDeath = true
                let context = "engineRunning=\(engineRunning), duration=\(Int(sessionDuration))s, micBuffer=\(micBufferSize), systemBuffer=\(systemBufferSize)"
                sendErrorToBackend(
                    errorType: "swift_audio_death_detected",
                    errorMessage: "Audio stopped after \(totalChunksSent) chunks. Last mic callback \(String(format: "%.1f", timeSinceLastMic))s ago. Engine running: \(engineRunning). Attempting recovery.",
                    context: context
                )
            }

            // AUTO-RECOVERY: Attempt to restart the audio engine
            attemptAudioRecovery()
        }

        // SILENT AUDIO DETECTION: Audio callbacks are happening but producing silence
        // This catches cases where the audio tap is running but producing zeros
        // (e.g., after Mac sleep, audio device change, etc.)
        let timeSinceNonSilent = Date().timeIntervalSince(lastNonSilentTime)
        let sessionHasRun = sessionDuration > 10.0  // Wait 10s before checking for silence

        // Log silent audio status periodically
        if sessionHasRun && timeSinceNonSilent > 5.0 {
            print("[AudioCaptureService] SILENT CHECK: timeSinceNonSilent=\(String(format: "%.1f", timeSinceNonSilent))s, maxRecentAmplitude=\(maxRecentAmplitude), threshold=\(SILENT_THRESHOLD)")
        }

        // Only trigger if session has been running for a while, and we've had silence for SILENT_TIMEOUT_SECONDS
        if sessionHasRun && timeSinceNonSilent > SILENT_TIMEOUT_SECONDS && _isCapturingAtomic && !isRecoveringFromSilence {
            print("[AudioCaptureService] ⚠️ SILENT AUDIO DETECTED: No significant audio for \(String(format: "%.1f", timeSinceNonSilent))s!")
            print("[AudioCaptureService] ⚠️ This may indicate audio taps are producing silence after a system event.")
            print("[AudioCaptureService] ⚠️ State: engineRunning=\(engineRunning), chunksSent=\(totalChunksSent), maxRecentAmplitude=\(maxRecentAmplitude)")

            // Send to backend (only once per session)
            if !hasReportedSilentAudio {
                hasReportedSilentAudio = true
                sendErrorToBackend(
                    errorType: "swift_silent_audio_detected",
                    errorMessage: "Audio is silent for \(String(format: "%.1f", timeSinceNonSilent))s. Chunks sent: \(totalChunksSent). Max amplitude: \(maxRecentAmplitude). Attempting full reinitialization.",
                    context: "engineRunning=\(engineRunning), duration=\(Int(sessionDuration))s"
                )
            }

            // FULL REINITIALIZATION: More aggressive recovery than attemptAudioRecovery
            attemptFullAudioReinitialization()
        }

        // Warn if engine stopped but we think we're capturing
        if !engineRunning && _isCapturingAtomic {
            print("[AudioCaptureService] ⚠️ WARNING: Engine not running but isCapturing=true!")
        }
    }

    private func setupAudioConfigurationChangeListener() {
        // Listen for audio engine configuration changes (sample rate change, device change, etc.)
        configurationChangeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: micEngine,
            queue: .main
        ) { [weak self] notification in
            guard let self = self else { return }

            // Dispatch to MainActor for Swift 6 compatibility
            Task { @MainActor in
                let engineRunning = self.micEngine?.isRunning ?? false
                let timeSinceLastMic = Date().timeIntervalSince(self.lastMicCallbackTime)
                let sessionDuration = self.captureStartTime.map { Date().timeIntervalSince($0) } ?? 0

                print("[AudioCaptureService] ⚠️ AUDIO CONFIG CHANGE: AVAudioEngine configuration changed!")
                print("[AudioCaptureService] ⚠️ Engine running after change: \(engineRunning)")
                print("[AudioCaptureService] ⚠️ This may have stopped the audio tap!")
                print("[AudioCaptureService] ⚠️ Time since last mic callback: \(String(format: "%.1f", timeSinceLastMic))s")

                // Send to backend
                self.sendErrorToBackend(
                    errorType: "swift_audio_config_change",
                    errorMessage: "AVAudioEngine configuration changed. Engine running: \(engineRunning). Chunks sent so far: \(self.totalChunksSent). Attempting recovery.",
                    context: "duration=\(Int(sessionDuration))s, timeSinceLastMic=\(String(format: "%.1f", timeSinceLastMic))s"
                )

                // AUTO-RECOVERY: If engine stopped due to config change, restart it
                if !engineRunning && self._isCapturingAtomic {
                    print("[AudioCaptureService] ⚠️ Attempting auto-recovery after config change...")
                    self.attemptAudioRecovery()
                }
            }
        }

        print("[AudioCaptureService] DIAGNOSTIC: Audio configuration change listener registered")
    }

    private func removeAudioConfigurationChangeListener() {
        if let observer = configurationChangeObserver {
            NotificationCenter.default.removeObserver(observer)
            configurationChangeObserver = nil
            print("[AudioCaptureService] DIAGNOSTIC: Audio configuration change listener removed")
        }
    }

    private func attemptAudioRecovery() {
        print("[AudioCaptureService] 🔄 AUTO-RECOVERY: Attempting to restart audio engine...")

        guard let engine = micEngine else {
            print("[AudioCaptureService] ❌ AUTO-RECOVERY FAILED: No engine to restart")
            sendErrorToBackend(
                errorType: "swift_audio_recovery_failed",
                errorMessage: "Recovery failed: No engine instance",
                context: "totalChunksSent=\(totalChunksSent)"
            )
            return
        }

        // Stop the engine first (if it's in a bad state)
        if engine.isRunning {
            engine.stop()
            print("[AudioCaptureService] 🔄 Stopped existing engine")
        }

        // Try to restart
        do {
            try engine.start()
            lastMicCallbackTime = Date()  // Reset the timer so we don't immediately detect death again
            print("[AudioCaptureService] ✅ AUTO-RECOVERY SUCCESS: Engine restarted!")

            // Report success to backend
            sendErrorToBackend(
                errorType: "swift_audio_recovery_success",
                errorMessage: "Audio engine successfully restarted after \(totalChunksSent) chunks",
                context: "engineRunning=\(engine.isRunning)"
            )
        } catch {
            print("[AudioCaptureService] ❌ AUTO-RECOVERY FAILED: \(error.localizedDescription)")

            // Report failure to backend
            sendErrorToBackend(
                errorType: "swift_audio_recovery_failed",
                errorMessage: "Recovery failed: \(error.localizedDescription)",
                context: "totalChunksSent=\(totalChunksSent)"
            )
        }
    }

    /// Full reinitialization for when audio taps are producing silence
    /// More aggressive than attemptAudioRecovery - completely rebuilds audio capture
    private func attemptFullAudioReinitialization() {
        print("[AudioCaptureService] 🔄 FULL REINITIALIZATION: Completely rebuilding audio capture...")

        // Prevent re-entry while recovering
        isRecoveringFromSilence = true

        // Save the callback before cleanup (we need to restore it)
        let savedCallback = onAudioData

        // Save call context for error reporting
        let savedCallId = currentCallId
        let savedTeamId = currentTeamId
        let savedCloserId = currentCloserId

        // Step 1: Stop current capture
        print("[AudioCaptureService] 🔄 Step 1: Stopping current capture...")
        stopCapture()

        // Step 2: Full cleanup
        print("[AudioCaptureService] 🔄 Step 2: Cleaning up resources...")
        cleanup()

        // Step 3: Restore the callback (cleanup clears it)
        onAudioData = savedCallback

        // Step 4: Run setup again (async)
        print("[AudioCaptureService] 🔄 Step 3: Running setup...")
        Task { @MainActor in
            do {
                try await self.setup()

                // Restore call context
                if let callId = savedCallId, let teamId = savedTeamId, let closerId = savedCloserId {
                    self.setCallContext(callId: callId, teamId: teamId, closerId: closerId)
                }

                // Step 5: Start capture again
                print("[AudioCaptureService] 🔄 Step 4: Starting capture...")
                try self.startCapture()

                // Reset silent audio tracking
                self.lastNonSilentTime = Date()
                self.maxRecentAmplitude = 0.0
                self.isRecoveringFromSilence = false

                print("[AudioCaptureService] ✅ FULL REINITIALIZATION SUCCESS: Audio capture rebuilt!")

                // Report success to backend
                self.sendErrorToBackend(
                    errorType: "swift_silent_audio_recovery_success",
                    errorMessage: "Full audio reinitialization successful after silent audio detected",
                    context: "totalChunksSent=\(self.totalChunksSent)"
                )
            } catch {
                print("[AudioCaptureService] ❌ FULL REINITIALIZATION FAILED: \(error.localizedDescription)")
                self.isRecoveringFromSilence = false

                // Report failure to backend
                self.sendErrorToBackend(
                    errorType: "swift_silent_audio_recovery_failed",
                    errorMessage: "Full reinitialization failed: \(error.localizedDescription)",
                    context: "totalChunksSent=\(self.totalChunksSent)"
                )
            }
        }
    }

    private func sendErrorToBackend(errorType: String, errorMessage: String, context: String) {
        // Send error to Convex backend for remote monitoring
        guard let url = URL(string: "https://ideal-ram-982.convex.site/logClientError") else {
            print("[AudioCaptureService] ERROR: Invalid backend URL")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: Any] = [
            "errorType": errorType,
            "errorMessage": errorMessage,
            "context": context,
            "callId": currentCallId ?? "unknown",
            "teamId": currentTeamId ?? "unknown",
            "closerId": currentCloserId ?? "unknown",
            "platform": "swift_macos",
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown",
            "timestamp": ISO8601DateFormatter().string(from: Date())
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        } catch {
            print("[AudioCaptureService] ERROR: Failed to serialize error payload: \(error)")
            return
        }

        // Send asynchronously, don't block audio processing
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("[AudioCaptureService] ERROR: Failed to send error to backend: \(error)")
                return
            }

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 {
                    print("[AudioCaptureService] DIAGNOSTIC: Error reported to backend successfully")
                } else {
                    print("[AudioCaptureService] ERROR: Backend returned status \(httpResponse.statusCode)")
                }
            }
        }.resume()

        print("[AudioCaptureService] DIAGNOSTIC: Sending error to backend - type=\(errorType)")
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
