export function SnapshotSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      {children}
    </section>
  );
}
