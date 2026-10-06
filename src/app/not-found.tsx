export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">Pinaro Campus</p>
      <h1 className="max-w-md text-2xl font-semibold text-balance">
        Esta plataforma no está disponible
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Revisá el link o contactá a la cámara que te lo compartió.
      </p>
    </main>
  );
}
