import { test, expect, TEST_USER } from "./fixtures";

const API_BASE = "https://ideal-ram-982.convex.site";

test.describe("B2C API Integration", () => {
  test("login endpoint returns success for valid credentials", async ({
    page,
  }) => {
    const response = await page.evaluate(
      async ({ url, user }) => {
        const res = await fetch(`${url}/b2c/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            password: user.password,
          }),
        });
        return { status: res.status, body: await res.json() };
      },
      { url: API_BASE, user: TEST_USER }
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.closer).toBeTruthy();
    expect(response.body.closer.closerId).toBe(TEST_USER.closerId);
    expect(response.body.closer.teamId).toBe(TEST_USER.teamId);
    expect(response.body.closer.email).toBe(TEST_USER.email);
    expect(response.body.closer.name).toBe(TEST_USER.name);
  });

  test("login endpoint returns error for invalid credentials", async ({
    page,
  }) => {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(`${url}/b2c/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@test.com",
          password: "wrongpassword1",
        }),
      });
      return { status: res.status, body: await res.json() };
    }, API_BASE);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBeTruthy();
  });

  test("login endpoint returns error for wrong password", async ({ page }) => {
    const response = await page.evaluate(
      async ({ url, email }) => {
        const res = await fetch(`${url}/b2c/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: "definitelywrong",
          }),
        });
        return { status: res.status, body: await res.json() };
      },
      { url: API_BASE, email: TEST_USER.email }
    );

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("Invalid email or password");
  });

  test("login endpoint handles empty body gracefully", async ({ page }) => {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(`${url}/b2c/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      return { status: res.status, body: await res.json() };
    }, API_BASE);

    expect(response.body.success).toBe(false);
  });

  test("login endpoint handles missing fields", async ({ page }) => {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(`${url}/b2c/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@test.com" }),
      });
      return { status: res.status, body: await res.json() };
    }, API_BASE);

    expect(response.body.success).toBe(false);
  });

  test("signup endpoint rejects duplicate email", async ({ page }) => {
    const response = await page.evaluate(
      async ({ url, email }) => {
        const res = await fetch(`${url}/b2c/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            phone: "+15559999999",
            password: "TestPassword123",
            name: "Duplicate User",
          }),
        });
        return { status: res.status, body: await res.json() };
      },
      { url: API_BASE, email: TEST_USER.email }
    );

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("already exists");
  });

  test("signup endpoint validates password length", async ({ page }) => {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(`${url}/b2c/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "shortpw@test.com",
          phone: "+15559999999",
          password: "short",
          name: "Short PW User",
        }),
      });
      return { status: res.status, body: await res.json() };
    }, API_BASE);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("8 characters");
  });

  test("signup endpoint validates field types", async ({ page }) => {
    const response = await page.evaluate(async (url) => {
      const res = await fetch(`${url}/b2c/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: 123,
          phone: "+15559999999",
          password: "ValidPass123",
          name: "Type Test",
        }),
      });
      return { status: res.status, body: await res.json() };
    }, API_BASE);

    expect(response.body.success).toBe(false);
  });

  test("cross-origin fetch succeeds (proves CORS is configured)", async ({ page }) => {
    // The page is loaded from http://localhost:3000 and the API is at
    // https://ideal-ram-982.convex.site — this is a cross-origin request.
    // If CORS headers weren't set correctly, this fetch would be blocked
    // by the browser and throw a TypeError.
    const response = await page.evaluate(
      async ({ url, user }) => {
        const res = await fetch(`${url}/b2c/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            password: user.password,
          }),
        });
        const body = await res.json();
        return { status: res.status, success: body.success };
      },
      { url: API_BASE, user: TEST_USER }
    );

    // If we got here without a CORS error, the server has correct CORS headers
    expect(response.status).toBe(200);
    expect(response.success).toBe(true);
  });

  test("login response includes subscription status", async ({ page }) => {
    const response = await page.evaluate(
      async ({ url, user }) => {
        const res = await fetch(`${url}/b2c/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            password: user.password,
          }),
        });
        return await res.json();
      },
      { url: API_BASE, user: TEST_USER }
    );

    expect(response.closer.subscriptionStatus).toBeTruthy();
    expect(["active", "cancelled", "past_due", "none"]).toContain(
      response.closer.subscriptionStatus
    );
  });
});
