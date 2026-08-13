//
//  Sequ3nceUITests.swift
//  Sequ3nceUITests
//
//  Base test class for Sequ3nce UI tests.
//  Provides common setUp/tearDown and shared app instance.
//

import XCTest

/// Base class for all Sequ3nce UI tests.
/// Subclass this to get automatic app launch and teardown.
class Sequ3nceUITests: XCTestCase {

    /// The shared application instance, launched fresh for each test.
    var app: XCUIApplication!

    override func setUp() {
        super.setUp()

        // Stop immediately when a failure is recorded
        continueAfterFailure = false

        // Create and launch the app
        app = XCUIApplication()

        // Pass launch arguments to signal we are running in UI test mode.
        // The app can check for this to skip onboarding, disable animations, etc.
        app.launchArguments.append("--uitesting")

        app.launch()
    }

    override func tearDown() {
        // Terminate the app after each test
        app.terminate()
        app = nil

        super.tearDown()
    }

    // MARK: - Convenience Helpers

    /// Wait for an element to exist, with a default timeout.
    @discardableResult
    func waitForElement(
        _ element: XCUIElement,
        timeout: TimeInterval = TestHelpers.defaultTimeout
    ) -> Bool {
        return TestHelpers.waitForElement(element, timeout: timeout)
    }

    /// Perform login using the shared helper.
    func login(email: String = "test@sequ3nce.ai", password: String = "testpassword") {
        TestHelpers.login(app: app, email: email, password: password)
    }
}
