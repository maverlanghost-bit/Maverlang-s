import { NotFoundView } from "@/components/ui/not-found-view";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5">
      <NotFoundView kind="page" />
    </main>
  );
}
