import Link from "next/link";

interface TeamCardProps {
  team: {
    _id: string;
    name: string;
    createdAt: number;
    closerCount: number;
    lastCallAt: number | null;
    integrations: {
      slack: boolean;
      ghl: boolean;
      hyros: boolean;
      calendly: boolean;
    };
  };
}

export function TeamCard({ team }: TeamCardProps) {
  return (
    <Link
      href={`/founder/${team._id}`}
      className="block rounded border bg-white p-4 hover:border-zinc-400"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{team.name}</h3>
        <span className="text-xs text-muted-foreground">
          {team.closerCount} closer{team.closerCount === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Created {new Date(team.createdAt).toLocaleDateString()} ·{" "}
        Last call{" "}
        {team.lastCallAt ? new Date(team.lastCallAt).toLocaleString() : "never"}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {team.integrations.slack && <Pill>Slack</Pill>}
        {team.integrations.ghl && <Pill>GHL</Pill>}
        {team.integrations.hyros && <Pill>Hyros</Pill>}
        {team.integrations.calendly && <Pill>Calendly</Pill>}
      </div>
    </Link>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
      {children}
    </span>
  );
}
