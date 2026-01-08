//
//  SystemAudioCapture.swift
//  Sequ3nce
//
//  Captures system audio using Core Audio Taps (macOS 14.4+)
//
//  Implementation based on:
//  - AudioCap by insidegui: https://github.com/insidegui/AudioCap
//  - CoreAudio Taps for Dummies: https://www.maven.de/2025/04/coreaudio-taps-for-dummies/
//  - Apple Documentation: https://developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps
//

import Foundation
import CoreAudio
import AudioToolbox
import AVFoundation

/// Callback type for receiving system audio samples
typealias SystemAudioCallback = ([Float]) -> Void

/// System audio capture using Core Audio Process Taps (macOS 14.4+)
@available(macOS 14.4, *)
class SystemAudioCapture {

    // MARK: - Properties

    private var tapObjectID: AudioObjectID = kAudioObjectUnknown
    private var aggregateDeviceID: AudioDeviceID = kAudioObjectUnknown
    private var ioProcID: AudioDeviceIOProcID?
    private var tapUUID: UUID?
    private var isCapturing = false

    // Audio format from the tap
    private var tapFormat: AudioStreamBasicDescription?

    /// Callback for audio data
    var onAudioData: SystemAudioCallback?

    /// Current audio level (0.0 - 1.0)
    private(set) var level: Float = 0.0

    // Debug counter
    private var callbackCount = 0

    // MARK: - Initialization

    init() {
        print("[SystemAudioCapture] Initialized - requires macOS 14.4+")
    }

    deinit {
        stop()
        cleanup()
    }

    // MARK: - Public Methods

    /// Start capturing system audio
    func start() throws {
        guard !isCapturing else {
            print("[SystemAudioCapture] Already capturing")
            return
        }

        print("[SystemAudioCapture] Starting system audio capture...")

        // Step 1: Create the process tap
        try createProcessTap()

        // Step 2: Read the tap's audio format
        try readTapFormat()

        // Step 3: Create aggregate device with ONLY the tap (no sub-devices!)
        try createAggregateDevice()

        // Step 4: Set up IO proc to read audio
        try setupIOProc()

        // Step 5: Start the audio device
        try startDevice()

        isCapturing = true
        print("[SystemAudioCapture] System audio capture started successfully!")
    }

    /// Stop capturing system audio
    func stop() {
        guard isCapturing else { return }

        stopDevice()
        isCapturing = false

        print("[SystemAudioCapture] System audio capture stopped")
    }

    /// Clean up all resources (call in reverse order of creation)
    func cleanup() {
        stop()
        destroyIOProc()
        destroyAggregateDevice()
        destroyProcessTap()
    }

    // MARK: - Step 1: Create Process Tap

    private func createProcessTap() throws {
        print("[SystemAudioCapture] Creating process tap...")

        // Create a tap description for capturing all system output audio
        // Use stereoGlobalTapButExcludeProcesses with empty array = capture ALL system audio
        // This is the correct initializer for global system audio capture
        let tapDescription = CATapDescription(stereoGlobalTapButExcludeProcesses: [])

        // Configure the tap - these settings are CRITICAL
        tapDescription.name = "com.sequ3nce.systemaudiotap"

        // IMPORTANT: Set muteBehavior to unmuted so audio continues playing AND is captured
        // Without this, the tap may receive silence
        tapDescription.muteBehavior = .unmuted

        // Match the aggregate device's privacy setting
        tapDescription.isPrivate = true

        // Store the UUID for the aggregate device creation
        self.tapUUID = tapDescription.uuid

        print("[SystemAudioCapture] Tap configuration: muteBehavior=\(tapDescription.muteBehavior), isPrivate=\(tapDescription.isPrivate), isExclusive=\(tapDescription.isExclusive)")

        // Create the process tap
        var tapID = AudioObjectID(kAudioObjectUnknown)

        let status = AudioHardwareCreateProcessTap(tapDescription, &tapID)

        guard status == noErr else {
            throw NSError(domain: "SystemAudioCapture", code: Int(status),
                         userInfo: [NSLocalizedDescriptionKey: "Failed to create process tap: \(status)"])
        }

        self.tapObjectID = tapID

        print("[SystemAudioCapture] Process tap created - ID: \(tapID), UUID: \(tapUUID?.uuidString ?? "nil")")
    }

