//
//  TestHelpers.swift
//  Sequ3nceUITests
//
//  Shared helper functions for UI tests
//

import XCTest

/// Shared helpers for Sequ3nce UI tests
enum TestHelpers {

    // MARK: - Timeouts

    /// Default timeout for element existence checks
    static let defaultTimeout: TimeInterval = 10

    /// Extended timeout for operations that may take longer (e.g., login)
    static let extendedTimeout: TimeInterval = 20

    // MARK: - Wait Helpers

    /// Wait for an element to exist within a timeout period.
    /// - Parameters:
    ///   - element: The XCUIElement to wait for.
    ///   - timeout: Maximum time to wait (defaults to `defaultTimeout`).
    ///   - message: Optional failure message.
    /// - Returns: `true` if the element exists before the timeout.
    @discardableResult
    static func waitForElement(
        _ element: XCUIElement,
        timeout: TimeInterval = defaultTimeout,
        message: String? = nil
    ) -> Bool {
        let predicate = NSPredicate(format: "exists == true")
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        let result = XCTWaiter().wait(for: [expectation], timeout: timeout)
        return result == .completed
    }

    /// Wait for an element to become hittable (visible and interactable).
    /// - Parameters:
    ///   - element: The XCUIElement to wait for.
    ///   - timeout: Maximum time to wait.
    /// - Returns: `true` if the element is hittable before the timeout.
    @discardableResult
    static func waitForElementHittable(
        _ element: XCUIElement,
        timeout: TimeInterval = defaultTimeout
    ) -> Bool {
        let predicate = NSPredicate(format: "isHittable == true")
        let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
        let result = XCTWaiter().wait(for: [expectation], timeout: timeout)
        return result == .completed
    }

    // MARK: - Login Helper

    /// Perform login with the given credentials.
    /// The app must be showing the login view before calling this method.
    /// - Parameters:
    ///   - app: The XCUIApplication instance.
    ///   - email: The email address to log in with.
    ///   - password: The password to log in with.
    static func login(
        app: XCUIApplication,
        email: String = "test@sequ3nce.ai",
        password: String = "testpassword"
    ) {
        let emailField = app.textFields["Email"]
        let passwordField = app.secureTextFields["Password"]
        let signInButton = app.buttons["Sign In"]

        // Wait for the login form to appear
        guard waitForElement(emailField) else {
            XCTFail("Email field did not appear within timeout")
            return
        }

        // Type email
        emailField.click()
        emailField.typeText(email)

        // Type password
        passwordField.click()
        passwordField.typeText(password)

        // Tap sign in
        signInButton.click()
    }

    // MARK: - Navigation Helper

    /// Navigate to a sidebar item by clicking its label.
    /// Only works when the app is in meeting bot hub mode (authenticated with sidebar visible).
    /// - Parameters:
    ///   - app: The XCUIApplication instance.
    ///   - item: The sidebar item label (e.g., "Dashboard", "Stats", "Calls", "Training", "Settings").
    static func navigateToSidebarItem(app: XCUIApplication, item: String) {
        let sidebarButton = app.buttons[item]
        if waitForElement(sidebarButton) {
            sidebarButton.click()
        } else {
            // Fall back to searching in staticTexts within buttons
            let sidebarText = app.staticTexts[item]
            if waitForElement(sidebarText) {
                sidebarText.click()
            } else {
                XCTFail("Sidebar item '\(item)' not found")
            }
        }
    }

    // MARK: - App State Helpers

    /// Check whether the login view is currently displayed.
    /// - Parameter app: The XCUIApplication instance.
    /// - Returns: `true` if the login view is visible.
    static func isLoginViewDisplayed(app: XCUIApplication) -> Bool {
        let emailField = app.textFields["Email"]
        let signInButton = app.buttons["Sign In"]
        return emailField.exists || signInButton.exists
    }

    /// Check whether the app is showing authenticated content
    /// (either legacy recording view or meeting bot hub).
    /// - Parameter app: The XCUIApplication instance.
    /// - Returns: `true` if authenticated content is visible.
    static func isAuthenticatedContentDisplayed(app: XCUIApplication) -> Bool {
        // Look for elements that only appear when authenticated:
        // - Sidebar items (meeting bot hub mode)
        // - "Ready to Record" text (legacy mode)
        // - User name display
        let dashboardButton = app.buttons["Dashboard"]
        let readyText = app.staticTexts["Ready to Record"]
        return dashboardButton.exists || readyText.exists
    }
}
