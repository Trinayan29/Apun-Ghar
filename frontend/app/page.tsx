export default function Home() {
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold">Rent — Phase 0</h1>
      <p className="mt-2 text-sm text-gray-600">
        Frontend is running. Product UI starts in Phase 1.
      </p>
      <p className="mt-4 text-sm">
        Backend health:{" "}
        <a className="underline" href="http://localhost:8000/healthz">
          localhost:8000/healthz
        </a>
      </p>
    </main>
  );
}
