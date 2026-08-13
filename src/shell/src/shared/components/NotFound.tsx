function NotFound() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center p-6"
      data-testid="not-found"
    >
      <div className="w-full max-w-lg text-center">
        <h1 className="font-[var(--font-label)] text-xl font-semibold tracking-tight text-foreground">
          Item not found — or you may not have access
        </h1>
      </div>
    </div>
  );
}

export default NotFound;
