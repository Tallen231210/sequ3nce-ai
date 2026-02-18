//
//  WindowManager.swift
//  Sequ3nce
//
//  Manages additional windows (Ammo Panel, Training)
//

import SwiftUI
import AppKit
import ApplicationServices

/// Singleton to manage app windows
@MainActor
class WindowManager: ObservableObject {
    static let shared = WindowManager()

    private var ammoPanelWindow: NSWindow?
    private var trainingWindow: NSWindow?
    private var rolePlayRoomWindow: NSWindow?
    private var scheduleWindow: NSWindow?
    private var chatPanelWindow: NSWindow?
    private var questionnairePanelWindow: NSWindow?

    @Published var isAmmoPanelVisible = false
    @Published var isTrainingVisible = false
    @Published var isRolePlayRoomVisible = false
    @Published var isScheduleVisible = false
    @Published var isChatPanelVisible = false
    @Published var isQuestionnairePanelVisible = false

    private init() {}

    // MARK: - Ammo Panel

    func toggleAmmoPanel(appState: AppState) {
        if isAmmoPanelVisible {
            closeAmmoPanel()
        } else {
            openAmmoPanel(appState: appState)
        }
    }

    func openAmmoPanel(appState: AppState) {
        guard ammoPanelWindow == nil else {
            ammoPanelWindow?.makeKeyAndOrderFront(nil)
            return
        }

        let contentView = AmmoPanelView()
            .environmentObject(appState)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 500),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = "Ammo Tracker"
        window.contentView = NSHostingView(rootView: contentView)
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 320, height: 400)  // Prevent tabs from wrapping
        window.level = .floating  // Always on top
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.appearance = NSAppearance(named: .aqua)  // Force light mode title bar

        // Position to the right of the main window
        if let mainWindow = NSApp.mainWindow {
            let mainFrame = mainWindow.frame
            window.setFrameOrigin(NSPoint(
                x: mainFrame.maxX + 20,
                y: mainFrame.midY - 200
            ))
        } else {
            window.center()
        }

        window.makeKeyAndOrderFront(nil)

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.ammoPanelWindow = nil
                self?.isAmmoPanelVisible = false
            }
        }

        ammoPanelWindow = window
        isAmmoPanelVisible = true
    }

    func closeAmmoPanel() {
        ammoPanelWindow?.close()
        ammoPanelWindow = nil
        isAmmoPanelVisible = false
    }

    /// Opens Ammo Panel snapped to the right side of the screen (for Join & Record flow)
    /// This creates a side-by-side layout with the meeting browser on the left
    func openAmmoPanelSnapped(appState: AppState) {
        // Close existing panel if open (will reposition)
        if ammoPanelWindow != nil {
            ammoPanelWindow?.close()
            ammoPanelWindow = nil
            isAmmoPanelVisible = false
        }

        let contentView = AmmoPanelView()
            .environmentObject(appState)

        // Get screen dimensions
        guard let screen = NSScreen.main else {
            // Fallback to regular open
            openAmmoPanel(appState: appState)
            return
        }

        let screenFrame = screen.visibleFrame

        // Ammo Panel takes right ~35% of screen (max 400px width)
        let panelWidth: CGFloat = min(400, screenFrame.width * 0.35)
        let panelHeight: CGFloat = screenFrame.height
        let panelX: CGFloat = screenFrame.maxX - panelWidth
        let panelY: CGFloat = screenFrame.minY

        let window = NSWindow(
            contentRect: NSRect(x: panelX, y: panelY, width: panelWidth, height: panelHeight),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = "Ammo Tracker"
        window.contentView = NSHostingView(rootView: contentView)
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 320, height: 400)
        window.level = .floating  // Always on top
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.appearance = NSAppearance(named: .aqua)  // Force light mode title bar

        window.makeKeyAndOrderFront(nil)

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.ammoPanelWindow = nil
                self?.isAmmoPanelVisible = false
            }
        }

        ammoPanelWindow = window
        isAmmoPanelVisible = true
    }

    /// Attempts to resize the frontmost app's window to fit the left portion of the screen
    /// Uses AppleScript with System Events for more reliable window management
    func resizeFrontmostWindowToLeft() {
        guard let screen = NSScreen.main else { return }
        let screenFrame = screen.visibleFrame

        // Calculate left side dimensions (leave room for Ammo Panel on right)
        let panelWidth: CGFloat = min(400, screenFrame.width * 0.35)
        let leftWidth = Int(screenFrame.width - panelWidth - 10)  // 10px gap
        let leftHeight = Int(screenFrame.height)
        let leftX = Int(screenFrame.minX)
        let leftY = Int(screen.frame.height - screenFrame.maxY)  // Menu bar offset

        // Use AppleScript to resize the frontmost window
        let script = """
        tell application "System Events"
            set frontProcess to first process whose frontmost is true
            if name of frontProcess is not "Sequ3nce" then
                tell frontProcess
                    try
                        set position of window 1 to {\(leftX), \(leftY)}
                        set size of window 1 to {\(leftWidth), \(leftHeight)}
                    end try
                end tell
            end if
        end tell
        """

        var error: NSDictionary?
        if let appleScript = NSAppleScript(source: script) {
            appleScript.executeAndReturnError(&error)
            if let error = error {
                print("[WindowManager] AppleScript error: \(error)")
            } else {
                print("[WindowManager] Resized frontmost window to left side via AppleScript")
            }
        }
    }

    // MARK: - Training Window

    func openTrainingWindow(appState: AppState) {
        guard trainingWindow == nil else {
            trainingWindow?.makeKeyAndOrderFront(nil)
            return
        }

        let contentView = TrainingView()
            .environmentObject(appState)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = "Training"
        window.contentView = NSHostingView(rootView: contentView)
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 600, height: 400)
        window.appearance = NSAppearance(named: .aqua)  // Force light mode title bar

        window.center()
        window.makeKeyAndOrderFront(nil)

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.trainingWindow = nil
                self?.isTrainingVisible = false
            }
        }

        trainingWindow = window
        isTrainingVisible = true
    }

    func closeTrainingWindow() {
        trainingWindow?.close()
        trainingWindow = nil
        isTrainingVisible = false
    }

    // MARK: - Role Play Room Window

    func openRolePlayRoomWindow(appState: AppState) {
        guard rolePlayRoomWindow == nil else {
            rolePlayRoomWindow?.makeKeyAndOrderFront(nil)
            return
        }

        let contentView = RolePlayRoomView()
            .environmentObject(appState)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 700),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = "Role Play Room"
        window.contentView = NSHostingView(rootView: contentView)
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 700, height: 500)
        window.appearance = NSAppearance(named: .aqua)  // Force light mode title bar

        window.center()
        window.makeKeyAndOrderFront(nil)

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.rolePlayRoomWindow = nil
                self?.isRolePlayRoomVisible = false
            }
        }

        rolePlayRoomWindow = window
        isRolePlayRoomVisible = true
    }

    func closeRolePlayRoomWindow() {
        rolePlayRoomWindow?.close()
        rolePlayRoomWindow = nil
        isRolePlayRoomVisible = false
    }

    // MARK: - Schedule Window

    func openScheduleWindow(appState: AppState) {
        guard scheduleWindow == nil else {
            scheduleWindow?.makeKeyAndOrderFront(nil)
            return
        }

        let contentView = ScheduleView()
            .environmentObject(appState)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 360, height: 500),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = "My Schedule"
        window.contentView = NSHostingView(rootView: contentView)
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 320, height: 400)
        window.appearance = NSAppearance(named: .aqua)  // Force light mode title bar

        // Position to the left of the main window
        if let mainWindow = NSApp.mainWindow {
            let mainFrame = mainWindow.frame
            window.setFrameOrigin(NSPoint(
                x: mainFrame.minX - 380,
                y: mainFrame.midY - 250
            ))
        } else {
            window.center()
        }

        window.makeKeyAndOrderFront(nil)

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.scheduleWindow = nil
                self?.isScheduleVisible = false
            }
        }

        scheduleWindow = window
        isScheduleVisible = true
    }

    func closeScheduleWindow() {
        scheduleWindow?.close()
        scheduleWindow = nil
        isScheduleVisible = false
    }

    // MARK: - Chat Panel Window

    func toggleChatPanel(messagingState: MessagingState) {
        if isChatPanelVisible {
            closeChatPanel()
        } else {
            openChatPanel(messagingState: messagingState)
        }
    }

    func openChatPanel(messagingState: MessagingState) {
        guard chatPanelWindow == nil else {
            chatPanelWindow?.makeKeyAndOrderFront(nil)
            return
        }

        // Mark as open in messaging state
        messagingState.openChatPanel()

        let contentView = ChatPanelView(messagingState: messagingState)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 340, height: 450),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )

        window.title = "Team Messages"
        window.contentView = NSHostingView(rootView: contentView)
        window.isReleasedWhenClosed = false
        window.level = .floating // Always on top
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.appearance = NSAppearance(named: .aqua) // Force light mode title bar

        // Position to the left of the main window
        if let mainWindow = NSApp.mainWindow {
            let mainFrame = mainWindow.frame
            window.setFrameOrigin(NSPoint(
                x: mainFrame.minX - 360,
                y: mainFrame.midY - 225
            ))
        } else {
            window.center()
        }

        window.makeKeyAndOrderFront(nil)

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: window,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.chatPanelWindow = nil
                self?.isChatPanelVisible = false
                messagingState.closeChatPanel()
            }
        }

        chatPanelWindow = window
        isChatPanelVisible = true
    }

    func closeChatPanel() {
        chatPanelWindow?.close()
        chatPanelWindow = nil
        isChatPanelVisible = false
    }

    // MARK: - Post-Call Questionnaire Panel

    func openQuestionnairePanel(appState: AppState, callId: String, prospectName: String) {
        guard questionnairePanelWindow == nil else {
            questionnairePanelWindow?.makeKeyAndOrderFront(nil)
            return
        }

        // Wrapper view that manages its own @State for isPresented
        let contentView = QuestionnaireWindowWrapper(
            callId: callId,
            prospectName: prospectName,
            onComplete: { [weak self] in
                Task { @MainActor in
                    self?.closeQuestionnairePanel()
                    appState.showBotPostCallQuestionnaire = false
                    appState.botQuestionnaireCallId = nil
                    appState.botQuestionnaireProspectName = nil
                }
            }
        )
        .environmentObject(appState)

        guard let screen = NSScreen.main else { return }
        let screenFrame = screen.visibleFrame

        // Position at top-center of screen (Raycast-style drop-down)
        let panelWidth: CGFloat = 500
        let panelHeight: CGFloat = 520
        let panelX = screenFrame.midX - panelWidth / 2
        let panelY = screenFrame.maxY - panelHeight - 20

        let panel = NSPanel(
            contentRect: NSRect(x: panelX, y: panelY, width: panelWidth, height: panelHeight),
            styleMask: [.titled, .closable, .nonactivatingPanel, .hudWindow],
            backing: .buffered,
            defer: false
        )

        panel.title = "How did the call go?"
        panel.contentView = NSHostingView(rootView: contentView)
        panel.isReleasedWhenClosed = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.appearance = NSAppearance(named: .aqua)
        panel.isMovableByWindowBackground = true
        panel.becomesKeyOnlyIfNeeded = false

        // Animate slide-down from top
        panel.alphaValue = 0
        panel.setFrame(
            NSRect(x: panelX, y: panelY + 30, width: panelWidth, height: panelHeight),
            display: false
        )
        panel.makeKeyAndOrderFront(nil)

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.3
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = 1
            panel.animator().setFrame(
                NSRect(x: panelX, y: panelY, width: panelWidth, height: panelHeight),
                display: true
            )
        }

        // Bring app to front
        NSApp.activate(ignoringOtherApps: true)

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.questionnairePanelWindow = nil
                self?.isQuestionnairePanelVisible = false
            }
        }

        questionnairePanelWindow = panel
        isQuestionnairePanelVisible = true
    }

    func closeQuestionnairePanel() {
        if let panel = questionnairePanelWindow {
            NSAnimationContext.runAnimationGroup({ context in
                context.duration = 0.2
                panel.animator().alphaValue = 0
            }, completionHandler: { [weak self] in
                panel.close()
                self?.questionnairePanelWindow = nil
                self?.isQuestionnairePanelVisible = false
            })
        }
    }
}

// MARK: - Questionnaire Window Wrapper

/// Wraps PostCallQuestionnaireView for use in a floating NSPanel.
/// Manages its own @State for the isPresented binding.
struct QuestionnaireWindowWrapper: View {
    let callId: String
    let prospectName: String
    let onComplete: () -> Void
    @EnvironmentObject var appState: AppState

    @State private var isPresented: Bool = true

    var body: some View {
        PostCallQuestionnaireView(
            callId: callId,
            initialProspectName: prospectName,
            isPresented: $isPresented,
            onComplete: {
                onComplete()
            }
        )
        .environmentObject(appState)
        .onChange(of: isPresented) { _, newValue in
            if !newValue {
                onComplete()
            }
        }
    }
}
