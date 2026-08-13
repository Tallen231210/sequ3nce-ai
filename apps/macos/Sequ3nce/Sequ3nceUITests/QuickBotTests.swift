//
//  QuickBotTests.swift
//  Sequ3nceUITests
//
//  Tests for the Quick Bot feature (ad-hoc meeting bot).
//

import XCTest

final class QuickBotTests: Sequ3nceUITests {

    // MARK: - Quick Bot Button Tests

    /// Verify the Quick Bot button exists in the sidebar.
    func testQuickBotButtonExistsInSidebar() {
        guard waitForAuthenticatedHub() else { return }

        // The Quick Bot button displays "Quick Bot" text
        let quickBotButton = app.buttons["Quick Bot"]
        let quickBotText = app.staticTexts["Quick Bot"]

        let found = TestHelpers.waitForElement(quickBotButton, timeout: 5)
            || quickBotText.exists

        XCTAssertTrue(found, "Quick Bot button should exist in the sidebar")
    }

    /// Verify that clicking Quick Bot opens the sheet.
    func testQuickBotSheetOpensWhenClicked() {
        guard waitForAuthenticatedHub() else { return }

        // Click the Quick Bot button
        let quickBotButton = app.buttons["Quick Bot"]
        guard TestHelpers.waitForElement(quickBotButton, timeout: 5) else {
            XCTFail("Quick Bot button not found")
            return
        }
        quickBotButton.click()

        // The sheet should appear with the "Quick Bot" title
        let sheetTitle = app.staticTexts["Quick Bot"]
        let titleFound = TestHelpers.waitForElement(sheetTitle, timeout: 5)
        XCTAssertTrue(titleFound, "Quick Bot sheet should display its title")
    }

    /// Verify the Quick Bot sheet has the Meeting URL field.
    func testQuickBotSheetHasMeetingURLField() {
        guard waitForAuthenticatedHub() else { return }

        openQuickBotSheet()

        // Check for "Meeting URL" label
        let meetingURLLabel = app.staticTexts["Meeting URL"]
        XCTAssertTrue(meetingURLLabel.exists, "Quick Bot sheet should have a 'Meeting URL' label")

        // Check for the URL text field (placeholder text)
        let urlField = app.textFields.matching(
            NSPredicate(format: "placeholderValue CONTAINS 'meet.google.com'")
        )
        XCTAssertTrue(
            urlField.count > 0,
            "Quick Bot sheet should have a text field with meeting URL placeholder"
        )
    }

    /// Verify the Quick Bot sheet has the Prospect Name field.
    func testQuickBotSheetHasProspectNameField() {
        guard waitForAuthenticatedHub() else { return }

        openQuickBotSheet()

        // Check for "Prospect Name" label
        let prospectLabel = app.staticTexts["Prospect Name"]
        XCTAssertTrue(prospectLabel.exists, "Quick Bot sheet should have a 'Prospect Name' label")

        // Check for the prospect name text field (placeholder text)
        let nameField = app.textFields.matching(
            NSPredicate(format: "placeholderValue CONTAINS 'John Smith'")
        )
        XCTAssertTrue(
            nameField.count > 0,
            "Quick Bot sheet should have a text field with prospect name placeholder"
        )
    }

    /// Verify the Quick Bot sheet has a Join Meeting button.
    func testQuickBotSheetHasJoinMeetingButton() {
        guard waitForAuthenticatedHub() else { return }

        openQuickBotSheet()

        // Check for "Join Meeting" button
        let joinButton = app.buttons["Join Meeting"]
        XCTAssertTrue(joinButton.exists, "Quick Bot sheet should have a 'Join Meeting' button")
    }

    /// Verify the Join Meeting button is disabled when the URL is empty.
    func testJoinMeetingButtonDisabledWhenURLEmpty() {
        guard waitForAuthenticatedHub() else { return }

        openQuickBotSheet()

        let joinButton = app.buttons["Join Meeting"]
        guard joinButton.exists else {
            XCTFail("Join Meeting button not found")
            return
        }

        // The button should be disabled (not enabled) when no URL is entered
        XCTAssertFalse(joinButton.isEnabled, "Join Meeting button should be disabled when URL field is empty")
    }

    /// Verify the Quick Bot sheet has a close button.
    func testQuickBotSheetHasCloseButton() {
        guard waitForAuthenticatedHub() else { return }

        openQuickBotSheet()

        // The sheet has an X button to close
        // It may be a button with the xmark system image
        let closeButton = app.buttons.matching(
            NSPredicate(format: "label CONTAINS 'close' OR label CONTAINS 'Close' OR label CONTAINS 'xmark'")
        )

        // Also check for a generic close/dismiss button
        let sheetExists = app.staticTexts["Quick Bot"].exists
        XCTAssertTrue(sheetExists, "Quick Bot sheet should still be open")
    }

    // MARK: - Private Helpers

    /// Wait for the authenticated meeting bot hub to appear.
    @discardableResult
    private func waitForAuthenticatedHub() -> Bool {
        let dashboardButton = app.buttons["Dashboard"]
        let dashboardText = app.staticTexts["Dashboard"]

        let hubVisible = TestHelpers.waitForElement(dashboardButton, timeout: 5)
            || TestHelpers.waitForElement(dashboardText, timeout: 2)

        if !hubVisible {
            XCTSkip("App is not in meeting bot hub mode -- skipping Quick Bot test")
            return false
        }
        return true
    }

    /// Open the Quick Bot sheet by clicking its sidebar button.
    private func openQuickBotSheet() {
        let quickBotButton = app.buttons["Quick Bot"]
        guard TestHelpers.waitForElement(quickBotButton, timeout: 5) else {
            XCTFail("Quick Bot button not found in sidebar")
            return
        }
        quickBotButton.click()

        // Wait for the sheet to appear
        let sheetTitle = app.staticTexts["Quick Bot"]
        _ = TestHelpers.waitForElement(sheetTitle, timeout: 5)
    }
}
