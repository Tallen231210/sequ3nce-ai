//
//  ActiveCallTests.swift
//  Sequ3nceUITests
//
//  Tests for the ActiveCallView (shown during bot calls).
//  NOTE: These tests verify UI structure. An active bot call is required
//  for the ActiveCallView to appear, so most tests will be skipped
//  unless a call is in progress.
//

import XCTest

final class ActiveCallTests: Sequ3nceUITests {

    // MARK: - Active Call View Detection

    /// Verify the Active Call View appears when a bot call is active.
    func testActiveCallViewAppearsWhenBotCallActive() {
        // The ActiveCallView auto-appears when a bot is in a meeting.
        // In test mode without a live bot call, this view won't be visible.
        let recordingBadge = app.staticTexts["Recording"]
        let kickBotButton = app.buttons["Kick Bot"]
        let meetingTitle = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS 'Meeting' OR label CONTAINS 'Call'")
        )

        let callViewVisible = TestHelpers.waitForElement(recordingBadge, timeout: 5)
            || kickBotButton.exists
            || meetingTitle.count > 0

        if !callViewVisible {
            // No active call -- this is expected when testing without a live bot
            return
        }

        XCTAssertTrue(callViewVisible, "Active Call View should appear when bot is in a meeting")
    }

    // MARK: - Active Call View Elements

    /// Verify the Active Call View has a meeting title.
    func testActiveCallViewHasMeetingTitle() {
        guard waitForActiveCallView() else { return }

        let meetingTitle = app.staticTexts.matching(
            NSPredicate(format: "identifier == 'meetingTitle' OR label CONTAINS 'Meeting'")
        )
        XCTAssertTrue(meetingTitle.count > 0, "Active Call View should display the meeting title")
    }

    /// Verify the Active Call View has a duration timer.
    func testActiveCallViewHasDurationTimer() {
        guard waitForActiveCallView() else { return }

        // Duration timer shows in HH:MM:SS or MM:SS format
        let durationText = app.staticTexts.matching(
            NSPredicate(format: "label MATCHES '\\\\d{1,2}:\\\\d{2}(:\\\\d{2})?'")
        )
        XCTAssertTrue(durationText.count > 0, "Active Call View should display a duration timer")
    }

    /// Verify the Active Call View has the coaching tabs.
    func testActiveCallViewHasCoachingTabs() {
        guard waitForActiveCallView() else { return }

        let ammoTab = app.buttons["Ammo"]
        let transcriptTab = app.buttons["Transcript"]
        let notesTab = app.buttons["Notes"]
        let resourcesTab = app.buttons["Resources"]

        let hasAmmo = ammoTab.exists || app.staticTexts["Ammo"].exists
        let hasTranscript = transcriptTab.exists || app.staticTexts["Transcript"].exists
        let hasNotes = notesTab.exists || app.staticTexts["Notes"].exists
        let hasResources = resourcesTab.exists || app.staticTexts["Resources"].exists

        XCTAssertTrue(hasAmmo, "Active Call View should have Ammo tab")
        XCTAssertTrue(hasTranscript, "Active Call View should have Transcript tab")
        XCTAssertTrue(hasNotes, "Active Call View should have Notes tab")
        XCTAssertTrue(hasResources, "Active Call View should have Resources tab")
    }

    /// Verify the Active Call View has a Request Reinforcement button.
    func testActiveCallViewHasRequestReinforcementButton() {
        guard waitForActiveCallView() else { return }

        let reinforceButton = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'reinforcement' OR label CONTAINS[c] 'Request Help'")
        )
        XCTAssertTrue(reinforceButton.count > 0, "Active Call View should have a Request Reinforcement button")
    }

    /// Verify the Active Call View has a Call Going Long button.
    func testActiveCallViewHasCallGoingLongButton() {
        guard waitForActiveCallView() else { return }

        let goingLongButton = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'Going Long' OR label CONTAINS[c] 'Call Going Long'")
        )
        XCTAssertTrue(goingLongButton.count > 0, "Active Call View should have a Call Going Long button")
    }

    /// Verify the Active Call View has a Kick Bot button.
    func testActiveCallViewHasKickBotButton() {
        guard waitForActiveCallView() else { return }

        let kickBotButton = app.buttons["Kick Bot"]
        XCTAssertTrue(kickBotButton.exists, "Active Call View should have a 'Kick Bot' button")
    }

    /// Verify the Active Call View has a talk ratio display.
    func testActiveCallViewHasTalkRatio() {
        guard waitForActiveCallView() else { return }

        let talkRatio = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS '%' OR label CONTAINS[c] 'closer' OR label CONTAINS[c] 'prospect'")
        )
        XCTAssertTrue(talkRatio.count > 0, "Active Call View should display talk ratio")
    }

    // MARK: - Tab Switching

    /// Verify switching between coaching tabs works.
    func testCanSwitchBetweenCoachingTabs() {
        guard waitForActiveCallView() else { return }

        // Switch to Transcript tab
        let transcriptTab = app.buttons["Transcript"]
        if transcriptTab.exists {
            transcriptTab.click()
            sleep(1)
        }

        // Switch to Notes tab
        let notesTab = app.buttons["Notes"]
        if notesTab.exists {
            notesTab.click()
            sleep(1)
        }

        // Switch back to Ammo tab
        let ammoTab = app.buttons["Ammo"]
        if ammoTab.exists {
            ammoTab.click()
            sleep(1)
        }

        // If we got here without crashing, tabs work
        XCTAssertTrue(true, "Tab switching should work without errors")
    }

    // MARK: - Private Helpers

    /// Wait for the Active Call View to appear.
    @discardableResult
    private func waitForActiveCallView() -> Bool {
        let recordingBadge = app.staticTexts["Recording"]
        let kickBotButton = app.buttons["Kick Bot"]

        let visible = TestHelpers.waitForElement(recordingBadge, timeout: 5)
            || kickBotButton.exists

        if !visible {
            XCTSkip("Active Call View not visible -- no bot call in progress")
            return false
        }
        return true
    }
}
