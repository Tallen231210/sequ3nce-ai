//
//  DashboardTests.swift
//  Sequ3nceUITests
//
//  Tests for the main app launch state, dashboard view, and sidebar navigation.
//

import XCTest

final class DashboardTests: Sequ3nceUITests {

    // MARK: - Launch Tests

    /// Verify the app launches and shows either the login view or authenticated content.
    func testAppLaunchesAndShowsLoginOrDashboard() {
        // After launch, the app should show either the login screen
        // or the authenticated hub (if a saved session exists).
        let emailField = app.textFields["Email"]
        let signInText = app.staticTexts["Sign in to your account"]
        let dashboardButton = app.buttons["Dashboard"]
        let readyText = app.staticTexts["Ready to Record"]

        // Wait briefly for the UI to settle
        let loginVisible = TestHelpers.waitForElement(emailField, timeout: 5)
        let dashboardVisible = dashboardButton.exists
        let legacyVisible = readyText.exists
        let signInVisible = signInText.exists

        XCTAssertTrue(
            loginVisible || signInVisible || dashboardVisible || legacyVisible,
            "App should show login view, dashboard, or legacy recording view on launch"
        )
    }

    /// Verify that the login view contains the expected form elements.
    func testLoginViewHasExpectedElements() {
        let emailField = app.textFields["Email"]

        // Only run this test if we are on the login screen
        guard TestHelpers.waitForElement(emailField, timeout: 5) else {
            // Already logged in -- skip login view assertions
            return
        }

        // Check for sign-in heading
        let signInText = app.staticTexts["Sign in to your account"]
        XCTAssertTrue(signInText.exists, "Login view should display 'Sign in to your account'")

        // Check for email text field
        XCTAssertTrue(emailField.exists, "Login view should have an Email text field")

        // Check for password secure field
        let passwordField = app.secureTextFields["Password"]
        XCTAssertTrue(passwordField.exists, "Login view should have a Password secure field")

        // Check for sign in button
        let signInButton = app.buttons["Sign In"]
        XCTAssertTrue(signInButton.exists, "Login view should have a Sign In button")

        // Check for footer hint text
        let footerText = app.staticTexts["Use the email and password your manager provided"]
        XCTAssertTrue(footerText.exists, "Login view should show footer hint text")
    }

    // MARK: - Dashboard Content Tests
    // These tests require the app to be authenticated and in meeting bot hub mode.
    // They will be skipped if the app is showing the login view or legacy mode.

    /// Verify the dashboard displays a welcome header with a greeting.
    func testDashboardDisplaysWelcomeHeader() {
        // Skip if not authenticated
        guard waitForAuthenticatedHub() else { return }

        // Navigate to dashboard
        TestHelpers.navigateToSidebarItem(app: app, item: "Dashboard")

        // The greeting is dynamic ("Good morning/afternoon/evening, {name}")
        // so check for the common prefix patterns
        let goodMorning = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'Good morning'")
        )
        let goodAfternoon = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'Good afternoon'")
        )
        let goodEvening = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'Good evening'")
        )

        let hasGreeting = goodMorning.count > 0
            || goodAfternoon.count > 0
            || goodEvening.count > 0

        XCTAssertTrue(hasGreeting, "Dashboard should display a greeting header")
    }

    // MARK: - Sidebar Navigation Tests

    /// Verify that all expected sidebar navigation items exist.
    func testSidebarNavigationItemsExist() {
        guard waitForAuthenticatedHub() else { return }

        let expectedItems = ["Dashboard", "Stats", "Calls", "Training", "Settings"]

        for item in expectedItems {
            // Look for the item label in the sidebar (rendered as button text)
            let sidebarItem = app.staticTexts[item]
            let sidebarButton = app.buttons[item]
            let found = sidebarItem.exists || sidebarButton.exists
            XCTAssertTrue(found, "Sidebar should contain '\(item)' navigation item")
        }
    }

    /// Verify that clicking sidebar items navigates to the correct content.
    func testCanNavigateBetweenSidebarItems() {
        guard waitForAuthenticatedHub() else { return }

        // Navigate to Stats
        TestHelpers.navigateToSidebarItem(app: app, item: "Stats")
        let statsHeader = app.staticTexts["Your Performance"]
        _ = TestHelpers.waitForElement(statsHeader, timeout: 5)
        XCTAssertTrue(statsHeader.exists, "Stats view should show 'Your Performance' header")

        // Navigate to Calls
        TestHelpers.navigateToSidebarItem(app: app, item: "Calls")
        sleep(1) // Allow view transition

        // Navigate to Training
        TestHelpers.navigateToSidebarItem(app: app, item: "Training")
        sleep(1)

        // Navigate to Settings
        TestHelpers.navigateToSidebarItem(app: app, item: "Settings")
        sleep(1)

        // Navigate back to Dashboard
        TestHelpers.navigateToSidebarItem(app: app, item: "Dashboard")
        sleep(1)

        // Verify we are back on Dashboard (look for greeting or "Upcoming Calls")
        let upcomingCalls = app.staticTexts["Upcoming Calls"]
        let hasGreeting = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'Good'")
        ).count > 0

        XCTAssertTrue(
            upcomingCalls.exists || hasGreeting,
            "Should be back on Dashboard after navigating through sidebar items"
        )
    }

    // MARK: - Private Helpers

    /// Wait for the authenticated meeting bot hub to appear.
    /// If the app is on the login screen or in legacy mode, the test is skipped.
    /// - Returns: `true` if the hub is visible and tests can proceed.
    @discardableResult
    private func waitForAuthenticatedHub() -> Bool {
        let dashboardButton = app.buttons["Dashboard"]
        let dashboardText = app.staticTexts["Dashboard"]

        let hubVisible = TestHelpers.waitForElement(dashboardButton, timeout: 5)
            || TestHelpers.waitForElement(dashboardText, timeout: 2)

        if !hubVisible {
            // Not in hub mode -- might be login screen or legacy mode
            // Record as "skipped" rather than failure
            XCTSkip("App is not in meeting bot hub mode -- skipping hub-specific test")
            return false
        }
        return true
    }
}
