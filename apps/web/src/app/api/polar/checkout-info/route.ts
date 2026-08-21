import { NextRequest, NextResponse } from "next/server";
import { polarFetch } from "@/lib/polar";

// ============================================================================
// GET /api/polar/checkout-info?id=<checkout_id>
//
// The activation page fires the Meta Subscribe event when a buyer returns
// from Polar — this resolves the checkout so the event carries the REAL
// amount and plan. Returns only what the pixel needs; succeeded-only, so a
// shared or replayed URL for an unpaid checkout reports nothing.
// ============================================================================

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  try {
    const checkout = await polarFetch<{
      status?: string;
      total_amount?: number;
      amount?: number;
      product_id?: string;
    }>(`/v1/checkouts/${id}`);

    if (checkout.status !== "succeeded") {
      return NextResponse.json({ paid: false });
    }

    // The checkout's embedded product objects carry no metadata — the plan
    // tag lives on the product resource itself, one lookup away.
    let plan: string | null = null;
    if (checkout.product_id) {
      try {
        const product = await polarFetch<{
          metadata?: Record<string, unknown> | null;
        }>(`/v1/products/${checkout.product_id}`);
        const tag = product.metadata?.b2c_plan;
        if (typeof tag === "string") plan = tag;
      } catch {
        /* plan is garnish; the amount is the meal */
      }
    }

    return NextResponse.json({
      paid: true,
      amountCents: checkout.total_amount ?? checkout.amount ?? 0,
      plan,
    });
  } catch {
    return NextResponse.json({ error: "lookup failed" }, { status: 502 });
  }
}
