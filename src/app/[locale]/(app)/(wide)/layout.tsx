/**
 * Full frame, no margins: the conversation fills what the sidebar leaves
 * and lays out its own list and writing field inside that. The ordinary
 * page width lives in the (narrow) group beside this one; both sit inside
 * the app layout's sidebar shell.
 */
export default function WideLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {children}
    </main>
  );
}