    // MARK: - Step 2: Read Tap Format

    private func readTapFormat() throws {
        print("[SystemAudioCapture] Reading tap audio format...")

        guard tapObjectID != kAudioObjectUnknown else {
            throw NSError(domain: "SystemAudioCapture", code: -1,
                         userInfo: [NSLocalizedDescriptionKey: "No tap available"])
        }

        var format = AudioStreamBasicDescription()
        var propertySize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)

        var address = AudioObjectPropertyAddress(
            mSelector: kAudioTapPropertyFormat,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )

        let status = AudioObjectGetPropertyData(
            tapObjectID,
            &address,
            0,
            nil,
            &propertySize,
            &format
        )

        guard status == noErr else {
            throw NSError(domain: "SystemAudioCapture", code: Int(status),
                         userInfo: [NSLocalizedDescriptionKey: "Failed to read tap format: \(status)"])
        }

        self.tapFormat = format

        print("[SystemAudioCapture] Tap format: \(format.mSampleRate) Hz, \(format.mChannelsPerFrame) channels, \(format.mBitsPerChannel) bits")
    }

    // MARK: - Step 3: Create Aggregate Device (TAP ONLY - no sub-devices!)

    private func createAggregateDevice() throws {
        print("[SystemAudioCapture] Creating aggregate device (tap only)...")

        guard let tapUUID = tapUUID else {
            throw NSError(domain: "SystemAudioCapture", code: -1,
                         userInfo: [NSLocalizedDescriptionKey: "No tap UUID available"])
        }

        // Create tap list with our tap
        // IMPORTANT: This is the ONLY thing in the aggregate device!
        let tapList: [[String: Any]] = [
            [
                kAudioSubTapUIDKey as String: tapUUID.uuidString,
                kAudioSubTapDriftCompensationKey as String: false  // No drift compensation needed for tap-only
            ]
        ]

        // Create aggregate device configuration
        // KEY INSIGHT: No kAudioAggregateDeviceSubDeviceListKey needed!
        // The tap alone provides the input stream.
        let deviceUID = "com.sequ3nce.systemaudiotap.\(UUID().uuidString)"
        let deviceConfig: [String: Any] = [
            kAudioAggregateDeviceNameKey as String: "Sequ3nce System Audio",
            kAudioAggregateDeviceUIDKey as String: deviceUID,
            kAudioAggregateDeviceTapListKey as String: tapList,
            kAudioAggregateDeviceIsPrivateKey as String: true
            // NOTE: Removed kAudioAggregateDeviceSubDeviceListKey - not needed!
            // NOTE: Removed kAudioAggregateDeviceTapAutoStartKey - let IO proc control it
        ]

        // Create the aggregate device
        var aggregateID: AudioDeviceID = kAudioObjectUnknown

        let status = AudioHardwareCreateAggregateDevice(deviceConfig as CFDictionary, &aggregateID)

        guard status == noErr else {
            throw NSError(domain: "SystemAudioCapture", code: Int(status),
                         userInfo: [NSLocalizedDescriptionKey: "Failed to create aggregate device: \(status)"])
        }

        self.aggregateDeviceID = aggregateID

        print("[SystemAudioCapture] Aggregate device created - ID: \(aggregateID)")

        // Log input stream info for debugging
        logAggregateDeviceInfo()
    }

    private func logAggregateDeviceInfo() {
        var inputStreamAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )

        var propertySize: UInt32 = 0
        var status = AudioObjectGetPropertyDataSize(
            aggregateDeviceID,
            &inputStreamAddress,
            0,
            nil,
            &propertySize
        )

        if status == noErr && propertySize > 0 {
            let bufferListPointer = UnsafeMutablePointer<AudioBufferList>.allocate(capacity: Int(propertySize))
            defer { bufferListPointer.deallocate() }

            status = AudioObjectGetPropertyData(
                aggregateDeviceID,
                &inputStreamAddress,
                0,
                nil,
                &propertySize,
                bufferListPointer
            )

            if status == noErr {
                let bufferList = UnsafeMutableAudioBufferListPointer(bufferListPointer)
                print("[SystemAudioCapture] Aggregate device has \(bufferList.count) input buffer(s)")
                for (i, buffer) in bufferList.enumerated() {
                    print("[SystemAudioCapture]   Buffer \(i): \(buffer.mNumberChannels) channels")
                }
            } else {
                print("[SystemAudioCapture] Warning: Could not get input buffer info, status: \(status)")
            }
        } else {
            print("[SystemAudioCapture] Warning: No input streams on aggregate device, status: \(status)")
        }
    }

    // MARK: - Step 4: Set Up IO Proc

    private func setupIOProc() throws {
        print("[SystemAudioCapture] Setting up IO proc...")

        guard aggregateDeviceID != kAudioObjectUnknown else {
            throw NSError(domain: "SystemAudioCapture", code: -1,
                         userInfo: [NSLocalizedDescriptionKey: "No aggregate device available"])
        }

        var procID: AudioDeviceIOProcID?

        // Use AudioDeviceCreateIOProcIDWithBlock (recommended by all reference implementations)
        let status = AudioDeviceCreateIOProcIDWithBlock(
            &procID,
            aggregateDeviceID,
            nil,
            { [weak self] (inNow, inInputData, inInputTime, outOutputData, inOutputTime) in
                // This callback runs on the real-time audio thread
                self?.handleAudioData(inInputData)
            }
        )

        guard status == noErr else {
            throw NSError(domain: "SystemAudioCapture", code: Int(status),
                         userInfo: [NSLocalizedDescriptionKey: "Failed to create IO proc: \(status)"])
        }

        self.ioProcID = procID
        print("[SystemAudioCapture] IO proc created successfully")
    }

    // MARK: - Step 5: Start/Stop Device

    private func startDevice() throws {
        print("[SystemAudioCapture] Starting audio device...")

        guard let procID = ioProcID else {
            throw NSError(domain: "SystemAudioCapture", code: -1,
                         userInfo: [NSLocalizedDescriptionKey: "No IO proc available"])
        }

        let status = AudioDeviceStart(aggregateDeviceID, procID)

        guard status == noErr else {
            throw NSError(domain: "SystemAudioCapture", code: Int(status),
                         userInfo: [NSLocalizedDescriptionKey: "Failed to start audio device: \(status)"])
        }

        print("[SystemAudioCapture] Audio device started")
    }

    private func stopDevice() {
        guard let procID = ioProcID, aggregateDeviceID != kAudioObjectUnknown else { return }

        let status = AudioDeviceStop(aggregateDeviceID, procID)
        if status != noErr {
            print("[SystemAudioCapture] Warning: Failed to stop audio device: \(status)")
        }
    }

    // MARK: - Cleanup (reverse order)

    private func destroyIOProc() {
        guard let procID = ioProcID, aggregateDeviceID != kAudioObjectUnknown else { return }

        let status = AudioDeviceDestroyIOProcID(aggregateDeviceID, procID)
        if status != noErr {
            print("[SystemAudioCapture] Warning: Failed to destroy IO proc: \(status)")
        }
        ioProcID = nil
    }

    private func destroyAggregateDevice() {
        guard aggregateDeviceID != kAudioObjectUnknown else { return }

        let status = AudioHardwareDestroyAggregateDevice(aggregateDeviceID)
        if status != noErr {
            print("[SystemAudioCapture] Warning: Failed to destroy aggregate device: \(status)")
        } else {
            print("[SystemAudioCapture] Aggregate device destroyed")
        }
        aggregateDeviceID = kAudioObjectUnknown
    }

    private func destroyProcessTap() {
        guard tapObjectID != kAudioObjectUnknown else { return }

        let status = AudioHardwareDestroyProcessTap(tapObjectID)
        if status != noErr {
            print("[SystemAudioCapture] Warning: Failed to destroy process tap: \(status)")
        } else {
            print("[SystemAudioCapture] Process tap destroyed")
        }
        tapObjectID = kAudioObjectUnknown
        tapUUID = nil
        tapFormat = nil
    }

    // MARK: - Audio Processing

    private func handleAudioData(_ bufferList: UnsafePointer<AudioBufferList>?) {
        guard let bufferList = bufferList else {
            if callbackCount == 0 {
                print("[SystemAudioCapture] handleAudioData: bufferList is nil")
            }
            return
        }

        let ablPointer = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: bufferList))

        guard ablPointer.count > 0 else {
            if callbackCount == 0 {
                print("[SystemAudioCapture] handleAudioData: ablPointer.count = 0")
            }
            return
        }

        callbackCount += 1

        // Get the first buffer
        let buffer = ablPointer[0]

        guard let dataPointer = buffer.mData else {
            if callbackCount % 100 == 1 {
                print("[SystemAudioCapture] handleAudioData: buffer.mData is nil")
            }
            return
        }

        // Log detailed buffer info on first few callbacks
        if callbackCount <= 5 {
            print("[SystemAudioCapture] Buffer #\(callbackCount): mDataByteSize=\(buffer.mDataByteSize), mNumberChannels=\(buffer.mNumberChannels)")

            // Check first few raw bytes to see if there's any non-zero data
            let bytePointer = dataPointer.assumingMemoryBound(to: UInt8.self)
            var nonZeroBytes = 0
            for i in 0..<min(1000, Int(buffer.mDataByteSize)) {
                if bytePointer[i] != 0 {
                    nonZeroBytes += 1
                }
            }
            print("[SystemAudioCapture] Non-zero bytes in first 1000: \(nonZeroBytes)")

            // Print first 10 float values
            let floatPtr = dataPointer.assumingMemoryBound(to: Float.self)
            let floatCount = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size
            var floatValues: [Float] = []
            for i in 0..<min(10, floatCount) {
                floatValues.append(floatPtr[i])
            }
            print("[SystemAudioCapture] First 10 float values: \(floatValues)")
        }

        let frameCount = Int(buffer.mDataByteSize) / MemoryLayout<Float>.size

        guard frameCount > 0 else {
            if callbackCount % 100 == 1 {
                print("[SystemAudioCapture] handleAudioData: frameCount = 0")
            }
            return
        }

        // Convert to Float array
        let floatPointer = dataPointer.assumingMemoryBound(to: Float.self)
        var samples = [Float](repeating: 0, count: frameCount)

        for i in 0..<frameCount {
            samples[i] = floatPointer[i]
        }

        // Handle stereo - convert to mono if needed
        let channelCount = Int(buffer.mNumberChannels)
        if channelCount == 2 {
            let monoCount = frameCount / 2
            var monoSamples = [Float](repeating: 0, count: monoCount)
            for i in 0..<monoCount {
                monoSamples[i] = (samples[i * 2] + samples[i * 2 + 1]) / 2.0
            }
            samples = monoSamples
        }

        // Calculate level
        let rms = calculateRMS(samples: samples)
        self.level = min(1.0, rms * 2.0)

        if callbackCount % 100 == 1 {
            print("[SystemAudioCapture] Sending \(samples.count) samples, RMS: \(rms), level: \(level), channels: \(channelCount)")
        }

        // Send to callback
        if let callback = onAudioData {
            callback(samples)
        } else if callbackCount % 100 == 1 {
            print("[SystemAudioCapture] WARNING: onAudioData callback is nil!")
        }
    }

    // MARK: - Utilities

    private func calculateRMS(samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0.0 }
        let sumOfSquares = samples.reduce(0.0) { $0 + $1 * $1 }
        return sqrt(sumOfSquares / Float(samples.count))
    }
}
