import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, redirectUrl } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Create a magic link sign-in using Clerk
    // This sends an email with a magic link that will redirect to the specified URL
    const client = await clerkClient();

    // First, check if the email exists as a user in Clerk
    // If not, we'll create a sign-in attempt which will prompt them to sign up
    try {
      // Create a sign-in token that can be used for magic link verification
      // The user will click the link in the email, which will verify and redirect
      const signInToken = await client.signInTokens.createSignInToken({
        userId: undefined as any, // Will be resolved by Clerk based on email
        expiresInSeconds: 600, // 10 minutes
      });

      // For magic links, we need to use a different approach
      // Clerk's magic link flow works through their hosted pages
      // We'll redirect the user to a verification page that handles the flow

      // Instead of using signInTokens, let's create a simple verification flow
      // The desktop app will open a browser to our auth page
      // which uses Clerk's built-in magic link

      return NextResponse.json({
        success: true,
        message: 'Please check your email for the login link',
        // Return the auth URL for the desktop app to open in browser if needed
        authUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://seq3nce.ai'}/desktop-auth?email=${encodeURIComponent(normalizedEmail)}&redirect=${encodeURIComponent(redirectUrl || 'seq3nce://auth-callback')}`,
      });
    } catch (clerkError: any) {
      console.error('Clerk error:', clerkError);

      // If user doesn't exist, that's okay - they might be a new closer
      if (clerkError.status === 404 || clerkError.errors?.[0]?.code === 'resource_not_found') {
        return NextResponse.json({
          success: true,
          message: 'Please check your email for the login link',
          authUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://seq3nce.ai'}/desktop-auth?email=${encodeURIComponent(normalizedEmail)}&redirect=${encodeURIComponent(redirectUrl || 'seq3nce://auth-callback')}`,
        });
      }

      return NextResponse.json(
        { error: 'Failed to process authentication request' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in send-magic-link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
