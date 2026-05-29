"use client"

import { useActionState } from "react"
import { signIn } from "@/lib/auth-actions"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

type State = { error?: string }

async function signInAction(_prev: State, formData: FormData): Promise<State> {
  return signIn(formData)
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState<State, FormData>(
    signInAction,
    {}
  )

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and password.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <Input
          name="email"
          type="email"
          placeholder="you@company.com"
          autoComplete="username"
          required
          disabled={isPending}
        />
        <Input
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Signing in..." : "Sign in"}
        </Button>
        {state.error && (
          <p className="text-destructive text-sm">{state.error}</p>
        )}
      </form>
    </div>
  )
}
