//
//  WindowManager.swift
//  Sequ3nce
//
//  Manages additional windows (Ammo Panel, Training)
//

import SwiftUI
import AppKit
import ApplicationServices
import Combine

/// NSPanel subclass that can become key window (required for borderless panels to receive clicks)
class InteractivePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// Singleton to manage app windows
@MainActor
class WindowManager: ObservableObject {
    static let shared = WindowManager()

    private var ammoPanelWindow: InteractivePanel?
    private var trainingWindow: NSWindow?
    private var rolePlayRoomWindow: NSWindow?
    private var scheduleWindow: NSWindow?
    private var chatPanelWindow: NSWindow?
    private var questionnairePanelWindow: NSWindow?

    /// Shared ammo panel state — owned by WindowManager so it persists across open/close cycles
    let ammoPanelState = AmmoPanelState()
    private var ammoPanelExpandCancellable: AnyCancellable?

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
            ammoPanelState.isPanelExpanded = true
            return
        }

        guard let screen = NSScreen.main else { return }
        let screenFrame = screen.visibleFrame

        ammoPanelState.isPanelExpanded = true

        // Panel sized exactly to expanded content — no transparent regions
        let panelWidth: CGFloat = 360
        let panelHeight: CGFloat = 520
        let panelX = screenFrame.maxX - panelWidth - 10
        let panelY = screenFrame.midY - panelHeight / 2

        let contentView = AmmoPanelContainerView(panelState: ammoPanelState)
            .environmentObject(appState)

        let panel = InteractivePanel(
            contentRect: NSRect(x: panelX, y: panelY, width: panelWidth, height: panelHeight),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        let hostingView = NSHostingView(rootView: contentView)
        hostingView.wantsLayer = true
        hostingView.layer?.backgroundColor = .clear  // Prevent grey rectangle on white backgrounds
        panel.contentView = hostingView
        panel.isReleasedWhenClosed = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.appearance = NSAppearance(named: .aqua)
        panel.isMovableByWindowBackground = false
        panel.becomesKeyOnlyIfNeeded = false  // Accept first-click events
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false  // SwiftUI handles shadows
        panel.acceptsMouseMovedEvents = true  // Enable hover effects
        panel.hidesOnDeactivate = false  // Stay visible when app not active

        // Start off-screen to the right, then animate in
        panel.setFrame(
            NSRect(x: screenFrame.maxX, y: panelY, width: panelWidth, height: panelHeight),
            display: false
        )
        panel.alphaValue = 0
        panel.orderFront(nil)

        // Animate slide-in from right
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.5
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.32, 0.72, 0, 1)
            panel.animator().alphaValue = 1
            panel.animator().setFrame(
                NSRect(x: panelX, y: panelY, width: panelWidth, height: panelHeight),
                display: true
            )
        }

        // Observe expand/minimize state changes and resize panel accordingly
        ammoPanelExpandCancellable = ammoPanelState.$isPanelExpanded
            .dropFirst()
            .sink { [weak self] expanded in
                Task { @MainActor in
                    self?.animateAmmoPanelResize(expanded: expanded)
                }
            }

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.ammoPanelWindow = nil
                self?.isAmmoPanelVisible = false
                self?.ammoPanelExpandCancellable = nil
            }
        }

        ammoPanelWindow = panel
        isAmmoPanelVisible = true
    }

    func closeAmmoPanel() {
        guard let panel = ammoPanelWindow else { return }
        ammoPanelExpandCancellable = nil

        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.3
            context.timingFunction = CAMediaTimingFunction(name: .easeIn)
            panel.animator().alphaValue = 0
            panel.animator().setFrame(
                NSRect(
                    x: panel.frame.origin.x + panel.frame.width,
                    y: panel.frame.origin.y,
                    width: panel.frame.width,
                    height: panel.frame.height
                ),
                display: true
            )
        }, completionHandler: { [weak self] in
            panel.close()
            self?.ammoPanelWindow = nil
            self?.isAmmoPanelVisible = false
        })
    }

    /// Animate panel frame between expanded (360×520) and minimized tab (48×110)
    private func animateAmmoPanelResize(expanded: Bool) {
        guard let panel = ammoPanelWindow, let screen = NSScreen.main else { return }
        let screenFrame = screen.visibleFrame

        let targetFrame: NSRect
        if expanded {
            let w: CGFloat = 360
            let h: CGFloat = 520
            targetFrame = NSRect(
                x: screenFrame.maxX - w - 10,
                y: screenFrame.midY - h / 2,
                width: w,
                height: h
            )
        } else {
            let w: CGFloat = 48
            let h: CGFloat = 110
            targetFrame = NSRect(
                x: screenFrame.maxX - w,  // Flush with right edge
                y: screenFrame.midY - h / 2,
                width: w,
                height: h
            )
        }

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.35
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.32, 0.72, 0, 1)
            panel.animator().setFrame(targetFrame, display: true)
        }
    }

    /// Opens Ammo Panel snapped to the right side of the screen (for Join & Record flow)
    /// This creates a side-by-side layout with the meeting browser on the left
    func openAmmoPanelSnapped(appState: AppState) {
        // Close existing panel if open (will reposition)
        if ammoPanelWindow != nil {
            ammoPanelWindow?.close()
            ammoPanelWindow = nil
            ammoPanelExpandCancellable = nil
            isAmmoPanelVisible = false
        }

        // Get screen dimensions
        guard let screen = NSScreen.main else {
            openAmmoPanel(appState: appState)
            return
        }

        let screenFrame = screen.visibleFrame

        // Ammo Panel takes right ~35% of screen (max 400px width)
        let panelWidth: CGFloat = min(400, screenFrame.width * 0.35)
        let panelHeight: CGFloat = 520
        let panelX = screenFrame.maxX - panelWidth - 10
        let panelY = screenFrame.midY - panelHeight / 2

        ammoPanelState.isPanelExpanded = true

        let contentView = AmmoPanelContainerView(panelState: ammoPanelState)
            .environmentObject(appState)

        let panel = InteractivePanel(
            contentRect: NSRect(x: panelX, y: panelY, width: panelWidth, height: panelHeight),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        let hostingView = NSHostingView(rootView: contentView)
        hostingView.wantsLayer = true
        hostingView.layer?.backgroundColor = .clear
        panel.contentView = hostingView
        panel.isReleasedWhenClosed = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.appearance = NSAppearance(named: .aqua)
        panel.isMovableByWindowBackground = false
        panel.becomesKeyOnlyIfNeeded = false  // Accept first-click events
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.acceptsMouseMovedEvents = true  // Enable hover effects
        panel.hidesOnDeactivate = false  // Stay visible when app not active

        panel.orderFront(nil)

        // Observe expand/minimize state changes
        ammoPanelExpandCancellable = ammoPanelState.$isPanelExpanded
            .dropFirst()
            .sink { [weak self] expanded in
                Task { @MainActor in
                    self?.animateAmmoPanelResize(expanded: expanded)
                }
            }

        // Watch for window close
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.ammoPanelWindow = nil
                self?.isAmmoPanelVisible = false
                self?.ammoPanelExpandCancellable = nil
            }
        }

        ammoPanelWindow = panel
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

        // Full-width bottom bar (with 40px padding on each side)
        let panelWidth: CGFloat = screenFrame.width - 80
        let panelHeight: CGFloat = 220
        let panelX = screenFrame.origin.x + 40
        let panelY = screenFrame.origin.y // Bottom edge of screen

        let panel = NSPanel(
            contentRect: NSRect(x: panelX, y: panelY, width: panelWidth, height: panelHeight),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        panel.contentView = NSHostingView(rootView: contentView)
        panel.isReleasedWhenClosed = false
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.appearance = NSAppearance(named: .aqua)
        panel.isMovableByWindowBackground = false
        panel.becomesKeyOnlyIfNeeded = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false // SwiftUI handles the shadow

        // Animate slide-up from below screen
        panel.alphaValue = 0
        panel.setFrame(
            NSRect(x: panelX, y: screenFrame.origin.y - panelHeight, width: panelWidth, height: panelHeight),
            display: false
        )
        panel.makeKeyAndOrderFront(nil)

        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.5
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.32, 0.72, 0, 1)
            panel.animator().alphaValue = 1
            panel.animator().setFrame(
                NSRect(x: panelX, y: panelY, width: panelWidth, height: panelHeight),
                display: true
            )
        }

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
                context.duration = 0.25
                context.timingFunction = CAMediaTimingFunction(name: .easeIn)
                panel.animator().alphaValue = 0
                panel.animator().setFrame(
                    NSRect(
                        x: panel.frame.origin.x,
                        y: panel.frame.origin.y - panel.frame.height,
                        width: panel.frame.width,
                        height: panel.frame.height
                    ),
                    display: true
                )
            }, completionHandler: { [weak self] in
                panel.close()
                self?.questionnairePanelWindow = nil
                self?.isQuestionnairePanelVisible = false
            })
        }
    }
}

