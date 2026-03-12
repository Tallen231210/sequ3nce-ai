"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SubscribeContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "true";
  const canceled = searchParams.get("canceled") === "true";

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {success ? (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Subscription Active!</h1>
            <p className="text-gray-600 mb-8">
              You can now close this tab and return to the Sequ3nce Personal app.
            </p>
          </>
        ) : canceled ? (
          <>
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Checkout Canceled</h1>
            <p className="text-gray-600 mb-8">
              No worries — you can subscribe anytime from the Sequ3nce Personal app.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Sequ3nce Personal</h1>
            <p className="text-gray-600 mb-8">
              Return to the app to manage your subscription.
            </p>
          </>
        )}
        <p className="text-sm text-gray-400">sequ3nce.ai</p>
      </div>
    </div>
  );
}

export default function B2CSubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    }>
      <SubscribeContent />
    </Suspense>
  );
}
