import AuthenticatedShell from "@/components/AuthenticatedShell";

export default function AppLayout({ children }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
