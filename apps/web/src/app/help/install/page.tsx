import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export const metadata = {
  title: "Install Help — Sequ3nce",
  description:
    "Troubleshooting steps for installing the Sequ3nce desktop app on macOS, Windows, and Linux.",
};

export default function InstallHelpPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <Logo href="/" height={28} />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Install Help
          </h1>
          <p className="text-lg text-gray-600">
            If the Sequ3nce desktop app isn&apos;t installing, find your error
            message below for fix-it steps. Most issues take less than a
            minute.
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link
              href="/download"
              className="text-black font-medium hover:underline"
            >
              ← Back to download
            </Link>
            <a
              href="mailto:support@sequ3nce.ai"
              className="text-black font-medium hover:underline"
            >
              Contact support
            </a>
          </div>
        </div>

        {/* macOS */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            macOS
          </h2>
          <p className="text-gray-600 mb-6">
            Requires macOS 10.15 (Catalina) or later. Works on both Apple
            Silicon and Intel — we ship a universal build.
          </p>

          <article id="mac-damaged" className="mb-8 scroll-mt-24">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              &quot;App is damaged and can&apos;t be opened&quot;
            </h3>
            <p className="text-gray-700 mb-3">
              macOS sometimes flags newly-downloaded apps as damaged when
              they aren&apos;t — it&apos;s a quarantine flag, not actual
              damage. Two ways to fix it.
            </p>
            <p className="text-sm font-semibold text-gray-900 mt-4 mb-2">
              Option 1 — Right-click → Open (easiest)
            </p>
            <ol className="space-y-2 text-gray-700 list-decimal pl-5 mb-4">
              <li>Open your Applications folder</li>
              <li>
                Right-click (or Control-click) <strong>Sequ3nce</strong>
              </li>
              <li>
                Choose <strong>Open</strong> from the menu
              </li>
              <li>
                When the warning dialog appears, click <strong>Open</strong>{" "}
                again. macOS remembers your choice — you only do this once.
              </li>
            </ol>
            <p className="text-sm font-semibold text-gray-900 mt-4 mb-2">
              Option 2 — Terminal (faster if you&apos;re comfortable)
            </p>
            <ol className="space-y-2 text-gray-700 list-decimal pl-5 mb-4">
              <li>
                Open Terminal (Applications → Utilities → Terminal)
              </li>
              <li>
                Paste this command and press Enter:
                <pre className="mt-2 p-3 bg-gray-100 rounded text-sm overflow-x-auto">
                  <code>xattr -d com.apple.quarantine /Applications/Sequ3nce.app</code>
                </pre>
              </li>
              <li>Open Sequ3nce normally</li>
            </ol>
          </article>

          <article id="mac-unsigned" className="mb-8 scroll-mt-24">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              &quot;Sequ3nce can&apos;t be opened because Apple cannot check it&quot;
            </h3>
            <p className="text-gray-700 mb-3">
              Newer versions of macOS (Ventura, Sonoma, Sequoia) show this
              instead of the &quot;damaged&quot; message. The fix is in
              System Settings.
            </p>
            <ol className="space-y-2 text-gray-700 list-decimal pl-5 mb-4">
              <li>
                Open <strong>System Settings</strong> → <strong>Privacy & Security</strong>
              </li>
              <li>Scroll to the Security section near the bottom</li>
              <li>
                You&apos;ll see a message: <em>&quot;Sequ3nce was blocked from use because it is not from an identified developer.&quot;</em>
              </li>
              <li>
                Click <strong>Open Anyway</strong> next to that message
              </li>
              <li>
                Enter your Mac password if prompted, then open the app
              </li>
            </ol>
          </article>

          <article id="mac-old-os" className="mb-8 scroll-mt-24">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              &quot;Your Mac is too old&quot; / app won&apos;t launch
            </h3>
            <p className="text-gray-700 mb-3">
              Sequ3nce requires <strong>macOS 10.15 (Catalina) or later</strong>.
              If you&apos;re on an older version, you&apos;ll need to either
              update macOS or use a different Mac.
            </p>
            <p className="text-gray-700 mb-3">
              To check your version: click the Apple menu → About This Mac.
              If it says macOS 10.14 (Mojave) or older, the app won&apos;t
              install.
            </p>
            <p className="text-gray-700">
              Need help finding a workaround?{" "}
              <a
                href="mailto:support@sequ3nce.ai"
                className="text-black font-medium hover:underline"
              >
                Contact support
              </a>{" "}
              — we can sometimes provide an older-compatible build.
            </p>
          </article>
        </section>

        {/* Windows */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Windows
          </h2>
          <p className="text-gray-600 mb-6">
            Requires Windows 10 or later (64-bit).
          </p>

          <article id="win-smartscreen" className="mb-8 scroll-mt-24">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              &quot;Windows protected your PC&quot; (SmartScreen warning)
            </h3>
            <p className="text-gray-700 mb-3">
              Windows shows this blue popup the first time you run any app
              from outside the Microsoft Store. It&apos;s a warning, not a
              block — you can proceed safely.
            </p>
            <ol className="space-y-2 text-gray-700 list-decimal pl-5 mb-4">
              <li>
                On the blue popup, click <strong>More info</strong> (small
                text under the app name)
              </li>
              <li>
                A new <strong>Run anyway</strong> button appears — click it
              </li>
              <li>The installer continues normally</li>
            </ol>
            <p className="text-gray-700">
              You only do this once. After Sequ3nce is installed, Windows
              treats it as trusted.
            </p>
          </article>

          <article id="win-antivirus" className="mb-8 scroll-mt-24">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              &quot;Antivirus flagged the installer&quot;
            </h3>
            <p className="text-gray-700 mb-3">
              Some antivirus programs (Norton, McAfee, third-party AVs) over-block
              new installers. Sequ3nce is safe — adding it as an exclusion
              fixes the issue.
            </p>
            <p className="text-sm font-semibold text-gray-900 mt-4 mb-2">
              Windows Defender / Security
            </p>
            <ol className="space-y-2 text-gray-700 list-decimal pl-5 mb-4">
              <li>
                Open <strong>Windows Security</strong> (search for it in the
                Start menu)
              </li>
              <li>
                Click <strong>Virus & threat protection</strong>
              </li>
              <li>
                Under &quot;Virus & threat protection settings,&quot; click{" "}
                <strong>Manage settings</strong>
              </li>
              <li>
                Scroll to <strong>Exclusions</strong> → click{" "}
                <strong>Add or remove exclusions</strong>
              </li>
              <li>
                Click <strong>Add an exclusion</strong> → <strong>File</strong>{" "}
                → pick the Sequ3nce installer
              </li>
              <li>Run the installer again</li>
            </ol>
            <p className="text-sm font-semibold text-gray-900 mt-4 mb-2">
              Norton, McAfee, or other antivirus
            </p>
            <p className="text-gray-700 mb-3">
              The steps differ but the principle is the same: find your AV&apos;s{" "}
              <strong>Exclusions</strong> or{" "}
              <strong>Allow list</strong> setting and add the Sequ3nce
              installer file. Most AVs have this option under &quot;Settings&quot; →
              &quot;Exclusions&quot; or &quot;Trusted Apps.&quot;
            </p>
            <p className="text-gray-700">
              Stuck?{" "}
              <a
                href="mailto:support@sequ3nce.ai"
                className="text-black font-medium hover:underline"
              >
                Contact support
              </a>{" "}
              with your AV name and we&apos;ll send exact steps.
            </p>
          </article>

          <article id="win-old-os" className="mb-8 scroll-mt-24">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              Installer won&apos;t run / &quot;not compatible&quot;
            </h3>
            <p className="text-gray-700 mb-3">
              Sequ3nce requires <strong>Windows 10 or later (64-bit)</strong>.
              Windows 7 and 8 aren&apos;t supported by the underlying tech
              (Electron).
            </p>
            <p className="text-gray-700 mb-3">
              To check your version: press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-sm">Win + R</kbd>,
              type <code className="bg-gray-100 px-1 rounded text-sm">winver</code>, press Enter.
            </p>
            <p className="text-gray-700">
              If your Windows is too old, you&apos;ll need to either update
              or use a different machine. We don&apos;t have a workaround
              for unsupported Windows versions.
            </p>
          </article>
        </section>

        {/* Linux */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Linux</h2>
          <p className="text-gray-700 mb-3">
            We build Sequ3nce for Linux too — Debian (.deb) and Red Hat
            (.rpm) packages — but they&apos;re not on the download page yet.
          </p>
          <p className="text-gray-700">
            Email{" "}
            <a
              href="mailto:support@sequ3nce.ai"
              className="text-black font-medium hover:underline"
            >
              support@sequ3nce.ai
            </a>{" "}
            and we&apos;ll send you the right package for your distribution.
          </p>
        </section>

        {/* Still stuck */}
        <section className="bg-gray-900 rounded-2xl p-8 text-white">
          <h2 className="text-xl font-semibold mb-3">Still stuck?</h2>
          <p className="text-gray-300 mb-4">
            Email <strong>support@sequ3nce.ai</strong> with:
          </p>
          <ul className="space-y-1.5 text-gray-300 list-disc pl-5 mb-4">
            <li>The exact error message (a screenshot is perfect)</li>
            <li>Your OS version (macOS Sonoma 14.5, Windows 11 23H2, etc.)</li>
            <li>What step you got stuck on</li>
          </ul>
          <p className="text-gray-400 text-sm">
            We typically reply within 24 hours. If you&apos;re part of a
            customer team, your manager can also loop us in via your
            support Slack channel.
          </p>
        </section>
      </main>
    </div>
  );
}
