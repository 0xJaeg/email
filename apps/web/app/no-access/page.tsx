import { signOut } from "@/lib/auth-actions"
import { Button } from "@workspace/ui/components/button"

export default function NoAccessPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">No access</h1>
      <p className="text-muted-foreground text-sm">
        You&apos;re signed in, but your account isn&apos;t on the ops team yet. Ask an
        admin to add you to the <code>profiles</code> table, then refresh.
      </p>
      <form action={signOut} className="mx-auto">
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  )
}
