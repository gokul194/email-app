export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}
