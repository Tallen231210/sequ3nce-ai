# Sequ3nce UI Tests

XCUITest suite for the Sequ3nce macOS desktop app.

## Running Tests

### From Xcode

1. Open `Sequ3nce.xcodeproj` in Xcode.
2. Select the `Sequ3nceUITests` scheme/target.
3. Press `Cmd+U` to run all tests, or click the diamond icon next to individual tests.

### From the Command Line

```bash
cd apps/macos/Sequ3nce

# Run all UI tests
xcodebuild test \
  -project Sequ3nce.xcodeproj \
  -scheme Sequ3nce \
  -destination 'platform=macOS' \
  -only-testing:Sequ3nceUITests

# Run a specific test class
xcodebuild test \
  -project Sequ3nce.xcodeproj \
  -scheme Sequ3nce \
  -destination 'platform=macOS' \
  -only-testing:Sequ3nceUITests/DashboardTests

# Run a single test method
xcodebuild test \
  -project Sequ3nce.xcodeproj \
  -scheme Sequ3nce \
  -destination 'platform=macOS' \
  -only-testing:Sequ3nceUITests/DashboardTests/testAppLaunchesAndShowsLoginOrDashboard
```

## Test Structure

| File | Description |
|---|---|
| `Sequ3nceUITests.swift` | Base test class with setUp/tearDown and shared helpers |
| `DashboardTests.swift` | Tests for app launch, login view, dashboard, and sidebar navigation |
| `QuickBotTests.swift` | Tests for the Quick Bot sheet (ad-hoc meeting bot) |
| `Helpers/TestHelpers.swift` | Shared utilities: waitForElement, login, navigation helpers |

## Notes

- Tests that require authentication (dashboard, sidebar, Quick Bot) will be **skipped** if the app launches to the login screen or is in legacy (non-meeting-bot) mode.
- The app is launched with `--uitesting` as a launch argument. You can check for this in the app code to disable animations or stub network calls for testing.
- All tests run against the actual app binary. No mocking framework is used.