// MARK: - Questionnaire Window Wrapper (Bottom Sheet)

/// Wraps PostCallQuestionnaireView in a bottom sheet container.
/// Manages its own @State for the isPresented binding.
struct QuestionnaireWindowWrapper: View {
    let callId: String
    let prospectName: String
    let onComplete: () -> Void
    @EnvironmentObject var appState: AppState

    @State private var isPresented: Bool = true

    var body: some View {
        VStack(spacing: 0) {
            // Handle bar
            RoundedRectangle(cornerRadius: 3)
                .fill(Color.black.opacity(0.2))
                .frame(width: 36, height: 5)
                .padding(.top, 12)
                .padding(.bottom, 20)

            // Existing questionnaire content (untouched)
            PostCallQuestionnaireView(
                callId: callId,
                initialProspectName: prospectName,
                isPresented: $isPresented,
                onComplete: {
                    onComplete()
                }
            )
            .environmentObject(appState)
            .padding(.horizontal, 24)
            .padding(.bottom, 34)
        }
        .background(Color.white)
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: 24,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 24
            )
        )
        .shadow(color: Color.black.opacity(0.15), radius: 30, x: 0, y: -20)
        .onChange(of: isPresented) { _, newValue in
            if !newValue {
                onComplete()
            }
        }
    }
}
